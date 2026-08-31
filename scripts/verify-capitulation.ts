/** Ego vs capitulation. Cases drawn from the live Tampa/St. Pete pull. */
import { capitulationScore, derivePriceSignals, detectFlip, readsAsDelusional } from "../lib/acquisition/capitulation"

const NOW = new Date("2026-08-31T00:00:00Z")
let pass = 0, fail = 0
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? "PASS" : "FAIL"}  ${n.padEnd(60)} ${ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
  ok ? pass++ : fail++
}

// 2005 N 25th St: 577 days, asking $600k against a $264k Zestimate, never cut.
const ego = derivePriceSignals(
  [{ date: "2025-02-01", event: "Listed for sale", price: 600_000 }], 600_000, 264_400, NOW)
check("Ego listing records zero cuts", ego.cuts, 0)
check("Ego listing is flagged delusional at 577 days", readsAsDelusional(ego, 577), true)
check("Ego listing scores near zero on capitulation", capitulationScore(ego), 0)

// 410 73rd Ave: 451 days, nine cuts, down 34.5%.
const capit = derivePriceSignals([
  { date: "2026-08-01", event: "Price change", price: 425_000, priceChangeRate: -0.03 },
  { date: "2026-05-01", event: "Price change", price: 438_000, priceChangeRate: -0.05 },
  { date: "2026-02-01", event: "Price change", price: 460_000, priceChangeRate: -0.09 },
  { date: "2025-06-01", event: "Listed for sale", price: 649_000 },
], 425_000, 430_000, NOW)
check("Capitulating listing counts its cuts", capit.cuts, 3)
check("Capitulating listing is never flagged delusional", readsAsDelusional(capit, 451), false)
check("Capitulating listing scores high", capitulationScore(capit) >= 80, true)

// A cut made before the last sale belongs to a previous owner.
const prior = derivePriceSignals([
  { date: "2026-06-01", event: "Listed for sale", price: 400_000 },
  { date: "2023-09-15", event: "Sold", price: 300_000 },
  { date: "2023-07-01", event: "Price change", price: 310_000, priceChangeRate: -0.1 },
], 400_000, 390_000, NOW)
check("Cuts from a previous ownership cycle are excluded", prior.cuts, 0)

// The -75% artefact seen live.
const artefact = derivePriceSignals(
  [{ date: "2026-01-01", event: "Listed for sale", price: 1_800_000 }], 450_000, 460_000, NOW)
check("Absurd reduction is clamped to 60%, not taken at face value", artefact.totalReductionPct, 0.6)

// Delusion needs all three signals, not one.
check("High ratio alone, but recently listed, is not delusion",
  readsAsDelusional(derivePriceSignals([{ date: "2026-08-01", event: "Listed for sale", price: 600_000 }], 600_000, 300_000, NOW), 20), false)
check("High ratio with a cut is not delusion",
  readsAsDelusional({ cuts: 1, totalReductionPct: 0.02, listToZestimate: 2.0 }, 400), false)

// --- flip detection ---------------------------------------------------------
// Bought 14 months ago at $260k, relisted at $430k. That is a renovation being sold back.
check("Recent purchase + big markup reads as a flip",
  detectFlip([{ date: "2025-07-01", event: "Sold", price: 260_000 }], 430_000, NOW).isLikelyFlip, true)
// Long-held family home. Appreciation is not a flip.
check("Long-held home with appreciation is NOT a flip",
  detectFlip([{ date: "2014-03-01", event: "Sold", price: 180_000 }], 430_000, NOW).isLikelyFlip, false)
// Recent purchase, listed near what they paid. Someone moving, not flipping.
check("Recent purchase at a flat price is NOT a flip",
  detectFlip([{ date: "2025-09-01", event: "Sold", price: 400_000 }], 415_000, NOW).isLikelyFlip, false)
check("No sale history means no flip verdict",
  detectFlip([{ date: "2026-06-01", event: "Listed for sale", price: 400_000 }], 400_000, NOW).isLikelyFlip, false)

console.log(`\n${fail === 0 ? "All cases passed." : `${fail} FAILED`}  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
