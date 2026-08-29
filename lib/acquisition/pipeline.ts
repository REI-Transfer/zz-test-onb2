/**
 * lib/acquisition/pipeline.ts — Orchestrates one listing end to end.
 *
 * Stage order matters for cost: the cheap hard filters and text scoring run first, and
 * the vision call (the only paid step) runs only on listings already close to
 * qualifying. At Tampa/St. Pete new-listing volume that difference is most of the bill.
 */

import { applyVisionResult, assessCondition } from "./condition"
import acquisitionConfig from "./config"
import { renderLoi } from "./loi"
import { computeOffer } from "./offer"
import { estimateRepairs } from "./repairs"
import type { ArvEstimate, EvaluationResult, Listing, OwnershipEnrichment } from "./types"
import { assessPhotos } from "./vision"

/** RESO statuses worth acting on. Pending/withdrawn listings are not buyable. */
const ACTIONABLE_STATUSES = new Set(["Active", "Coming Soon", "ActiveUnderContract"])

const csv = (s: string): string[] => s.split(",").map((v) => v.trim()).filter(Boolean)

/** Hard, free filters. Returns a rejection reason, or null to continue. */
function prefilter(listing: Listing): string | null {
  if (!ACTIONABLE_STATUSES.has(listing.standardStatus)) {
    return `Status "${listing.standardStatus}" is not actionable.`
  }
  if (listing.listPrice > acquisitionConfig.maxListPrice) {
    return `List price $${listing.listPrice.toLocaleString()} exceeds max $${acquisitionConfig.maxListPrice.toLocaleString()}.`
  }
  if (listing.listPrice < acquisitionConfig.minListPrice) {
    return `List price $${listing.listPrice.toLocaleString()} below min $${acquisitionConfig.minListPrice.toLocaleString()}.`
  }

  const counties = csv(acquisitionConfig.allowedCounties)
  if (counties.length && !counties.some((c) => c.toLowerCase() === listing.address.county.toLowerCase())) {
    return `County "${listing.address.county}" is outside the target market.`
  }

  const excluded = csv(acquisitionConfig.excludedZips)
  if (excluded.includes(listing.address.postalCode)) {
    return `ZIP ${listing.address.postalCode} is excluded.`
  }

  return null
}

const rejected = (listing: Listing, reason: string): EvaluationResult => ({
  listingKey: listing.listingKey,
  listingId: listing.listingId,
  decision: "REJECT",
  condition: {
    conditionScore: 0,
    tier: "COSMETIC",
    breakdown: {},
    matchedSignals: [],
    visionApplied: false,
    signalConfidence: 0,
  },
  repairs: { total: 0, perSqft: 0, tier: "COSMETIC", lineItems: {}, sqftKnown: false },
  offer: {
    decision: "REJECT",
    offerPrice: null,
    arv: 0,
    repairs: 0,
    confidence: 0,
    confidenceBreakdown: {},
    reasons: [reason],
  },
  loi: null,
  evaluatedAt: new Date().toISOString(),
})

export type EvaluateInput = {
  listing: Listing
  arv: ArvEstimate
  ownership?: OwnershipEnrichment
  submarketMedianPerSqft?: number
  /** LOIs already auto-sent today, for the daily cap. */
  sentToday?: number
}

export async function evaluateListing({
  listing,
  arv,
  ownership,
  submarketMedianPerSqft,
  sentToday,
}: EvaluateInput): Promise<EvaluationResult> {
  const blocked = prefilter(listing)
  if (blocked) return rejected(listing, blocked)

  let condition = assessCondition({ listing, submarketMedianPerSqft })

  // Only pay for vision when the text score is within striking distance of the bar.
  // The 20-point band is deliberately generous: remarks are often coy about condition,
  // and photos are exactly what catches the dated house with cheerful copy.
  let roofEndOfLife = false
  if (condition.conditionScore >= acquisitionConfig.minConditionScore - 20) {
    const vision = await assessPhotos(listing)
    if (vision) {
      condition = applyVisionResult(condition, vision)
      roofEndOfLife = vision.roofEndOfLife
    }
  }

  const repairs = estimateRepairs({ listing, tier: condition.tier, roofEndOfLife })
  const offer = computeOffer({ listing, condition, repairs, arv, ownership, sentToday })

  return {
    listingKey: listing.listingKey,
    listingId: listing.listingId,
    decision: offer.decision,
    condition,
    repairs,
    offer,
    loi: offer.decision === "REJECT" ? null : renderLoi({ listing, offer, repairs, condition }),
    evaluatedAt: new Date().toISOString(),
  }
}
