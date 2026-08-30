/**
 * lib/acquisition/outreach/sequence.ts — When the next touch goes out, and when to stop.
 *
 * One LOI and silence is not outreach. This schedules the follow-up cadence and, more
 * importantly, decides when to STOP — a sequence that keeps mailing after a reply, a
 * status change, or an opt-out is the fastest way to burn a market this size.
 *
 * It also owns the one event that can start a thread rather than continue one: a price
 * cut on a listing we never mailed. See priceCutEntry().
 *
 * Pure and side-effect free: it reads state and says what is due. n8n sends.
 */

import acquisitionConfig from "../config"
import { EVENT_TOUCHES, SEQUENCE, type TouchId, type TouchTemplate } from "./templates"

export type SequenceState = {
  listingKey: string
  /** When the LOI went out. The clock every scheduled touch is measured from. */
  loiSentAt: string
  touchesSent: TouchId[]
  /** Set the moment anything arrives from the agent. Halts the sequence permanently. */
  repliedAt?: string
  /** MLS status at last check. Anything but active stops the sequence. */
  standardStatus: string
  /** List price at last check — a drop below this fires the event touch. */
  lastKnownListPrice: number
  stoppedReason?: string
}

export type SequenceDecision =
  | { kind: "SEND"; touch: TouchTemplate; reason: string }
  | { kind: "WAIT"; nextDueAt: string; reason: string }
  | { kind: "STOP"; reason: string }

const DAY_MS = 86_400_000

const daysSince = (iso: string, now: Date): number =>
  (now.getTime() - new Date(iso).getTime()) / DAY_MS

/** Statuses where continuing to mail is pointless or actively damaging. */
const DEAD_STATUSES = new Set(["Pending", "Closed", "Sold", "Withdrawn", "Expired", "Canceled"])

export type PriceCut = {
  /** True when the reduction clears PRICE_CUT_MIN_PCT. */
  qualifies: boolean
  /** Fraction taken off the previous list price. 0 when there was no reduction. */
  cutPct: number
}

/**
 * The one definition of "a price cut worth acting on", read by both the re-engagement
 * touch and the entry trigger below. Two copies of this threshold would drift, and the
 * whole point is that the same event means the same thing whichever door it comes in.
 */
export function assessPriceCut(previousListPrice: number, currentListPrice: number): PriceCut {
  if (!(previousListPrice > 0) || !(currentListPrice > 0) || currentListPrice >= previousListPrice) {
    return { qualifies: false, cutPct: 0 }
  }
  const cutPct = (previousListPrice - currentListPrice) / previousListPrice
  return { qualifies: cutPct >= acquisitionConfig.priceCutMinPct, cutPct }
}

export type PriceCutEntryInput = {
  /** Current list price from the feed. */
  currentListPrice: number
  /** Last list price we recorded for this listing. Undefined the first time we see it. */
  previousListPrice?: number
  /** True once an LOI has gone out. From there the cut belongs to T5, not to entry. */
  loiSent?: boolean
}

export type PriceCutEntry = PriceCut & { reason: string }

/**
 * Price cut as an ENTRY trigger, for a listing that has never been mailed.
 *
 * T5 already treats a reduction as the highest-conversion touch in the sequence, but
 * only for threads that already have an LOI behind them. That left the best signal in
 * the system doing nothing for the listings it says the most about: a house that cuts
 * its price before we ever wrote to it gets no boost at all, and waits its turn behind
 * ordinary inventory or sits below the days-on-market floor entirely.
 *
 * A reduction is a public admission that the market disagreed with the seller, and it
 * lands with expectations already lowered by someone other than the buyer — which is
 * exactly the moment a below-list cash number stops reading as an insult. It is also
 * better evidence than elapsed time, so it overrides MIN_DAYS_ON_MARKET rather than
 * waiting it out: a listing that cut in week two has told you more than one that sat
 * quietly for three.
 *
 * And it is perishable. Every other cash buyer watching the feed sees the same event
 * on the same day, so this jumps the send queue (priority.ts) instead of being scored
 * against confidence and deal size.
 *
 * Deliberately NOT gated on OUTREACH_SEQUENCE_ENABLED: that switch governs follow-ups
 * to a thread already open. This decides whether a thread opens at all.
 *
 * Pure. It reads two numbers and says what they mean.
 */
export function priceCutEntry({
  currentListPrice,
  previousListPrice,
  loiSent = false,
}: PriceCutEntryInput): PriceCutEntry {
  if (loiSent) {
    return { qualifies: false, cutPct: 0, reason: "LOI already sent; a cut here is T5's job, not an entry trigger." }
  }
  if (previousListPrice === undefined) {
    return { qualifies: false, cutPct: 0, reason: "First time we have seen this listing; no prior price to compare." }
  }

  const cut = assessPriceCut(previousListPrice, currentListPrice)
  if (!cut.qualifies) {
    return {
      ...cut,
      reason:
        cut.cutPct > 0
          ? `Cut of ${(cut.cutPct * 100).toFixed(1)}% is below the ${(acquisitionConfig.priceCutMinPct * 100).toFixed(0)}% floor.`
          : "No reduction against the last known list price.",
    }
  }

  return {
    ...cut,
    reason: `List price cut ${(cut.cutPct * 100).toFixed(1)}% to $${currentListPrice.toLocaleString()} before first contact; entering on the cut.`,
  }
}

export type SequenceInput = {
  state: SequenceState
  /** Current list price from the feed. Below lastKnownListPrice triggers the event touch. */
  currentListPrice?: number
  /** True when the agent or their email is on the suppression list. */
  suppressed?: boolean
  now?: Date
}

export function nextTouch({ state, currentListPrice, suppressed, now = new Date() }: SequenceInput): SequenceDecision {
  if (!acquisitionConfig.outreachSequenceEnabled) {
    return { kind: "STOP", reason: "OUTREACH_SEQUENCE_ENABLED is not set to \"true\"." }
  }

  // Stop conditions, most binding first.
  if (suppressed) {
    return { kind: "STOP", reason: "Agent is on the suppression list." }
  }
  if (state.stoppedReason) {
    return { kind: "STOP", reason: state.stoppedReason }
  }
  if (state.repliedAt) {
    // A reply moves the thread into the negotiation engine. Campaign cadence and an
    // active negotiation must never both be mailing the same person.
    return { kind: "STOP", reason: "Agent replied; the thread belongs to the negotiation engine now." }
  }
  if (DEAD_STATUSES.has(state.standardStatus)) {
    return { kind: "STOP", reason: `Listing status is ${state.standardStatus}; no longer buyable.` }
  }

  // Event touch outranks the schedule: a price cut is worth more than whatever the
  // calendar says is next, and it re-engages threads the schedule has finished with.
  if (currentListPrice !== undefined && !state.touchesSent.includes("T5_PRICE_CUT")) {
    const cut = assessPriceCut(state.lastKnownListPrice, currentListPrice)
    if (cut.qualifies) {
      return {
        kind: "SEND",
        touch: EVENT_TOUCHES.find((t) => t.id === "T5_PRICE_CUT")!,
        reason: `List price cut ${(cut.cutPct * 100).toFixed(1)}% to $${currentListPrice.toLocaleString()}; re-engaging.`,
      }
    }
  }

  const elapsed = daysSince(state.loiSentAt, now)
  const pending = SEQUENCE.filter((t) => !state.touchesSent.includes(t.id))

  if (pending.length === 0) {
    return { kind: "STOP", reason: "Sequence complete; thread is dormant pending a price cut." }
  }

  const due = pending.find((t) => t.dayOffset !== null && elapsed >= t.dayOffset)
  if (due) {
    return { kind: "SEND", touch: due, reason: `Day ${Math.floor(elapsed)} — ${due.id} is due.` }
  }

  const next = pending[0]
  const dueAt = new Date(new Date(state.loiSentAt).getTime() + (next.dayOffset ?? 0) * DAY_MS)
  return {
    kind: "WAIT",
    nextDueAt: dueAt.toISOString(),
    reason: `${next.id} due in ${Math.ceil((next.dayOffset ?? 0) - elapsed)} day(s).`,
  }
}
