/**
 * lib/acquisition/offer.ts — Offer math and the auto-send gate.
 *
 *     offer = (ARV * OFFER_ARV_MULTIPLIER) - repairs        [default multiplier 0.75]
 *
 * The arithmetic is trivial. The value of this module is everything around it: the
 * hard guards that stop a structurally bad offer from being mailed, and the confidence
 * score that decides whether a merely uncertain one goes to a human first.
 *
 * Decision semantics:
 *   SEND   — passes every hard guard AND clears the confidence threshold
 *   REVIEW — economically plausible but under-evidenced; queued for a human
 *   REJECT — fails a hard guard; no offer exists worth making
 *
 * REVIEW is never a soft REJECT. A held deal is still a deal.
 */

import acquisitionConfig from "./config"
import type { ArvEstimate, ConditionAssessment, Listing, OfferResult, OwnershipEnrichment, RepairEstimate } from "./types"

/** Coefficient of variation of comp $/sqft. Tight clusters mean a trustworthy ARV. */
function compDispersion(arv: ArvEstimate): number | null {
  const rates = arv.comparables
    .filter((c) => c.livingArea > 0)
    .map((c) => c.soldPrice / c.livingArea)
  if (rates.length < 2) return null

  const mean = rates.reduce((s, n) => s + n, 0) / rates.length
  if (mean <= 0) return null
  const variance = rates.reduce((s, n) => s + (n - mean) ** 2, 0) / rates.length
  return Math.sqrt(variance) / mean
}

/**
 * Composite 0-100 confidence. Each component is scored 0-1, then weighted.
 * These weights encode a judgement: ARV quality dominates, because an ARV error
 * propagates directly into the offer at full magnitude, while a condition
 * misread is partially absorbed by the inspection contingency.
 */
function scoreConfidence(
  condition: ConditionAssessment,
  repairs: RepairEstimate,
  arv: ArvEstimate,
): { confidence: number; breakdown: Record<string, number> } {
  const compCount = arv.comparables.length
  const compCountScore = compCount >= 6 ? 1 : compCount >= 4 ? 0.75 : compCount >= 2 ? 0.45 : arv.source === "provider" ? 0.4 : 0.15

  const dispersion = compDispersion(arv)
  // <10% spread is a tight comp set; >35% means the "comps" are not comparable.
  const dispersionScore = dispersion === null ? 0.4 : dispersion <= 0.10 ? 1 : dispersion <= 0.20 ? 0.75 : dispersion <= 0.35 ? 0.4 : 0.1

  // How far above the qualifying threshold the condition read sits. A listing that
  // barely clears the bar is exactly the one a human should look at.
  const margin = (condition.conditionScore - acquisitionConfig.minConditionScore) / 40
  const marginScore = Math.max(0, Math.min(1, margin))

  const breakdown = {
    compCount: compCountScore,
    compDispersion: dispersionScore,
    conditionSignal: condition.signalConfidence,
    conditionMargin: marginScore,
    visionApplied: condition.visionApplied ? 1 : 0.35,
    sqftKnown: repairs.sqftKnown ? 1 : 0.2,
  }

  const weights = {
    compCount: 0.22,
    compDispersion: 0.20,
    conditionSignal: 0.20,
    conditionMargin: 0.12,
    visionApplied: 0.13,
    sqftKnown: 0.13,
  }

  const weighted = (Object.keys(weights) as (keyof typeof weights)[])
    .reduce((s, k) => s + breakdown[k] * weights[k], 0)

  return { confidence: Math.round(weighted * 100), breakdown }
}

export type OfferInput = {
  listing: Listing
  condition: ConditionAssessment
  repairs: RepairEstimate
  arv: ArvEstimate
  ownership?: OwnershipEnrichment
  /** LOIs already auto-sent today. Enforces the daily reputation cap. */
  sentToday?: number
}

export function computeOffer({
  listing,
  condition,
  repairs,
  arv,
  ownership,
  sentToday = 0,
}: OfferInput): OfferResult {
  const reasons: string[] = []
  const { confidence, confidenceBreakdown } = (() => {
    const r = scoreConfidence(condition, repairs, arv)
    return { confidence: r.confidence, confidenceBreakdown: r.breakdown }
  })()

  const offerPrice = Math.round(arv.arv * acquisitionConfig.offerArvMultiplier - repairs.total)

  const reject = (reason: string): OfferResult => ({
    decision: "REJECT",
    offerPrice: null,
    arv: arv.arv,
    repairs: repairs.total,
    confidence,
    confidenceBreakdown,
    reasons: [...reasons, reason],
  })

  // --- Hard guards: structural reasons no offer should be made at all ---

  if (condition.conditionScore < acquisitionConfig.minConditionScore) {
    return reject(
      `Condition score ${condition.conditionScore} below threshold ${acquisitionConfig.minConditionScore} — property does not read as dated/as-is.`,
    )
  }

  if (arv.arv <= 0) {
    return reject("No usable ARV — cannot compute an offer.")
  }

  if (offerPrice <= 0) {
    return reject(
      `Repairs ($${repairs.total.toLocaleString()}) exceed ${acquisitionConfig.offerArvMultiplier * 100}% of ARV ($${arv.arv.toLocaleString()}) — no positive offer exists.`,
    )
  }

  if (acquisitionConfig.minOfferRatioOfList > 0) {
    const ratio = offerPrice / listing.listPrice
    if (ratio < acquisitionConfig.minOfferRatioOfList) {
      return reject(
        `Offer $${offerPrice.toLocaleString()} is ${Math.round(ratio * 100)}% of list $${listing.listPrice.toLocaleString()}, below the ${Math.round(acquisitionConfig.minOfferRatioOfList * 100)}% floor — too far apart to be worth sending.`,
      )
    }
  }

  // --- Soft guards: plausible, but a human should look ---

  let holdForReview = false
  const hold = (reason: string) => {
    holdForReview = true
    reasons.push(reason)
  }

  // The single most valuable enrichment check. If the offer cannot clear what is owed,
  // the seller physically cannot accept it without lender approval.
  const liens = (ownership?.estimatedMortgageBalance ?? 0) + (ownership?.otherLiens ?? 0)
  if (liens > 0 && offerPrice < liens) {
    hold(
      `Offer $${offerPrice.toLocaleString()} is below estimated encumbrances $${liens.toLocaleString()} — would require a short sale.`,
    )
  }

  // An offer at or above list means the ARV is almost certainly overstated: a genuinely
  // dated house priced below its own after-repair value net of rehab is very rare.
  if (offerPrice >= listing.listPrice) {
    hold(
      `Computed offer $${offerPrice.toLocaleString()} meets or exceeds list price $${listing.listPrice.toLocaleString()} — ARV likely overstated.`,
    )
  }

  if (!repairs.sqftKnown) {
    hold("Living area missing from the feed; repair budget uses the fallback square footage.")
  }

  if (!condition.visionApplied) {
    hold("Photo assessment unavailable; condition rests on listing text alone.")
  }

  if (!listing.listAgent.email) {
    hold("No listing agent email in the feed — cannot deliver automatically.")
  }

  // --- Send gate ---

  if (!acquisitionConfig.autoSendEnabled) {
    hold("AUTO_SEND_ENABLED is not set to \"true\"; all offers route to review.")
  }

  if (sentToday >= acquisitionConfig.maxAutoSendsPerDay) {
    hold(
      `Daily auto-send cap reached (${sentToday}/${acquisitionConfig.maxAutoSendsPerDay}); queued rather than sent.`,
    )
  }

  if (confidence < acquisitionConfig.autoSendMinConfidence) {
    hold(
      `Confidence ${confidence} below auto-send threshold ${acquisitionConfig.autoSendMinConfidence}.`,
    )
  }

  if (!holdForReview) {
    reasons.push(`Cleared all guards at confidence ${confidence}.`)
  }

  return {
    decision: holdForReview ? "REVIEW" : "SEND",
    offerPrice,
    arv: arv.arv,
    repairs: repairs.total,
    confidence,
    confidenceBreakdown,
    reasons,
  }
}
