/**
 * lib/acquisition/config.ts — Server-side env read point for the outreach pipeline.
 * Same convention as lib/config.ts: read env here, nowhere else. Server-only.
 *
 * CALIBRATION WARNING: every dollar figure below is a placeholder. Repair costs and
 * the offer multiplier are market- and operator-specific; the defaults are plausible
 * Tampa/St. Pete numbers, NOT researched ones. Set these from your own closed-deal
 * history before enabling auto-send, or the pipeline will confidently mail bad offers.
 */

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const acquisitionConfig = {
  // --- Offer formula: offer = (ARV * multiplier) - repairs ---
  offerArvMultiplier: num(process.env.OFFER_ARV_MULTIPLIER, 0.75),

  // --- Repair cost per heated sqft, by condition tier (dollars) ---
  repairCosmeticPerSqft: num(process.env.REPAIR_COSMETIC_PER_SQFT, 18),
  repairModeratePerSqft: num(process.env.REPAIR_MODERATE_PER_SQFT, 40),
  repairHeavyPerSqft:    num(process.env.REPAIR_HEAVY_PER_SQFT, 70),
  repairSeverePerSqft:   num(process.env.REPAIR_SEVERE_PER_SQFT, 105),
  /** Applied on top of base rehab to absorb estimate error. 0.15 = +15%. */
  repairContingencyPct:  num(process.env.REPAIR_CONTINGENCY_PCT, 0.15),
  /** Roof replacement, per sqft of living area. Added when roof reads end-of-life. */
  repairRoofPerSqft:     num(process.env.REPAIR_ROOF_PER_SQFT, 12),
  /** Flat HVAC replacement allowance. */
  repairHvacFlat:        num(process.env.REPAIR_HVAC_FLAT, 9000),
  /** Assumed heated sqft when the feed omits LivingArea. Forces a confidence penalty. */
  fallbackLivingArea:    num(process.env.FALLBACK_LIVING_AREA, 1400),

  // --- Filters ---
  /** Ignore anything above this list price. */
  maxListPrice: num(process.env.MAX_LIST_PRICE, 750_000),
  minListPrice: num(process.env.MIN_LIST_PRICE, 80_000),
  /**
   * Days on market a listing must have accumulated before it is worth mailing.
   *
   * The entire thesis is DATED inventory. On day one the seller is still anchored on
   * list price and their agent has just finished telling them they will get it, so a
   * 75%-of-ARV cash offer arrives at the worst possible moment: it cannot be accepted,
   * and it teaches that agent to file the sender under wholesaler spam before there
   * was ever a deal to lose. Waiting costs nothing. The listing is not going anywhere,
   * and every week it sits makes the same number more interesting.
   *
   * A qualifying price cut overrides this floor — see priceCutEntry() in
   * outreach/sequence.ts. The cut is better evidence than elapsed time.
   */
  minDaysOnMarket: num(process.env.MIN_DAYS_ON_MARKET, 21),
  /**
   * Minimum heated sqft. Below this the rehab arithmetic stops working: the fixed costs
   * of a project — roof, HVAC, permits, holding, the trips — do not shrink with the
   * house, so a 900 sqft rehab carries most of a 1,600 sqft rehab's overhead against a
   * fraction of the resale. Small houses are not small deals, they are thin ones.
   */
  minLivingArea: num(process.env.MIN_LIVING_AREA, 1200),

  /** Condition score at or above this is "dated enough" to pursue. */
  minConditionScore: num(process.env.MIN_CONDITION_SCORE, 45),
  /**
   * Comma-separated RESO CountyOrParish values to include. Empty (the default) means
   * no county gate — statewide. Narrow it to pilot a region; regional cost differences
   * are handled by regions.ts, not by this filter.
   */
  allowedCounties: process.env.ACQ_ALLOWED_COUNTIES ?? "",
  /** Comma-separated ZIPs to exclude (flood-prone, HOA-heavy, whatever you avoid). */
  excludedZips: process.env.ACQ_EXCLUDED_ZIPS ?? "",

  // --- Auto-send confidence gate ---
  /**
   * Composite confidence (0-100) required to send without human review. Anything
   * below routes to REVIEW instead of REJECT — the deal is not dismissed, just held.
   * Set to 0 to auto-send everything that passes the hard guards.
   */
  autoSendMinConfidence: num(process.env.AUTO_SEND_MIN_CONFIDENCE, 70),
  /** Master switch. When false, every qualified listing routes to REVIEW. */
  autoSendEnabled: process.env.AUTO_SEND_ENABLED === "true",
  /** Hard ceiling on automatic LOIs per calendar day. Protects sender reputation. */
  maxAutoSendsPerDay: num(process.env.MAX_AUTO_SENDS_PER_DAY, 25),
  /**
   * Concurrent non-terminal threads allowed per listing agent.
   *
   * The suppression list is keyed per agent email and it works, but it only catches
   * agents who have already asked to be left alone — it is a record of damage already
   * done. VOLUME was never capped. A busy Tampa listing agent holding eight dated
   * listings would receive eight LOIs plus up to twenty-four follow-ups inside
   * fourteen days. That is a complaint, not outreach, and in a market this size the
   * cost lands on every listing that agent takes afterwards.
   *
   * Two live conversations is enough to prove you are worth replying to. The rest of
   * that agent's inventory is not lost, it is queued for review behind the first two.
   */
  maxActiveThreadsPerAgent: num(process.env.MAX_ACTIVE_THREADS_PER_AGENT, 2),
  /**
   * Reject offers below this fraction of list price. An offer at 40% of list is not
   * a negotiation, it is a deliverability problem. Set 0 to disable.
   */
  minOfferRatioOfList: num(process.env.MIN_OFFER_RATIO_OF_LIST, 0.55),

  // --- Vision classifier ---
  visionEnabled: process.env.ACQ_VISION_ENABLED !== "false",
  /** Photos sent to the vision pass. More photos = better signal, higher cost. */
  visionMaxPhotos: num(process.env.ACQ_VISION_MAX_PHOTOS, 8),
  visionModel: process.env.ACQ_VISION_MODEL ?? "claude-opus-5",

  // --- Email negotiation ---
  /** Master switch. When false, every inbound reply escalates to a human. */
  negotiationEnabled: process.env.NEGOTIATION_ENABLED === "true",
  /**
   * Walk-away ceiling as a multiple of ARV, before repairs. Must exceed
   * offerArvMultiplier — the difference IS your negotiating room. At the defaults,
   * offers open at 0.75 x ARV - repairs and can reach 0.80 x ARV - repairs.
   */
  negotiationMaxArvMultiplier: num(process.env.NEGOTIATION_MAX_ARV_MULTIPLIER, 0.80),
  /**
   * Fraction of the remaining gap to concede at each round, comma-separated. Length
   * sets the maximum number of concessions. Shrinking steps signal an approaching
   * floor, which is both true and useful.
   */
  negotiationConcessionSteps: process.env.NEGOTIATION_CONCESSION_STEPS ?? "0.4,0.3,0.2",

  // --- Outreach sequence ---
  /** Master switch for follow-ups. Off means one LOI and silence. */
  outreachSequenceEnabled: process.env.OUTREACH_SEQUENCE_ENABLED === "true",
  /**
   * Minimum list-price cut that re-engages a dormant thread, as a fraction. A $2,000
   * trim on a $400,000 house is not a change of heart; 3% is.
   */
  priceCutMinPct: num(process.env.PRICE_CUT_MIN_PCT, 0.03),

  // --- Call triggers ---
  /**
   * A counter within this fraction ABOVE the authority ceiling is treated as bridgeable
   * by a phone call, and fires a CALL_NOW notification. Default 10%: on a $205k ceiling
   * that is any counter up to about $225k.
   *
   * This is the single highest-leverage number in the file. Too tight and the team
   * never gets called in on deals a five-minute conversation would have closed; too
   * loose and they get paged for counters the ladder would have handled on its own.
   */
  callTriggerBandPct: num(process.env.CALL_TRIGGER_BAND_PCT, 0.10),
  /** Above the call band but inside this fraction gets a same-day human look. */
  reviewTriggerBandPct: num(process.env.REVIEW_TRIGGER_BAND_PCT, 0.25),

  // --- LOI content ---
  buyerEntity:      process.env.LOI_BUYER_ENTITY      ?? "",
  buyerSignerName:  process.env.LOI_SIGNER_NAME       ?? "",
  buyerSignerTitle: process.env.LOI_SIGNER_TITLE      ?? "Acquisitions",
  buyerEmail:       process.env.LOI_REPLY_EMAIL       ?? "",
  buyerPhone:       process.env.LOI_PHONE             ?? "",
  earnestMoney:     num(process.env.LOI_EARNEST_MONEY, 5_000),
  inspectionDays:   num(process.env.LOI_INSPECTION_DAYS, 10),
  closingDays:      num(process.env.LOI_CLOSING_DAYS, 21),
  /** Days the LOI stays open before it self-expires. */
  offerValidDays:   num(process.env.LOI_VALID_DAYS, 5),
  /**
   * Florida licensee disclosure. A licensed agent or broker buying for their own
   * account must disclose licensed status in writing (Fla. Stat. ch. 475). Set the
   * license number to render the disclosure paragraph into every LOI.
   */
  flLicenseNumber:  process.env.LOI_FL_LICENSE_NUMBER ?? "",
} as const

export default acquisitionConfig
export type AcquisitionConfig = typeof acquisitionConfig
