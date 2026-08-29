/**
 * scripts/verify-negotiation.ts — Guard tests for the negotiation policy engine.
 *
 * Run:  npx tsx scripts/verify-negotiation.ts
 *
 * Every case here is a way the bot could lose money or embarrass you. All pure
 * functions — no API key, no network. Re-run after any change to policy.ts.
 */

process.env.NEGOTIATION_ENABLED = "true"
process.env.OFFER_ARV_MULTIPLIER = "0.75"
process.env.NEGOTIATION_MAX_ARV_MULTIPLIER = "0.80"
process.env.NEGOTIATION_CONCESSION_STEPS = "0.4,0.3,0.2"

let failures = 0
const check = (name: string, cond: boolean, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  const { decideAction, maxAllowableOffer, nextConcession, validateOutboundOffer } =
    await import("../lib/acquisition/negotiation/policy")
  const { calibrate, requiredSampleForLift, wilsonInterval } = await import("../lib/acquisition/outcomes")
  type NegotiationState = import("../lib/acquisition/negotiation/types").NegotiationState

  // ARV 420k, repairs 131k → open at 184k, ceiling at 205k.
  const base = (over: Partial<NegotiationState> = {}): NegotiationState => ({
    listingKey: "K1",
    listingId: "TB8300001",
    stage: "OPENED",
    openingOffer: 184_000,
    currentOffer: 184_000,
    concessionsUsed: 0,
    economics: { arv: 420_000, repairs: 131_000, listPrice: 300_000 },
    messages: [],
    updatedAt: new Date().toISOString(),
    ...over,
  })

  const ceiling = maxAllowableOffer(base())
  check("Ceiling = ARV*0.80 - repairs", ceiling === 205_000, `got $${ceiling.toLocaleString()}`)

  // --- Concession ladder ---
  let s = base()
  const ladder: number[] = []
  for (let i = 0; i < 5; i++) {
    const next = nextConcession(s)
    if (next === null) break
    ladder.push(next)
    s = { ...s, currentOffer: next, concessionsUsed: s.concessionsUsed + 1 }
  }
  check("Ladder has exactly 3 rungs", ladder.length === 3, `got ${ladder.length}: ${ladder.map((n) => `$${n.toLocaleString()}`).join(" → ")}`)
  check("Ladder is strictly increasing", ladder.every((v, i) => i === 0 || v > ladder[i - 1]))
  check("Ladder never reaches the ceiling", ladder.every((v) => v < ceiling))
  check("Concession steps shrink", ladder[1] - ladder[0] < ladder[0] - 184_000)
  check("Ladder exhausts", nextConcession(s) === null)

  // --- validateOutboundOffer: the last gate ---
  check("Rejects above ceiling", validateOutboundOffer(base(), 210_000).ok === false)
  check("Rejects below standing offer", validateOutboundOffer(base({ currentOffer: 190_000 }), 185_000).ok === false)
  check(
    "Rejects bidding above their counter",
    validateOutboundOffer(base({ theirLastCounter: 195_000 }), 200_000).ok === false,
  )
  check("Accepts a valid in-range offer", validateOutboundOffer(base(), 195_000).ok === true)
  check("Rejects NaN", validateOutboundOffer(base(), Number.NaN).ok === false)

  // --- decideAction ---
  const counterAboveCeiling = decideAction({ state: base(), intent: "COUNTER", theirCounter: 260_000 })
  check("Counter above ceiling → concede", counterAboveCeiling.kind === "COUNTER")
  if (counterAboveCeiling.kind === "COUNTER") {
    check("Conceded offer stays under ceiling", counterAboveCeiling.offerPrice < ceiling, `$${counterAboveCeiling.offerPrice.toLocaleString()}`)
  }

  check(
    "Counter within authority → escalate, never auto-accept",
    decideAction({ state: base(), intent: "COUNTER", theirCounter: 200_000 }).kind === "ESCALATE",
  )
  check("Accept → escalate (bot never binds)", decideAction({ state: base(), intent: "ACCEPT" }).kind === "ESCALATE")
  check(
    "Bare reject → hold firm, never bid against ourselves",
    decideAction({ state: base(), intent: "REJECT" }).kind === "HOLD_FIRM",
  )
  check("Stop request → suppress", decideAction({ state: base(), intent: "NOT_INTERESTED_STOP" }).kind === "SUPPRESS")
  check("Auto-reply → ignore", decideAction({ state: base(), intent: "AUTO_REPLY" }).kind === "IGNORE")
  check("Unclear → escalate", decideAction({ state: base(), intent: "UNCLEAR" }).kind === "ESCALATE")
  check(
    "New information → escalate for re-underwrite",
    decideAction({ state: base(), intent: "NEW_INFORMATION" }).kind === "ESCALATE",
  )
  check(
    "Counter below our standing offer → escalate",
    decideAction({ state: base(), intent: "COUNTER", theirCounter: 150_000 }).kind === "ESCALATE",
  )
  check(
    "Ladder exhausted → hold firm, not escalate-and-raise",
    decideAction({ state: base({ concessionsUsed: 3, currentOffer: 203_000 }), intent: "COUNTER", theirCounter: 260_000 }).kind === "HOLD_FIRM",
  )
  check(
    "Terminal stage ignores further replies",
    decideAction({ state: base({ stage: "DEAD" }), intent: "COUNTER", theirCounter: 260_000 }).kind === "IGNORE",
  )

  // --- Calibration math ---
  const n = requiredSampleForLift(0.05, 0.07)
  check("A/B sample size for 5%→7% is in the thousands", n > 1000 && n < 3000, `${n} per arm`)
  check("Impossible lift → Infinity", requiredSampleForLift(0.05, 0.04) === Infinity)

  const w = wilsonInterval(2, 20)
  check("Wilson interval on 2/20 is wide", w.high - w.low > 0.2, `${(w.low * 100).toFixed(1)}%-${(w.high * 100).toFixed(1)}%`)

  const report = calibrate(
    Array.from({ length: 4 }, (_, i) => ({
      listingKey: `K${i}`,
      listingId: `TB${i}`,
      decidedAt: new Date().toISOString(),
      decision: "SEND" as const,
      predictedTier: "HEAVY" as const,
      conditionScore: 80,
      predictedRepairs: 100_000,
      predictedArv: 400_000,
      offerPrice: 200_000,
      confidence: 80,
      outcome: { replied: i < 1, actualRepairCost: 160_000 },
    })),
    { cosmetic: 18, moderate: 40, heavy: 70, severe: 105 },
  )
  const heavyProposal = report.proposals.find((p) => p.envVar === "REPAIR_HEAVY_PER_SQFT")
  check("Under-estimated repairs produce a proposal", Boolean(heavyProposal))
  check("Proposal is clamped to +20%, not the raw 1.6x", heavyProposal?.proposedValue === 84, `got ${heavyProposal?.proposedValue}`)
  check("Proposal flagged non-actionable at n=4", heavyProposal?.actionable === false)
  check("Small sample produces a warning", report.warnings.length > 0)
  check(
    "No proposal ever targets the offer multiplier",
    report.proposals.every((p) => !p.envVar.includes("ARV_MULTIPLIER")),
  )

  console.log(failures === 0 ? "\nAll cases passed." : `\n${failures} case(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
