/**
 * lib/acquisition/types.ts — Normalized domain types for the agent-outreach pipeline.
 *
 * The `Listing` shape is deliberately RESO Data Dictionary-aligned so a Stellar MLS
 * RESO Web API feed maps field-for-field with no translation layer. Any other source
 * (MLS Grid, Bridge, Trestle) normalizes INTO this shape in its own adapter, so the
 * scoring/offer/LOI stages never learn where the data came from.
 */

/** RESO PropertySubType values we buy. Everything else is filtered out at stage 2. */
export type PropertyKind = "single-family" | "duplex" | "triplex" | "quadplex"

/** Normalized listing — one row out of whatever MLS adapter is in use. */
export type Listing = {
  /** RESO ListingKey — stable per-MLS unique id. Used for dedupe/idempotency. */
  listingKey: string
  /** RESO ListingId — the human MLS number (e.g. "TB8301234"). */
  listingId: string
  kind: PropertyKind
  /** RESO ListPrice, whole dollars. */
  listPrice: number
  /** RESO LivingArea, heated sqft. 0/undefined when the feed omits it. */
  livingArea?: number
  lotSizeSqft?: number
  yearBuilt?: number
  bedrooms?: number
  bathrooms?: number
  address: {
    street: string
    city: string
    /** RESO CountyOrParish — "Hillsborough" | "Pinellas" | ... */
    county: string
    state: string
    postalCode: string
  }
  /** RESO PublicRemarks — the primary text signal for condition. */
  publicRemarks: string
  /** RESO PrivateRemarks (agent-only). Often where "as-is" is stated bluntly. */
  privateRemarks?: string
  /** RESO DaysOnMarket. */
  daysOnMarket?: number
  /** Photo URLs, listing order. Passed to the vision classifier. */
  photos: string[]
  /** Listing agent — the outreach target. */
  listAgent: {
    fullName: string
    email?: string
    phone?: string
    /** RESO ListAgentMlsId. */
    mlsId?: string
    brokerageName?: string
  }
  /** RESO StandardStatus — we only act on Active / Coming Soon. */
  standardStatus: string
  /** ISO timestamp of the feed record's last modification. */
  modificationTimestamp: string
}

/** Ownership/lien facts from DealMachine. All fields optional — the API may not have them. */
export type OwnershipEnrichment = {
  /** Sum of open mortgage balances, whole dollars. */
  estimatedMortgageBalance?: number
  /** Non-mortgage encumbrances (tax liens, judgments, HOA, code liens). */
  otherLiens?: number
  /** Provider's own equity estimate, whole dollars. */
  estimatedEquity?: number
  ownerOccupied?: boolean
  /** Years the current owner has held title. */
  ownershipYears?: number
  /** Provider-flagged distress signals (preforeclosure, tax-delinquent, probate...). */
  distressFlags?: string[]
}

/** One comparable sale used for the ARV estimate. */
export type Comparable = {
  address: string
  soldPrice: number
  soldDate: string
  livingArea: number
  distanceMiles?: number
}

/** ARV estimate plus the evidence behind it — the evidence drives the confidence gate. */
export type ArvEstimate = {
  /** After-repair value, whole dollars. */
  arv: number
  comparables: Comparable[]
  /** Where the number came from. "provider" = vendor's own AVM. */
  source: "comps" | "provider" | "manual"
}

/** How far from original the property presents. Drives the repair tier. */
export type ConditionTier = "COSMETIC" | "MODERATE" | "HEAVY" | "SEVERE"

export type ConditionAssessment = {
  /** 0-100. Higher = more dated / more as-is. */
  conditionScore: number
  tier: ConditionTier
  /** Per-signal contribution, for audit. */
  breakdown: Record<string, number>
  /** Phrases matched in the remarks, for the review queue UI. */
  matchedSignals: string[]
  /** True when a vision pass ran; false means text+structured signals only. */
  visionApplied: boolean
  /** 0-1. Feeds the composite confidence score. */
  signalConfidence: number
}

export type RepairEstimate = {
  /** Whole dollars. */
  total: number
  /** Effective rate after the regional multiplier. */
  perSqft: number
  tier: ConditionTier
  /** Market cost band for the listing's county. See regions.ts. */
  marketTier: string
  /** Regional multiplier applied to the base rate. */
  costMultiplier: number
  /** Named line items (base rehab, roof, HVAC, contingency). */
  lineItems: Record<string, number>
  /** False when livingArea was missing and a fallback sqft was assumed. */
  sqftKnown: boolean
}

/** What the pipeline decided to do with a listing. */
export type Decision = "SEND" | "REVIEW" | "REJECT"

export type OfferResult = {
  decision: Decision
  /** Whole dollars. Null when no defensible offer exists. */
  offerPrice: number | null
  arv: number
  repairs: number
  /** 0-100 composite. Gate for auto-send. */
  confidence: number
  /** Per-component confidence, for audit. */
  confidenceBreakdown: Record<string, number>
  /** Human-readable justification for the decision. Always populated. */
  reasons: string[]
}

export type EvaluationResult = {
  listingKey: string
  listingId: string
  decision: Decision
  condition: ConditionAssessment
  repairs: RepairEstimate
  offer: OfferResult
  /** Rendered LOI. Null when decision is REJECT. */
  loi: { subject: string; body: string; toEmail?: string } | null
  /**
   * 0-100 send priority. At statewide scope more listings qualify than the daily cap
   * allows, so the queue must be worked best-first. See priority.ts.
   */
  priority: number
  evaluatedAt: string
}
