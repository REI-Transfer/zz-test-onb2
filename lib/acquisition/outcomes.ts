/**
 * lib/acquisition/outcomes.ts — The feedback loop.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 *
 * This is a calibration loop, not a learning system. It logs every prediction, joins
 * it to what actually happened, measures the error, and PROPOSES bounded config
 * changes for a human to approve. It never applies them.
 *
 * That restraint is a statistical judgement, not timidity. Consider the volume: at 25
 * LOIs a day you see roughly 500 sends, ~25-40 replies, and 1-3 contracts a month.
 * Repair-cost ground truth arrives months later, a handful of samples at a time.
 * Fitting anything to 2 closings a month does not learn the market — it chases noise,
 * and the specific failure mode is a multiplier that ratchets upward after a couple of
 * lucky deals until the pipeline is systematically overpaying. The offer multiplier is
 * therefore excluded from proposals entirely; see OFFER_MULTIPLIER_IS_NOT_TUNABLE.
 *
 * What DOES work at this volume, in descending order of signal quality:
 *
 *   1. Repair-estimate calibration against real invoices. Ground truth is exact, and
 *      even 8-10 completed rehabs reveal a systematic bias worth correcting.
 *   2. Condition-classifier calibration against walked properties. Cheap and fast —
 *      you learn the model's bias every time you set foot in a house.
 *   3. Agent replies as free labels. "Roof was done in 2023" is a human correcting
 *      your condition read at no cost. Mine these; they are the highest-volume
 *      ground truth you have.
 *   4. Email A/B on reply rate. Enough events to be worth running QUARTERLY. Monthly
 *      comparisons at this volume are underpowered — see requiredSampleForLift().
 */

import type { ConditionTier, Decision } from "./types"

/** What the pipeline believed at the moment it decided. Written on every evaluation. */
export type PredictionRecord = {
  listingKey: string
  listingId: string
  decidedAt: string
  decision: Decision
  predictedTier: ConditionTier
  conditionScore: number
  predictedRepairs: number
  predictedArv: number
  offerPrice: number | null
  confidence: number
  livingArea?: number
  /** Which LOI template variant was used, for A/B. */
  templateVariant?: string
}

/** What actually happened. Fields arrive at very different latencies — days to months. */
export type OutcomeRecord = {
  listingKey: string
  /** Days: did the listing agent reply at all? */
  replied?: boolean
  repliedAt?: string
  /** Days-weeks: did they counter, and at what? */
  counterPrice?: number
  /** Weeks: did it go under contract, and at what price? */
  contractPrice?: number
  /** Months: what did the rehab actually cost? The only exact ground truth here. */
  actualRepairCost?: number
  /** Months: what did it actually resell or appraise for? */
  actualResaleValue?: number
  /** Set after a walkthrough. The cheapest, fastest label available. */
  observedTier?: ConditionTier
  /** Free labels mined from agent replies (see classify.ts newFacts). */
  correctionsFromAgent?: string[]
}

export type JoinedRecord = PredictionRecord & { outcome?: OutcomeRecord }

/** A proposed config change. Never applied automatically. */
export type Proposal = {
  envVar: string
  currentValue: number
  proposedValue: number
  sampleSize: number
  rationale: string
  /** False when the sample is too small to act on; shown but flagged. */
  actionable: boolean
}

/** Minimum completed rehabs before a repair-rate proposal is considered actionable. */
const MIN_SAMPLES_REPAIR = 8
/** Minimum walked properties before a condition-bias proposal is actionable. */
const MIN_SAMPLES_CONDITION = 15
/** Never move a rate by more than this fraction in one step, regardless of the error. */
const MAX_ADJUSTMENT_STEP = 0.20

const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0)

/**
 * Sample size per arm needed to detect a lift in a binary rate at 80% power, alpha .05
 * (normal approximation). Exists to be called before anyone claims an A/B test "won".
 *
 * Worked example at realistic volume: baseline reply rate 5%, hoping for 7%. This
 * returns ~1,700 per arm. At 500 sends a month that is roughly seven months of mail
 * per arm. Run subject-line tests quarterly, or not at all — do not act on a month.
 */
export function requiredSampleForLift(baselineRate: number, targetRate: number): number {
  if (baselineRate <= 0 || targetRate <= baselineRate || targetRate >= 1) return Infinity
  const pBar = (baselineRate + targetRate) / 2
  const delta = targetRate - baselineRate
  // (z_alpha/2 + z_beta)^2 = (1.96 + 0.84)^2 ≈ 7.849
  return Math.ceil((7.849 * 2 * pBar * (1 - pBar)) / (delta * delta))
}

/** Wilson score interval — honest at the small counts this pipeline actually produces. */
export function wilsonInterval(successes: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 1 }
  const z = 1.96
  const p = successes / total
  const denom = 1 + (z * z) / total
  const centre = p + (z * z) / (2 * total)
  const spread = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))
  return { low: Math.max(0, (centre - spread) / denom), high: Math.min(1, (centre + spread) / denom) }
}

export type CalibrationReport = {
  generatedAt: string
  totalPredictions: number
  /** Reply rate with an interval, because the point estimate alone invites bad calls. */
  replyRate: ReplyRateSummary | null
  repairBiasByTier: Record<string, { meanRatio: number; samples: number }>
  conditionAccuracy: { exact: number; withinOneTier: number; samples: number } | null
  arvBias: { meanRatio: number; samples: number } | null
  proposals: Proposal[]
  warnings: string[]
}

export type ReplyRateSummary = {
  rate: number
  /** Wilson 95% bounds. */
  low: number
  high: number
  sent: number
  replied: number
}

/**
 * Build the calibration report. Pure — takes records, returns findings and proposals.
 * Nothing here writes config; wiring a proposal into env is a human decision.
 */
export function calibrate(
  records: JoinedRecord[],
  currentRates: { cosmetic: number; moderate: number; heavy: number; severe: number },
): CalibrationReport {
  const warnings: string[] = []
  const proposals: Proposal[] = []

  const sent = records.filter((r) => r.decision === "SEND")
  const replied = sent.filter((r) => r.outcome?.replied)
  const replyRate =
    sent.length > 0
      ? { rate: replied.length / sent.length, ...wilsonInterval(replied.length, sent.length), sent: sent.length, replied: replied.length }
      : null

  if (replyRate && sent.length < 200) {
    warnings.push(
      `Reply rate is based on ${sent.length} sends; the 95% interval spans ${(replyRate.low * 100).toFixed(1)}%-${(replyRate.high * 100).toFixed(1)}%. Too wide to compare template variants yet.`,
    )
  }

  // --- Repair calibration: the highest-quality signal available ---
  const repairBiasByTier: Record<string, { meanRatio: number; samples: number }> = {}
  const tiers: ConditionTier[] = ["COSMETIC", "MODERATE", "HEAVY", "SEVERE"]

  for (const tier of tiers) {
    const withActuals = records.filter(
      (r) => r.predictedTier === tier && r.outcome?.actualRepairCost && r.predictedRepairs > 0,
    )
    if (withActuals.length === 0) continue

    const ratios = withActuals.map((r) => r.outcome!.actualRepairCost! / r.predictedRepairs)
    const meanRatio = mean(ratios)
    repairBiasByTier[tier] = { meanRatio, samples: withActuals.length }

    const key = tier.toLowerCase() as keyof typeof currentRates
    const current = currentRates[key]
    // Move toward the observed ratio, clamped — a 2x observed miss adjusts 20%, not 100%.
    const uncapped = current * meanRatio
    const capped = Math.min(current * (1 + MAX_ADJUSTMENT_STEP), Math.max(current * (1 - MAX_ADJUSTMENT_STEP), uncapped))
    const actionable = withActuals.length >= MIN_SAMPLES_REPAIR && Math.abs(meanRatio - 1) > 0.08

    if (Math.abs(meanRatio - 1) > 0.08) {
      proposals.push({
        envVar: `REPAIR_${tier}_PER_SQFT`,
        currentValue: current,
        proposedValue: Math.round(capped),
        sampleSize: withActuals.length,
        rationale: `Actual rehab cost averaged ${meanRatio.toFixed(2)}x the estimate across ${withActuals.length} completed job(s). Adjustment clamped to ${MAX_ADJUSTMENT_STEP * 100}% per cycle.`,
        actionable,
      })
      if (!actionable) {
        warnings.push(`${tier}: only ${withActuals.length} completed rehab(s); need ${MIN_SAMPLES_REPAIR} before acting on this.`)
      }
    }
  }

  // --- Condition classifier vs. what you saw when you walked it ---
  const walked = records.filter((r) => r.outcome?.observedTier)
  const conditionAccuracy =
    walked.length > 0
      ? {
          exact: walked.filter((r) => r.outcome!.observedTier === r.predictedTier).length / walked.length,
          withinOneTier:
            walked.filter(
              (r) => Math.abs(tiers.indexOf(r.outcome!.observedTier!) - tiers.indexOf(r.predictedTier)) <= 1,
            ).length / walked.length,
          samples: walked.length,
        }
      : null

  if (conditionAccuracy && walked.length < MIN_SAMPLES_CONDITION) {
    warnings.push(`Condition accuracy is based on ${walked.length} walked propert(ies); ${MIN_SAMPLES_CONDITION} is the minimum worth reading into.`)
  }

  // --- ARV: the input the offer is most sensitive to ---
  const withResale = records.filter((r) => r.outcome?.actualResaleValue && r.predictedArv > 0)
  const arvBias =
    withResale.length > 0
      ? { meanRatio: mean(withResale.map((r) => r.outcome!.actualResaleValue! / r.predictedArv)), samples: withResale.length }
      : null

  if (arvBias && Math.abs(arvBias.meanRatio - 1) > 0.05) {
    warnings.push(
      `ARV estimates are running ${arvBias.meanRatio > 1 ? "low" : "high"} by ${Math.abs((arvBias.meanRatio - 1) * 100).toFixed(1)}% across ${arvBias.samples} resale(s). Fix the comp source rather than compensating with the offer multiplier.`,
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    totalPredictions: records.length,
    replyRate,
    repairBiasByTier,
    conditionAccuracy,
    arvBias,
    proposals,
    warnings,
  }
}

/**
 * OFFER_MULTIPLIER_IS_NOT_TUNABLE
 *
 * There is no proposal path for OFFER_ARV_MULTIPLIER or NEGOTIATION_MAX_ARV_MULTIPLIER,
 * and this is intentional.
 *
 * Those two constants are not estimates of anything measurable — they encode a business
 * decision about the margin required per deal. The only outcome signal that could
 * "optimize" them is acceptance rate, and acceptance rate rises monotonically as you
 * pay more. An optimizer pointed at it converges on paying full price, having correctly
 * maximized the metric it was given. Every accepted offer is evidence the number worked,
 * which is exactly the feedback that would ratchet it upward.
 *
 * Raise them because you decided to accept thinner margin. Never because a model noticed
 * that higher offers get accepted more often.
 */
