/**
 * lib/acquisition/priority.ts — Which deals get the day's sends.
 *
 * At two counties the daily cap was slack: fewer listings qualified than the cap
 * allowed, so processing order did not matter. Statewide it becomes the binding
 * constraint — far more listings qualify than you can responsibly mail — and
 * first-come-first-served means the day's 25 sends go to whichever counties the MLS
 * feed happened to return first. That is not a strategy, it is an accident.
 *
 * This scores each qualified listing so the queue can be worked best-first.
 *
 * The weights are a starting heuristic, not a discovered optimum. Once acq_outcomes
 * has enough contracts, replace the acceptance proxy with the observed relationship
 * between these inputs and actual acceptance — that is exactly the kind of question
 * the ledger exists to answer, and one of the few here with enough events to answer it.
 */

import type { Listing, OfferResult } from "./types"

export type PriorityInput = {
  listing: Listing
  offer: OfferResult
}

/**
 * 0-100. Higher goes out first.
 *
 * Note that expected gross spread is NOT a useful ranking signal here: with
 * offer = ARV x m - repairs, the spread is always ARV x (1 - m), so ranking by spread
 * is just ranking by ARV — it would send the whole day's mail to the most expensive
 * houses regardless of whether any of them would ever accept.
 */
export function priorityScore({ listing, offer }: PriorityInput): number {
  if (offer.offerPrice === null) return 0

  // Confidence in the underwriting. A high-confidence read is worth more of a scarce
  // send than a speculative one at the same nominal margin.
  const confidenceFactor = offer.confidence / 100

  // How close our number is to their ask. Closer offers get accepted more often, and
  // a send that gets a reply is worth several that do not.
  const ratio = offer.offerPrice / listing.listPrice
  const proximityFactor = Math.max(0, Math.min(1, (ratio - 0.5) / 0.4))

  // Time on market as a motivation proxy, saturating at 120 days — beyond that it
  // stops telling you anything new about the seller.
  const dom = listing.daysOnMarket ?? 0
  const motivationFactor = Math.min(1, dom / 120)

  // Deal size, log-scaled: a $400k ARV deal is worth more than a $200k one, but not
  // twice as much in practice, and linear scaling would starve the affordable end of
  // the market where these offers actually get taken.
  const spread = offer.arv * 0.25
  const sizeFactor = Math.max(0, Math.min(1, Math.log10(Math.max(spread, 1) / 10_000) / Math.log10(20)))

  const weighted =
    confidenceFactor * 0.40 +
    proximityFactor * 0.30 +
    motivationFactor * 0.15 +
    sizeFactor * 0.15

  return Math.round(weighted * 100)
}
