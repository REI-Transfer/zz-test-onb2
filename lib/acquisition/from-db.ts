/**
 * lib/acquisition/from-db.ts — Turn stored rows back into the shapes the engine takes.
 *
 * Both the scorer and the dispatcher need to go from an acq_listings row to a
 * Listing, a condition assessment, a repair estimate and an offer. If each did it
 * its own way, the letter would eventually quote a different number from the one
 * the queue was ordered by, and nobody would notice until an agent asked why the
 * email said $312,000 and the ledger said $309,500.
 *
 * So the reconstruction lives here once.
 *
 * THE TRAP THIS FILE EXISTS TO AVOID
 *
 * acq_listings.condition_score is the TEXT score. acq_listings.vision_score is the
 * PHOTO score. Neither is the number the offer engine gates on -- that is
 * applyVisionResult's blend, and it was never stored. Reading condition_score as
 * the verdict rejects roughly every listing, because agents in this market write
 * ordinary marketing copy and the text score's median is zero. Absence of
 * keywords is not evidence of a renovated house.
 */

import { applyVisionResult, assessCondition, type VisionVerdict } from "./condition"
import { computeOffer } from "./offer"
import { estimateRepairs } from "./repairs"
import { priorityScore } from "./priority"
import type { ArvEstimate, ConditionAssessment, Listing, OfferResult, RepairEstimate } from "./types"

export type ListingRow = {
  zpid: string
  mls_number: string | null
  street: string | null
  city: string | null
  county: string | null
  state: string | null
  postal_code: string | null
  living_area: number | null
  year_built: number | null
  beds: number | null
  baths: number | null
  list_price: number | null
  status: string | null
  days_on_market: number | null
  photo_count: number | null
  condition_score: number | null
  vision_score: number | null
  condition_tier: string | null
  public_remarks: string | null
  agent_name: string | null
  agent_phone: string | null
  brokerage: string | null
  excluded_reason: string | null
  resolved_email: string | null
  email_status: string | null
}

/** The columns from-db needs, so callers cannot silently omit one. */
export const LISTING_COLUMNS = `
  l.zpid, l.mls_number, l.street, l.city, l.county, l.state, l.postal_code,
  l.living_area, l.year_built, l.beds, l.baths, l.list_price, l.status,
  l.days_on_market, l.photo_count, l.condition_score, l.vision_score,
  l.condition_tier, l.public_remarks, l.agent_name, l.agent_phone, l.brokerage,
  l.excluded_reason, a.email as resolved_email, a.email_status
`

export function toListing(r: ListingRow): Listing {
  return {
    listingKey: r.zpid,
    listingId: r.mls_number ?? r.zpid,
    kind: "single-family",
    listPrice: r.list_price ?? 0,
    livingArea: r.living_area ?? undefined,
    yearBuilt: r.year_built ?? undefined,
    bedrooms: r.beds ?? undefined,
    bathrooms: r.baths ?? undefined,
    address: {
      street: r.street ?? "",
      city: r.city ?? "",
      county: r.county ?? "",
      state: r.state ?? "FL",
      postalCode: r.postal_code ?? "",
    },
    publicRemarks: r.public_remarks ?? "",
    daysOnMarket: r.days_on_market ?? undefined,
    photos: [],
    listAgent: {
      fullName: r.agent_name ?? "",
      // Only a verified address is usable. An unverified one bounces, and bounces
      // are the fastest way to lose the sending domain.
      email: r.email_status === "ok" ? (r.resolved_email ?? undefined) : undefined,
      phone: r.agent_phone ?? undefined,
      brokerageName: r.brokerage ?? undefined,
    },
    standardStatus: r.status ?? "",
    modificationTimestamp: new Date().toISOString(),
  }
}

/**
 * Rebuild the blended condition from the stored halves.
 *
 * Vision is never re-run here: it costs money per photo and its verdict is
 * already on the row. When there is no photo verdict the text assessment stands
 * alone, and the offer engine holds it for review on exactly that basis.
 */
export function toCondition(r: ListingRow, listing: Listing): ConditionAssessment {
  const base = assessCondition({ listing })
  if (r.vision_score === null) return base
  return applyVisionResult(base, {
    datedScore: r.vision_score,
    tier: (r.condition_tier as VisionVerdict["tier"]) ?? base.tier,
    roofEndOfLife: r.condition_tier === "SEVERE",
    observations: [],
  })
}

export type Scored = {
  row: ListingRow
  listing: Listing
  condition: ConditionAssessment
  repairs: RepairEstimate
  offer: OfferResult
  arv: number
  priority: number
}

export type ScoreOptions = {
  /** Renovated dollars per heated foot, by ZIP. */
  psf: Map<string, number>
  /** Used when the ZIP is not in the map. Should be the median of what is. */
  psfFallback: number
}

/** Null when the row cannot produce a defensible offer, with the reason. */
export function scoreRow(
  r: ListingRow,
  { psf, psfFallback }: ScoreOptions,
): Scored | { skipped: string } {
  if (r.excluded_reason) return { skipped: r.excluded_reason }

  const listing = toListing(r)
  const condition = toCondition(r, listing)
  const repairs = estimateRepairs({
    listing,
    tier: condition.tier,
    roofEndOfLife: condition.tier === "SEVERE",
  })

  const rate = psf.get(listing.address.postalCode) ?? psfFallback
  const arvValue = Math.round(rate * (listing.livingArea ?? 0))
  if (!arvValue) {
    // No living area means no ARV and so no offer. Recorded as a skip rather than
    // scored at zero, which would read as a rejection the house had earned.
    return { skipped: "no living area, ARV cannot be computed" }
  }

  const arv: ArvEstimate = { arv: arvValue, comparables: [], source: "comps" }
  const offer = computeOffer({ listing, condition, repairs, arv })
  return { row: r, listing, condition, repairs, offer, arv: arvValue, priority: priorityScore({ listing, offer }) }
}

export const isScored = (v: Scored | { skipped: string }): v is Scored => !("skipped" in v)

/**
 * Which A/B arm a listing belongs to.
 *
 * Derived from the listing key rather than drawn at random, so a re-run puts a
 * listing back in the arm it was already in. A random assignment would reshuffle
 * the arms on every scoring pass and quietly destroy the comparison.
 */
export function templateVariant(listingKey: string): string {
  const variants = ["v1-plain", "v2-terms", "v3-question"]
  const sum = [...listingKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return variants[sum % variants.length]
}
