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
            daysOnMarket: 3,
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
      name: "Out-of-market county",
      expect: "REJECT",
      run: () =>
        evaluateListing({
          listing: baseListing({
            address: { ...baseListing().address, county: "Miami-Dade" },
          }),
          arv: goodComps,
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
