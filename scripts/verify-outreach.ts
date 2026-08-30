/**
 * scripts/verify-outreach.ts — Sequence cadence and call-trigger bands.
 *
 * Run:  npx tsx scripts/verify-outreach.ts
 *
 * The stop conditions matter more than the send conditions: a sequence that keeps
 * mailing after a reply, a status change, or an opt-out burns the market. Pure
 * functions, no network.
 */

process.env.OUTREACH_SEQUENCE_ENABLED = "true"
process.env.NEGOTIATION_ENABLED = "true"
process.env.NEGOTIATION_MAX_ARV_MULTIPLIER = "0.80"
process.env.CALL_TRIGGER_BAND_PCT = "0.10"
process.env.REVIEW_TRIGGER_BAND_PCT = "0.25"

let failures = 0
const check = (name: string, cond: boolean, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${name.padEnd(46)}${detail ? ` ${detail}` : ""}`)
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function main() {
  const { assessPriceCut, nextTouch, priceCutEntry } = await import("../lib/acquisition/outreach/sequence")
  const { assessUrgency } = await import("../lib/acquisition/negotiation/escalation")
  const { render, SEQUENCE } = await import("../lib/acquisition/outreach/templates")
  type SequenceState = import("../lib/acquisition/outreach/sequence").SequenceState
  type NegotiationState = import("../lib/acquisition/negotiation/types").NegotiationState

  const seq = (over: Partial<SequenceState> = {}): SequenceState => ({
    listingKey: "K1",
    loiSentAt: daysAgo(0),
    touchesSent: [],
    standardStatus: "Active",
    lastKnownListPrice: 300_000,
    ...over,
  })

  console.log("── Sequence cadence ──")
  const d1 = nextTouch({ state: seq({ loiSentAt: daysAgo(1) }) })
  check("Day 1 waits", d1.kind === "WAIT", d1.kind === "WAIT" ? `→ ${d1.reason}` : "")

  const d3 = nextTouch({ state: seq({ loiSentAt: daysAgo(3) }) })
  check("Day 3 sends credibility touch", d3.kind === "SEND" && d3.touch.id === "T2_CREDIBILITY")

  const d7 = nextTouch({ state: seq({ loiSentAt: daysAgo(7), touchesSent: ["T2_CREDIBILITY"] }) })
  check("Day 7 sends terms touch", d7.kind === "SEND" && d7.touch.id === "T3_TERMS")

  const d14 = nextTouch({ state: seq({ loiSentAt: daysAgo(14), touchesSent: ["T2_CREDIBILITY", "T3_TERMS"] }) })
  check("Day 14 sends takeaway", d14.kind === "SEND" && d14.touch.id === "T4_TAKEAWAY")

  const done = nextTouch({ state: seq({ loiSentAt: daysAgo(30), touchesSent: ["T2_CREDIBILITY", "T3_TERMS", "T4_TAKEAWAY"] }) })
  check("Sequence completes and goes dormant", done.kind === "STOP")

  console.log("\n── Stop conditions (the expensive half) ──")
  check("Reply halts the sequence", nextTouch({ state: seq({ loiSentAt: daysAgo(7), repliedAt: daysAgo(1) }) }).kind === "STOP")
  check("Pending status halts", nextTouch({ state: seq({ loiSentAt: daysAgo(7), standardStatus: "Pending" }) }).kind === "STOP")
  check("Sold status halts", nextTouch({ state: seq({ loiSentAt: daysAgo(7), standardStatus: "Closed" }) }).kind === "STOP")
  check("Suppression halts", nextTouch({ state: seq({ loiSentAt: daysAgo(7) }), suppressed: true }).kind === "STOP")

  console.log("\n── Price-cut re-engagement ──")
  const cut = nextTouch({ state: seq({ loiSentAt: daysAgo(30), touchesSent: ["T2_CREDIBILITY", "T3_TERMS", "T4_TAKEAWAY"] }), currentListPrice: 275_000 })
  check("8% cut wakes a dormant thread", cut.kind === "SEND" && cut.touch.id === "T5_PRICE_CUT", cut.kind === "SEND" ? `→ ${cut.reason}` : "")

  const trim = nextTouch({ state: seq({ loiSentAt: daysAgo(30), touchesSent: ["T2_CREDIBILITY", "T3_TERMS", "T4_TAKEAWAY"] }), currentListPrice: 297_000 })
  check("1% trim does not (below 3% floor)", trim.kind === "STOP")

  const cutAfterReply = nextTouch({ state: seq({ loiSentAt: daysAgo(30), repliedAt: daysAgo(20) }), currentListPrice: 250_000 })
  check("Price cut never overrides a reply", cutAfterReply.kind === "STOP")

  console.log("\n── Price cut as an ENTRY trigger (never-mailed listings) ──")
  // T5 was re-engagement only, so the best signal in the system did nothing for the
  // listings it says the most about: a house that cuts before we ever wrote to it got
  // no boost at all, and under MIN_DAYS_ON_MARKET could not be mailed at all.
  const entry = priceCutEntry({ currentListPrice: 275_000, previousListPrice: 300_000 })
  check("8% cut on a never-mailed listing enters", entry.qualifies, `→ ${entry.reason}`)

  const trimEntry = priceCutEntry({ currentListPrice: 297_000, previousListPrice: 300_000 })
  check("1% trim does not enter (below 3% floor)", !trimEntry.qualifies, `→ ${trimEntry.reason}`)

  const firstSighting = priceCutEntry({ currentListPrice: 275_000 })
  check("No prior price means no entry trigger", !firstSighting.qualifies, `→ ${firstSighting.reason}`)

  const raised = priceCutEntry({ currentListPrice: 320_000, previousListPrice: 300_000 })
  check("A price INCREASE never triggers entry", !raised.qualifies)

  const alreadyMailed = priceCutEntry({ currentListPrice: 275_000, previousListPrice: 300_000, loiSent: true })
  check("Once the LOI is out it is T5's job", !alreadyMailed.qualifies, `→ ${alreadyMailed.reason}`)

  // One threshold, two doors. If these ever disagree, the same event means two
  // different things depending on whether we happened to have mailed the agent.
  const sameCut = assessPriceCut(300_000, 275_000)
  check(
    "Entry and re-engagement share one threshold",
    sameCut.qualifies === entry.qualifies && Math.abs(sameCut.cutPct - entry.cutPct) < 1e-9,
    `${(sameCut.cutPct * 100).toFixed(1)}%`,
  )

  console.log("\n── Call-trigger bands (ceiling $205,000) ──")
  const negState = (over: Partial<NegotiationState> = {}): NegotiationState => ({
    listingKey: "K1", listingId: "TB8300001", stage: "NEGOTIATING",
    openingOffer: 184_000, currentOffer: 184_000, concessionsUsed: 0,
    economics: { arv: 420_000, repairs: 131_000, listPrice: 300_000 },
    messages: [], updatedAt: new Date().toISOString(), ...over,
  })
  const agent = { fullName: "Dana Reyes", phone: "727-555-0100", email: "dana@example.com" }
  const urg = (counter: number | undefined, intent: any = "COUNTER") =>
    assessUrgency({ state: negState(), intent, theirCounter: counter, agent })

  const inside = urg(200_000)
  check("Counter inside ceiling → CALL_NOW", inside.urgency === "CALL_NOW", `$200,000`)
  const band = urg(215_000)
  check("Counter 4.9% over → CALL_NOW", band.urgency === "CALL_NOW", `$215,000 · gap $${band.gapDollars?.toLocaleString()}`)
  const edge = urg(225_500)
  check("Counter 10% over → CALL_NOW (band edge)", edge.urgency === "CALL_NOW", `$225,500`)
  const review = urg(240_000)
  check("Counter 17% over → REVIEW_TODAY", review.urgency === "REVIEW_TODAY", `$240,000`)
  const far = urg(280_000)
  check("Counter 37% over → QUEUE", far.urgency === "QUEUE", `$280,000`)
  check("Acceptance → CALL_NOW", urg(undefined, "ACCEPT").urgency === "CALL_NOW")
  check("New information → REVIEW_TODAY", urg(undefined, "NEW_INFORMATION").urgency === "REVIEW_TODAY")
  check("Call target carries the agent phone", band.callTarget?.phone === "727-555-0100")

  console.log("\n── Template rendering ──")
  const t3 = SEQUENCE.find((t) => t.id === "T3_TERMS")!
  const out = render(t3.body, {
    agentFirstName: "Dana", street: "123 Palm Ave", closingDays: 21, inspectionDays: 10,
    signerName: "William", signerTitle: "Acquisitions", buyerEntity: "Bay Area Property Partners LLC", phone: "",
  })
  check("All merge fields resolved", !out.includes("{{"), out.includes("{{") ? out.match(/\{\{\w+\}\}/g)!.join(",") : "")
  check("Empty phone leaves no blank line", !out.includes("\n\n\nWilliam") && !/\n\s*\n\s*$/.test(out))

  console.log(`\n${failures === 0 ? "All cases passed." : `${failures} case(s) failed.`}`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
