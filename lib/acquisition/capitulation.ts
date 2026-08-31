/**
 * lib/acquisition/capitulation.ts — Has the seller stopped arguing with the market?
 *
 * Days on market alone cannot answer that, and treating it as if it can is the most
 * expensive mistake available at the top of this funnel. A listing sits for 300 days for
 * two opposite reasons:
 *
 *   The seller is stuck  — priced right, condition-impaired, out of options. Desperate.
 *   The seller is stubborn — priced at a number the market has refused 300 times, and
 *                            they have not moved once. Not desperate. Certain.
 *
 * The second group will reject a below-list cash offer AND resent being asked, and they
 * are indistinguishable from the first on time alone. What separates them is whether the
 * price has moved. A seller who has cut four times has already conceded the argument in
 * public; the only remaining question is the number. A seller who has held firm for 577
 * days at twice the Zestimate is not going to be persuaded by mail.
 *
 * Observed live in the Tampa/St. Pete pull: two listings on the same street, same agent,
 * 577 days each, asking $600k and $500k against Zestimates of $264k. Zero cuts between
 * them. Those are not prospects, they are a postage bill.
 *
 * So: time on market says how long they have resisted. Price cuts say whether they have
 * stopped. Only the second one predicts a reply.
 */

/** Everything derivable from a listing's own price history. */
export type PriceSignals = {
  /** Distinct downward price changes. The count matters more than the size. */
  cuts: number
  /** Total reduction from the original list price of the CURRENT listing cycle, 0-1. */
  totalReductionPct: number
  /** Days since the most recent cut. Recent movement is worth more than old movement. */
  daysSinceLastCut?: number
  /** List price ÷ Zestimate. Above ~1.4 with no cuts is the delusion signature. */
  listToZestimate?: number
}

export type PriceHistoryEntry = { date?: string; event?: string; price?: number; priceChangeRate?: number }

export function derivePriceSignals(
  history: PriceHistoryEntry[],
  currentPrice: number,
  zestimate?: number,
  now = new Date(),
): PriceSignals {
  const dated = history.filter((e) => e?.date && typeof e.price === "number")

  // Only the current listing cycle counts. A cut made before the last sale belongs to a
  // previous owner and says nothing about this seller's willingness to move.
  const lastSale = dated
    .filter((e) => /^sold$/i.test(String(e.event)))
    .map((e) => new Date(e.date!).getTime())
    .sort((a, b) => b - a)[0]
  const cycle = dated.filter((e) => !lastSale || new Date(e.date!).getTime() > lastSale)

  const cutEvents = cycle
    .filter((e) => typeof e.priceChangeRate === "number" && e.priceChangeRate! < 0)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())

  const listedEvents = cycle
    .filter((e) => /listed for sale/i.test(String(e.event)))
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())

  const original = listedEvents[0]?.price
  // Clamped to a sane band. A raw ratio of -75% showed up in live data and was an
  // artefact of a stale history row, not a seller conceding three quarters of their ask.
  let totalReductionPct = 0
  if (original && original > 0 && currentPrice > 0 && currentPrice <= original) {
    totalReductionPct = Math.min(0.6, (original - currentPrice) / original)
  }

  const daysSinceLastCut = cutEvents[0]?.date
    ? Math.max(0, Math.floor((now.getTime() - new Date(cutEvents[0].date!).getTime()) / 86_400_000))
    : undefined

  return {
    cuts: cutEvents.length,
    totalReductionPct,
    daysSinceLastCut,
    listToZestimate: zestimate && zestimate > 0 ? currentPrice / zestimate : undefined,
  }
}

/**
 * 0-100. How far the seller has publicly moved toward the market.
 *
 * Weighted toward the FACT of cutting rather than its size: the first cut is the
 * concession that matters, because it is the one that costs pride. Everything after it is
 * arithmetic.
 */
export function capitulationScore(s: PriceSignals): number {
  const cutCount = Math.min(1, s.cuts / 3) * 45          // three cuts saturates
  const depth = Math.min(1, s.totalReductionPct / 0.15) * 35 // 15% off saturates
  const recency = s.daysSinceLastCut === undefined ? 0
    : s.daysSinceLastCut <= 30 ? 20 : s.daysSinceLastCut <= 90 ? 12 : 5
  return Math.round(cutCount + depth + recency)
}

/**
 * The seller is not negotiating, they are waiting to be agreed with.
 *
 * Deliberately narrow, and deliberately NOT a rejection on its own. Zestimate is noisy on
 * exactly the properties this pipeline targets — dated, unusual, hard to comp — so a high
 * ratio is often the AVM being wrong rather than the seller. What is not noise is a high
 * ratio combined with a long listing and no cut at all: three independent things all
 * saying the same thing.
 */
export function readsAsDelusional(s: PriceSignals, daysOnMarket: number | undefined): boolean {
  if (s.cuts > 0) return false
  if ((daysOnMarket ?? 0) < 90) return false
  return (s.listToZestimate ?? 0) >= 1.4
}

/**
 * Is the seller a flipper protecting a basis?
 *
 * A third population the model did not separate, and on a hand-read sample of the
 * St. Petersburg 21-89 day window it was the DOMINANT one: five of six stale listings
 * were not dated houses at all, they were renovated houses priced too high.
 *
 * That distinction decides whether an offer can ever work. The pitch is "we absorb the
 * repair risk and close fast at a discount" — but a flipper has already absorbed the
 * repair risk, has no repairs left to discount, and has a purchase price plus a
 * renovation budget to protect. They will not take ARV x 0.75 minus zero repairs. They
 * will keep cutting until the market clears, and they can wait, because this is a
 * business decision rather than a life event.
 *
 * They are not delusional and not desperate. They are a competitor's inventory.
 *
 * The signature is in the price history and needs both halves: a recent arms-length
 * purchase, and a relist materially above it. Either alone is ordinary — people do sell
 * houses they bought a few years ago, and appreciation is real — but a purchase 14 months
 * ago at $260k relisted at $430k is a renovation someone is trying to sell back.
 */
export type FlipSignals = {
  isLikelyFlip: boolean
  /** Months between the last sale and now. */
  monthsSincePurchase?: number
  /** Current list ÷ last sale price. */
  markupRatio?: number
}

const FLIP_MAX_MONTHS = 30
const FLIP_MIN_MARKUP = 1.25

export function detectFlip(
  history: PriceHistoryEntry[],
  currentPrice: number,
  now = new Date(),
): FlipSignals {
  const sales = history
    .filter((e) => /^sold$/i.test(String(e.event)) && e.date && typeof e.price === "number" && e.price! > 0)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime())

  const last = sales[0]
  if (!last) return { isLikelyFlip: false }

  const months = (now.getTime() - new Date(last.date!).getTime()) / (86_400_000 * 30.44)
  const markup = currentPrice / last.price!

  return {
    isLikelyFlip: months <= FLIP_MAX_MONTHS && markup >= FLIP_MIN_MARKUP,
    monthsSincePurchase: Math.round(months),
    markupRatio: Math.round(markup * 100) / 100,
  }
}
