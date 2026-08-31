/**
 * scripts/verify-acquisition.ts — Smoke test for the acquisition pipeline's guards.
 *
 * Run:  npx tsx scripts/verify-acquisition.ts
 *
 * Exercises the decision boundaries that matter most, with the vision pass disabled so
 * it needs no API key and no network. These are the cases where a regression would mail
 * a bad offer, so they are worth re-running after any change to condition/offer weights.
 */

process.env.ACQ_VISION_ENABLED = "false"
process.env.AUTO_SEND_ENABLED = "true"
process.env.AUTO_SEND_MIN_CONFIDENCE = "50"
process.env.LOI_BUYER_ENTITY = "Bay Area Property Partners LLC"
process.env.LOI_SIGNER_NAME = "William"
process.env.LOI_FL_LICENSE_NUMBER = "SL1234567"

async function main() {
  const { evaluateListing } = await import("../lib/acquisition/pipeline")
  type Listing = import("../lib/acquisition/types").Listing

  const baseListing = (over: Partial<Listing> = {}): Listing => ({
    listingKey: "STELLAR-1",
    listingId: "TB8300001",
    kind: "single-family",
    listPrice: 300_000,
    livingArea: 1_500,
    yearBuilt: 1968,
    address: {
      street: "123 Palm Ave",
      city: "St. Petersburg",
      county: "Pinellas",
      state: "FL",
      postalCode: "33710",
    },
    publicRemarks: "Sold as-is. Handyman special, needs work throughout. Cash only.",
    photos: [],
    listAgent: { fullName: "Dana Reyes", email: "dana@example.com" },
    standardStatus: "Active",
    modificationTimestamp: new Date().toISOString(),
    daysOnMarket: 40,
    ...over,
  })

  const goodComps = {
    arv: 420_000,
    source: "comps" as const,
    comparables: Array.from({ length: 6 }, (_, i) => ({
      address: `${100 + i} Comp St`,
      soldPrice: 415_000 + i * 3_000,
      soldDate: "2026-06-01",
      livingArea: 1_480 + i * 20,
    })),
  }

  const cases: { name: string; expect: string; run: () => Promise<any> }[] = [
    {
      // REVIEW, not SEND: this run has vision disabled, and an unverified-by-photos
      // condition read always holds. Disabling vision therefore disables auto-send
      // entirely, which is the intended safety property.
      name: "Dated as-is SFH, tight comps",
      expect: "REVIEW",
      run: () => evaluateListing({ listing: baseListing(), arv: goodComps }),
    },
    {
      name: "Fully renovated turnkey",
      expect: "REJECT",
      run: () =>
        evaluateListing({
          listing: baseListing({
            publicRemarks:
              "Completely renovated! Turnkey, new roof, updated kitchen with quartz and stainless. Move-in ready.",
            yearBuilt: 2015,
            // Comfortably over MIN_DAYS_ON_MARKET so this case still exercises the
            // condition scorer. At its original 3 days it would now reject in the
            // prefilter and stop testing anything about renovated properties.
            daysOnMarket: 30,
          }),
          arv: goodComps,
        }),
    },
    {
      name: "Repairs exceed 75% of ARV",
      expect: "REJECT",
      run: () =>
        evaluateListing({
          listing: baseListing({
            publicRemarks: "Tear down. Fire damage throughout, value is in the land.",
            livingArea: 3_000,
          }),
          arv: { ...goodComps, arv: 150_000 },
        }),
    },
    {
      name: "Offer below encumbrances (short sale)",
      expect: "REVIEW",
      run: () =>
        evaluateListing({
          listing: baseListing(),
          arv: goodComps,
          ownership: { estimatedMortgageBalance: 280_000, otherLiens: 15_000 },
        }),
    },
    {
      name: "Thin comp set lowers confidence",
      expect: "REVIEW",
      run: () =>
        evaluateListing({
          listing: baseListing(),
          arv: { arv: 420_000, source: "provider", comparables: [] },
        }),
    },
    {
      // Statewide is now the default (ACQ_ALLOWED_COUNTIES empty), so South Florida is
      // in scope. Priced to the market: a Tampa list price with Miami-Dade rehab costs
      // correctly fails the offer-to-list floor, which is the bands working, not a bug.
      name: "Miami-Dade in scope statewide",
      expect: "REVIEW",
      run: () =>
        evaluateListing({
          listing: baseListing({
            listPrice: 550_000,
            address: { ...baseListing().address, county: "Miami-Dade", city: "Miami" },
          }),
          arv: { ...goodComps, arv: 750_000 },
        }),
    },
    {
      // Nothing gated on days on market before: priority.ts used it only to order the
      // queue, so a listing that hit the MLS this morning could be mailed this
      // afternoon — the one day of its life a below-list cash offer cannot land.
      // --- buy box -------------------------------------------------------
      // The type union already excludes these, but the union is compile-time only and
      // the adapter is the layer most likely to get it wrong.
      name: "Condo is outside the buy box",
      expect: "REJECT",
      run: () => evaluateListing({ listing: baseListing({ kind: "condo" as never }), arv: goodComps }),
    },
    {
      name: "Mobile home is outside the buy box",
      expect: "REJECT",
      run: () => evaluateListing({ listing: baseListing({ kind: "mobile-home" as never }), arv: goodComps }),
    },
    {
      name: "Quadplex is inside the buy box",
      expect: "REVIEW",
      run: () => evaluateListing({ listing: baseListing({ kind: "quadplex" }), arv: goodComps }),
    },
    {
      name: "1,100 sqft is below the size floor",
      expect: "REJECT",
      run: () => evaluateListing({ listing: baseListing({ livingArea: 1100 }), arv: goodComps }),
    },
    {
      name: "1,200 sqft sits exactly on the floor and passes",
      expect: "REVIEW",
      run: () => evaluateListing({ listing: baseListing({ livingArea: 1200 }), arv: goodComps }),
    },
    {
      // The deliberate asymmetry with the DOM floor: unknown DOM rejects, unknown sqft
      // does NOT. fallbackLivingArea would clear the floor on a number nobody measured,
      // and sqft drives the whole repair estimate — so it is held, not mailed, not binned.
      name: "Missing sqft is held for review, never auto-rejected on the floor",
      expect: "REVIEW",
      run: () => evaluateListing({ listing: baseListing({ livingArea: undefined }), arv: goodComps }),
    },
    {
      name: "Fresh listing below the DOM floor",
      expect: "REJECT",
      run: () => evaluateListing({ listing: baseListing({ daysOnMarket: 4 }), arv: goodComps }),
    },
    {
      // Unknown reads as day zero. Not knowing how long it has sat is not evidence
      // that it has sat.
      name: "Missing days on market reads as day 0",
      expect: "REJECT",
      run: () => evaluateListing({ listing: baseListing({ daysOnMarket: undefined }), arv: goodComps }),
    },
    {
      // The exemption: a 9% cut in week one is better evidence than three quiet weeks,
      // so the price cut waives the floor rather than waiting it out.
      name: "Day-4 listing that cut its price enters",
      expect: "REVIEW",
      run: () =>
        evaluateListing({
          listing: baseListing({ daysOnMarket: 4 }),
          arv: goodComps,
          previousListPrice: 330_000,
        }),
    },
    {
      // Below PRICE_CUT_MIN_PCT, so there is no exemption to claim.
      name: "Day-4 listing with a 1% trim stays out",
      expect: "REJECT",
      run: () =>
        evaluateListing({
          listing: baseListing({ daysOnMarket: 4 }),
          arv: goodComps,
          previousListPrice: 303_000,
        }),
    },
    {
      name: "Monroe County holds on flood exposure",
      expect: "REVIEW",
      run: () =>
        evaluateListing({
          listing: baseListing({
            listPrice: 550_000,
            address: { ...baseListing().address, county: "Monroe", city: "Key West" },
          }),
          arv: { ...goodComps, arv: 750_000 },
        }),
    },
  ]

  let failures = 0
  for (const c of cases) {
    const result = await c.run()
    const ok = result.decision === c.expect
    if (!ok) failures++
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(38)} → ${result.decision}` +
        (ok ? "" : ` (expected ${c.expect})`),
    )
    console.log(
      `        score=${result.condition.conditionScore} tier=${result.condition.tier} ` +
        `offer=${result.offer.offerPrice ?? "—"} repairs=${result.offer.repairs} conf=${result.offer.confidence}`,
    )
    for (const r of result.offer.reasons) console.log(`        · ${r}`)
    console.log()
  }

  // --- Regional cost banding ---
  const { estimateRepairs: est } = await import("../lib/acquisition/repairs")
  const rural = est({ listing: baseListing({ address: { ...baseListing().address, county: "Liberty" } }), tier: "HEAVY" })
  const metro = est({ listing: baseListing({ address: { ...baseListing().address, county: "Hillsborough" } }), tier: "HEAVY" })
  const premium = est({ listing: baseListing({ address: { ...baseListing().address, county: "Miami-Dade" } }), tier: "HEAVY" })

  const banded = rural.total < metro.total && metro.total < premium.total
  if (!banded) failures++
  console.log(
    `${banded ? "PASS" : "FAIL"}  ${"Repair cost bands by region".padEnd(38)} → ` +
      `Liberty $${rural.total.toLocaleString()} < Hillsborough $${metro.total.toLocaleString()} < Miami-Dade $${premium.total.toLocaleString()}`,
  )
  console.log()

  // --- Send priority: the day's cap must go to the best deals, not the first ones ---
  const { priorityScore } = await import("../lib/acquisition/priority")
  const strong = priorityScore({
    listing: baseListing({ daysOnMarket: 150 }),
    offer: { decision: "SEND", offerPrice: 260_000, arv: 420_000, repairs: 100_000, confidence: 95, confidenceBreakdown: {}, reasons: [] },
  })
  const weak = priorityScore({
    listing: baseListing({ daysOnMarket: 2 }),
    offer: { decision: "SEND", offerPrice: 160_000, arv: 420_000, repairs: 100_000, confidence: 55, confidenceBreakdown: {}, reasons: [] },
  })
  const ranked = strong > weak
  if (!ranked) failures++
  console.log(`${ranked ? "PASS" : "FAIL"}  ${"Priority ranks strong over weak".padEnd(38)} → ${strong} vs ${weak}`)

  // Days on market has to be a preference, not a rounding artefact. At the old weight
  // of 0.15 saturating at 120 days these two came out ~9 points apart on a 100-point
  // scale, which is noise in a pipeline whose whole premise is dated inventory.
  const domScore = (days: number) =>
    priorityScore({
      listing: baseListing({ daysOnMarket: days }),
      offer: { decision: "SEND", offerPrice: 240_000, arv: 420_000, repairs: 100_000, confidence: 80, confidenceBreakdown: {}, reasons: [] },
    })
  const spread = domScore(90) - domScore(15)
  const domMatters = spread >= 15
  if (!domMatters) failures++
  console.log(`${domMatters ? "PASS" : "FAIL"}  ${"90d beats 15d by a real margin".padEnd(38)} → ${domScore(90)} vs ${domScore(15)} (spread ${spread})`)

  // Saturation moved to 90 days: past that, more time tells you nothing new.
  const saturates = domScore(90) === domScore(200)
  if (!saturates) failures++
  console.log(`${saturates ? "PASS" : "FAIL"}  ${"Motivation saturates at 90 days".padEnd(38)} → ${domScore(90)} vs ${domScore(200)}`)

  // A price cut before first contact jumps the queue outright rather than being scored
  // against confidence and deal size — it is perishable, and every other cash buyer
  // watching the feed sees the same event the same day.
  const { priceCutEntry } = await import("../lib/acquisition/outreach/sequence")
  const jumped = priorityScore({
    listing: baseListing({ daysOnMarket: 4 }),
    offer: { decision: "SEND", offerPrice: 160_000, arv: 420_000, repairs: 100_000, confidence: 55, confidenceBreakdown: {}, reasons: [] },
    priceCut: priceCutEntry({ currentListPrice: 300_000, previousListPrice: 330_000 }),
  })
  const jumpsQueue = jumped === 100 && jumped > strong
  if (!jumpsQueue) failures++
  console.log(`${jumpsQueue ? "PASS" : "FAIL"}  ${"Price-cut entry jumps the queue".padEnd(38)} → ${jumped} vs best ordinary ${strong}`)
  console.log()

  // The SEND path needs a vision-backed condition read, which the pipeline can only get
  // from a live API call. Exercise the gate directly instead, with a synthetic
  // assessment standing in for a completed photo pass.
  const { computeOffer } = await import("../lib/acquisition/offer")
  const { estimateRepairs } = await import("../lib/acquisition/repairs")

  const visionBacked = {
    conditionScore: 82,
    tier: "HEAVY" as const,
    breakdown: { vision: 80 },
    matchedSignals: ["as-is", "original oak cabinets"],
    visionApplied: true,
    signalConfidence: 0.85,
  }
  const sendListing = baseListing()
  const sendRepairs = estimateRepairs({ listing: sendListing, tier: visionBacked.tier })
  const sendOffer = computeOffer({
    listing: sendListing,
    condition: visionBacked,
    repairs: sendRepairs,
    arv: goodComps,
  })
  const sendOk = sendOffer.decision === "SEND"
  if (!sendOk) failures++
  console.log(
    `${sendOk ? "PASS" : "FAIL"}  ${"Vision-backed read clears the gate".padEnd(38)} → ${sendOffer.decision}` +
      (sendOk ? "" : " (expected SEND)"),
  )
  console.log(`        offer=${sendOffer.offerPrice} conf=${sendOffer.confidence}`)
  for (const r of sendOffer.reasons) console.log(`        · ${r}`)
  console.log()

  // --- Per-agent volume cap ---
  // Same listing, same numbers, same agent. The only thing that changes is how much of
  // this sender that agent has already had. Suppression catches agents who opted out;
  // this is what stops you earning the opt-out in the first place.
  const cappedOffer = computeOffer({
    listing: sendListing,
    condition: visionBacked,
    repairs: sendRepairs,
    arv: goodComps,
    activeThreadsForAgent: 2,
  })
  const capHolds = cappedOffer.decision === "REVIEW"
  if (!capHolds) failures++
  console.log(
    `${capHolds ? "PASS" : "FAIL"}  ${"Agent at 2 live threads holds".padEnd(38)} → ${cappedOffer.decision}` +
      (capHolds ? "" : " (expected REVIEW)"),
  )
  for (const r of cappedOffer.reasons) console.log(`        · ${r}`)

  const underCap = computeOffer({
    listing: sendListing,
    condition: visionBacked,
    repairs: sendRepairs,
    arv: goodComps,
    activeThreadsForAgent: 1,
  })
  const underOk = underCap.decision === "SEND"
  if (!underOk) failures++
  console.log(
    `${underOk ? "PASS" : "FAIL"}  ${"Agent at 1 live thread still sends".padEnd(38)} → ${underCap.decision}` +
      (underOk ? "" : " (expected SEND)"),
  )

  // The cap holds; it never rejects. A capped listing is a fine deal with bad timing,
  // and it should still be mailable once one of those threads closes out.
  const { agentAtVolumeCap } = await import("../lib/acquisition/offer")
  const capNeverRejects = cappedOffer.decision !== "REJECT" && cappedOffer.offerPrice === sendOffer.offerPrice
  if (!capNeverRejects) failures++
  console.log(`${capNeverRejects ? "PASS" : "FAIL"}  ${"Capped listing keeps its offer".padEnd(38)} → $${cappedOffer.offerPrice?.toLocaleString()}`)

  const capBoundary = !agentAtVolumeCap(1) && agentAtVolumeCap(2) && agentAtVolumeCap(9)
  if (!capBoundary) failures++
  console.log(`${capBoundary ? "PASS" : "FAIL"}  ${"Cap boundary sits at 2".padEnd(38)} → 1 clear, 2 capped, 9 capped`)
  console.log()

  // Print one rendered LOI so wording regressions are visible in the run output.
  const sample = await evaluateListing({ listing: baseListing(), arv: goodComps })
  if (sample.loi) {
    console.log("─".repeat(72))
    console.log(`SUBJECT: ${sample.loi.subject}\n`)
    console.log(sample.loi.body)
    console.log("─".repeat(72))
  }

  console.log(failures === 0 ? "\nAll cases passed." : `\n${failures} case(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
