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
import { priceCutEntry, type PriceCutEntry } from "./outreach/sequence"
import { priorityScore } from "./priority"
import { estimateRepairs } from "./repairs"
import type { ArvEstimate, EvaluationResult, Listing, OwnershipEnrichment } from "./types"
import { assessPhotos } from "./vision"

/** RESO statuses worth acting on. Pending/withdrawn listings are not buyable. */
const ACTIONABLE_STATUSES = new Set(["Active", "Coming Soon", "ActiveUnderContract"])

/**
 * The buy box, asserted at runtime. PropertyKind already excludes condos, townhomes,
 * mobile and manufactured homes, but a TypeScript union vanishes at runtime and the
 * failure it cannot catch is an adapter mis-mapping a condo onto "single-family". That
 * mistake does not surface as a type error, it surfaces as a cash offer on a condo
 * sitting in a listing agent's inbox. Cheap to assert; expensive to discover.
 */
const BUYABLE_KINDS = new Set(["single-family", "duplex", "triplex", "quadplex"])

const csv = (s: string): string[] => s.split(",").map((v) => v.trim()).filter(Boolean)

/** Hard, free filters. Returns a rejection reason, or null to continue. */
function prefilter(listing: Listing, priceCut: PriceCutEntry): string | null {
  if (!ACTIONABLE_STATUSES.has(listing.standardStatus)) {
    return `Status "${listing.standardStatus}" is not actionable.`
  }
  if (listing.listPrice > acquisitionConfig.maxListPrice) {
    return `List price $${listing.listPrice.toLocaleString()} exceeds max $${acquisitionConfig.maxListPrice.toLocaleString()}.`
  }
  if (listing.listPrice < acquisitionConfig.minListPrice) {
    return `List price $${listing.listPrice.toLocaleString()} below min $${acquisitionConfig.minListPrice.toLocaleString()}.`
  }

  // Age on market is a hard filter, not a ranking input. Nothing gated on it before —
  // priority.ts used days on market only to ORDER the queue — so a listing that hit
  // the MLS this morning could be mailed this afternoon, which is the one day of its
  // life a below-list cash offer cannot land. It runs here, in the free filters,
  // because rejecting a fresh listing before the paid vision pass is the difference
  // between a filter and an expensive one.
  //
  // A qualifying price cut skips the floor: the seller has already told you the price
  // was wrong, which is better evidence than the calendar was ever going to give you.
  //
  // Unknown days on market counts as day zero. "We do not know how long it has sat" is
  // not evidence that it has sat, and the failure mode of assuming otherwise is mailing
  // fresh inventory at volume — silently, and to the people whose opinion of the sender
  // is the asset.
  if (!priceCut.qualifies) {
    const dom = listing.daysOnMarket ?? 0
    if (dom < acquisitionConfig.minDaysOnMarket) {
      return `Day ${dom} on market, below the ${acquisitionConfig.minDaysOnMarket}-day floor — the seller is still anchored on list price.`
    }
  }

  if (!BUYABLE_KINDS.has(listing.kind)) {
    return `Property kind "${listing.kind}" is outside the buy box.`
  }

  // Size floor. Note what this deliberately does NOT do: reject a listing whose sqft is
  // missing. fallbackLivingArea assumes 1,400 when the feed omits LivingArea, so an
  // unknown-size house would clear a 1,200 floor on a number nobody measured — and sqft
  // is the multiplier the entire repair estimate hangs on, so passing it on an
  // assumption is worse here than anywhere else in the pipeline. Missing sqft already
  // carries its own confidence penalty (sqftKnown: false), which holds the listing for
  // REVIEW instead of sending it. A person confirms the number; the pipeline never
  // invents one and then mails an offer built on it.
  if (listing.livingArea !== undefined && listing.livingArea < acquisitionConfig.minLivingArea) {
    return `${listing.livingArea} sqft is below the ${acquisitionConfig.minLivingArea} sqft floor.`
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
  repairs: { total: 0, perSqft: 0, tier: "COSMETIC", marketTier: "STANDARD", costMultiplier: 1, lineItems: {}, sqftKnown: false },
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
  priority: 0,
  evaluatedAt: new Date().toISOString(),
})

export type EvaluateInput = {
  listing: Listing
  arv: ArvEstimate
  ownership?: OwnershipEnrichment
  submarketMedianPerSqft?: number
  /** LOIs already auto-sent today, for the daily cap. */
  sentToday?: number
  /**
   * Last list price we recorded for this listing, from acq_sequences or the previous
   * feed poll. A cut below it is an entry trigger — see priceCutEntry().
   */
  previousListPrice?: number
  /** Non-terminal threads already open with this listing agent, for the per-agent cap. */
  activeThreadsForAgent?: number
}

export async function evaluateListing({
  listing,
  arv,
  ownership,
  submarketMedianPerSqft,
  sentToday,
  previousListPrice,
  activeThreadsForAgent,
}: EvaluateInput): Promise<EvaluationResult> {
  // Resolved before the prefilter because it can waive the days-on-market floor, and
  // read again at the end because it also decides where the listing lands in the queue.
  const priceCut = priceCutEntry({
    currentListPrice: listing.listPrice,
    previousListPrice,
  })

  const blocked = prefilter(listing, priceCut)
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
  const offer = computeOffer({ listing, condition, repairs, arv, ownership, sentToday, activeThreadsForAgent })

  return {
    listingKey: listing.listingKey,
    listingId: listing.listingId,
    decision: offer.decision,
    condition,
    repairs,
    offer,
    loi: offer.decision === "REJECT" ? null : renderLoi({ listing, offer, repairs, condition }),
    priority: priorityScore({ listing, offer, priceCut }),
    evaluatedAt: new Date().toISOString(),
  }
}
