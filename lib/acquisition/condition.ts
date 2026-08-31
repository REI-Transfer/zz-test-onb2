/**
 * lib/acquisition/condition.ts — Is this listing actually dated / as-is?
 *
 * Two independent evidence streams, combined:
 *   1. Remarks NLP  — phrase tables over PublicRemarks + PrivateRemarks (this file)
 *   2. Photo vision — see vision.ts, folded in via applyVisionResult()
 * Plus structured signals (year built, $/sqft vs. submarket, days on market).
 *
 * Scoring is additive and clamped to 0-100. Renovation phrases carry NEGATIVE weight
 * because a "fully renovated" listing is the single most expensive false positive the
 * pipeline can make — it produces an insulting offer on a turnkey house.
 */

import type { ConditionAssessment, ConditionTier, Listing } from "./types"

/** Unambiguous investor language. Presence of any one of these is near-decisive. */
const STRONG_AS_IS: Record<string, number> = {
  "as-is":              22,
  "as is":              22,
  "handyman special":   28,
  "investor special":   28,
  "contractor special": 26,
  "fixer upper":        26,
  "fixer-upper":        26,
  "needs full rehab":   28,
  "gut rehab":          28,
  "tear down":          30,
  "teardown":           30,
  "cash only":          20,
  "cash buyers only":   22,
  "not financeable":    24,
  "value is in the land": 26,
  "value in the lot":   26,
}

/** Suggestive but not decisive. Several together are meaningful; one alone is weak. */
const MODERATE_AS_IS: Record<string, number> = {
  "tlc":                 14,
  "needs work":          16,
  "needs updating":      14,
  "needs some updating": 12,
  "original condition":  18,
  "dated":               12,
  "outdated":            14,
  "bring your vision":   14,
  "bring your imagination": 12,
  "sweat equity":        16,
  "estate sale":         10,
  "probate":             10,
  "no repairs":          14,
  "seller will not make repairs": 18,
  "priced accordingly":  10,
  "priced to sell":       6,
  "handyman":            12,
  "deferred maintenance": 18,
  "water damage":        20,
  "fire damage":         22,
  "mold":                18,
  "vacant":               8,
  "never lived in by owner": 6,
}

/**
 * Renovation language. Negative weights — these SUPPRESS the score.
 * Weak signals (granite, stainless) get small weights because they appear in
 * otherwise-dated homes that got a partial kitchen refresh in 2009.
 */
const RENOVATED: Record<string, number> = {
  "fully renovated":      -30,
  "completely renovated": -30,
  "completely remodeled": -30,
  "newly renovated":      -28,
  "just renovated":       -28,
  "fully remodeled":      -28,
  "turnkey":              -26,
  "turn key":             -26,
  "move-in ready":        -22,
  "move in ready":        -22,
  "new roof":             -16,
  "roof replaced":        -16,
  "new hvac":             -12,
  "new a/c":              -12,
  "new ac":               -12,
  "impact windows":       -12,
  "hurricane impact":     -10,
  "updated kitchen":      -14,
  "remodeled kitchen":    -16,
  "updated bathrooms":    -12,
  "new appliances":       -8,
  "luxury vinyl":         -8,
  "quartz":               -8,
  "granite":              -5,
  "stainless":            -5,
  "smart home":           -6,
  "like new":            -18,
}

/** Escape regex metacharacters so phrases like "new a/c" match literally. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Match a phrase on word boundaries so "tlc" does not fire inside "atlantic" and
 * "dated" does not fire inside "updated" / "outdated" / "consolidated".
 */
function phraseHits(haystack: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(phrase)}([^a-z0-9]|$)`, "i").test(haystack)
}

function scoreTable(text: string, table: Record<string, number>, matched: string[]): number {
  let total = 0
  for (const [phrase, weight] of Object.entries(table)) {
    if (phraseHits(text, phrase)) {
      total += weight
      matched.push(phrase)
    }
  }
  return total
}

/** Age contributes independently of remarks — a 1962 house is dated until proven otherwise. */
function ageScore(yearBuilt: number | undefined): number {
  if (!yearBuilt) return 0
  const age = new Date().getFullYear() - yearBuilt
  if (age >= 60) return 18
  if (age >= 45) return 14
  if (age >= 30) return 9
  if (age >= 20) return 4
  return 0
}

/**
 * A listing priced well under its submarket's $/sqft is telling you something the
 * remarks may not. Requires a median for the ZIP/submarket; skipped when absent.
 */
function priceGapScore(listing: Listing, submarketMedianPerSqft?: number): number {
  const sqft = listing.livingArea
  if (!sqft || !submarketMedianPerSqft || submarketMedianPerSqft <= 0) return 0
  const listingPerSqft = listing.listPrice / sqft
  const ratio = listingPerSqft / submarketMedianPerSqft
  if (ratio <= 0.65) return 20
  if (ratio <= 0.78) return 14
  if (ratio <= 0.88) return 8
  return 0
}

/** Sitting unsold usually means mispriced or in worse shape than the photos suggest. */
function domScore(dom: number | undefined): number {
  if (!dom) return 0
  if (dom >= 120) return 10
  if (dom >= 60) return 6
  if (dom >= 30) return 3
  return 0
}

function tierFor(score: number, matched: string[]): ConditionTier {
  const severe = ["tear down", "teardown", "gut rehab", "needs full rehab", "fire damage", "mold"]
  if (matched.some((m) => severe.includes(m))) return "SEVERE"
  if (score >= 80) return "HEAVY"
  if (score >= 60) return "MODERATE"
  return "COSMETIC"
}

export type ConditionInput = {
  listing: Listing
  /** Median $/sqft for the listing's submarket. Omit to skip the price-gap signal. */
  submarketMedianPerSqft?: number
}

/**
 * Text + structured scoring. Call applyVisionResult() afterward to fold in photos.
 * Kept separate so the pipeline can score cheaply first and only pay for vision on
 * listings that are already plausible.
 */
export function assessCondition({ listing, submarketMedianPerSqft }: ConditionInput): ConditionAssessment {
  const matchedSignals: string[] = []
  // Private remarks are agent-to-agent and far blunter about condition than public
  // remarks, which are marketing copy. Both are scored; neither is weighted higher,
  // because a phrase appearing in both should not double-count beyond its own weight.
  const text = `${listing.publicRemarks ?? ""} ${listing.privateRemarks ?? ""}`.toLowerCase()

  const breakdown = {
    strongAsIs:  scoreTable(text, STRONG_AS_IS, matchedSignals),
    moderateAsIs: scoreTable(text, MODERATE_AS_IS, matchedSignals),
    renovated:   scoreTable(text, RENOVATED, matchedSignals),
    age:         ageScore(listing.yearBuilt),
    priceGap:    priceGapScore(listing, submarketMedianPerSqft),
    daysOnMarket: domScore(listing.daysOnMarket),
  }

  const raw = Object.values(breakdown).reduce((s, n) => s + n, 0)
  const conditionScore = Math.max(0, Math.min(100, raw))

  // Confidence in the TEXT signal specifically: a strong phrase is worth far more
  // than an accumulation of weak ones, and contradictory evidence (both as-is and
  // renovation language present) lowers confidence rather than just cancelling out.
  const hasStrong = breakdown.strongAsIs > 0
  const contradictory = breakdown.renovated < 0 && (breakdown.strongAsIs + breakdown.moderateAsIs) > 0
  let signalConfidence = hasStrong ? 0.8 : breakdown.moderateAsIs >= 26 ? 0.55 : 0.3
  if (contradictory) signalConfidence -= 0.25
  if (!listing.publicRemarks) signalConfidence -= 0.2
  signalConfidence = Math.max(0, Math.min(1, signalConfidence))

  return {
    conditionScore,
    tier: tierFor(conditionScore, matchedSignals),
    breakdown,
    matchedSignals,
    visionApplied: false,
    signalConfidence,
  }
}

/** Structured output of the photo pass. Mirrors the Zod schema in vision.ts. */
export type VisionVerdict = {
  datedScore: number
  tier: ConditionTier
  roofEndOfLife: boolean
  observations: string[]
}

/**
 * Fold the photo verdict into a text-derived assessment.
 *
 * Photos and remarks are weighted 50/50. Remarks can be strategically vague; photos
 * can be strategically flattering (wide angles, staged, or three years stale). Neither
 * is trusted over the other. Agreement between them RAISES confidence more than either
 * stream alone justifies — that agreement is the thing worth acting on.
 */
export function applyVisionResult(base: ConditionAssessment, vision: VisionVerdict): ConditionAssessment {
  // Weight each stream by how much it actually saw, rather than splitting 50/50.
  //
  // The flat split assumed both streams are informative. Measured against 293 live
  // St. Petersburg listings, the text stream is not: its median score is ZERO, because
  // agents in this market write ordinary marketing copy and almost never use the words
  // the scorer looks for. Averaging a real photo verdict against that median halves it.
  //
  // The consequence was not subtle. Twenty-eight properties confirmed dated from their
  // photos — scoring 82, 78, 76 — blended down to 41, 39, 38 and were rejected for
  // "condition below threshold". Every one of them. The engine was not disagreeing with
  // the photos; it was averaging them against silence.
  //
  // A text score of zero means "no keywords matched". It does not mean "the house is
  // renovated". Treating absence of evidence as evidence of absence is the whole bug,
  // and signalConfidence already measures the difference — it sits near 0.3 when the
  // remarks said nothing and near 0.8 when they said something definite.
  //
  // So text earns weight in proportion to what it found, capped at 0.4 so photos stay
  // the senior witness even when the copy is explicit. That ordering is deliberate and
  // matches the module's own premise: remarks are marketing, photos are evidence.
  const textWeight = Math.max(0, Math.min(0.4, base.signalConfidence * 0.5))
  const blended = Math.round(base.conditionScore * textWeight + vision.datedScore * (1 - textWeight))
  const agreement = 1 - Math.abs(base.conditionScore - vision.datedScore) / 100

  return {
    ...base,
    conditionScore: Math.max(0, Math.min(100, blended)),
    // Take the more severe of the two tiers: an unmistakably gutted interior outranks
    // cheerful remarks, and explicit "tear down" language outranks tidy photos.
    tier: severity(vision.tier) > severity(base.tier) ? vision.tier : base.tier,
    breakdown: { ...base.breakdown, vision: vision.datedScore },
    matchedSignals: [...base.matchedSignals, ...vision.observations],
    visionApplied: true,
    signalConfidence: Math.max(0, Math.min(1, base.signalConfidence * 0.5 + agreement * 0.5)),
  }
}

const severity = (t: ConditionTier): number =>
  ({ COSMETIC: 0, MODERATE: 1, HEAVY: 2, SEVERE: 3 })[t]
