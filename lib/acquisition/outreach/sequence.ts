/**
 * lib/acquisition/outreach/sequence.ts — When the next touch goes out, and when to stop.
 *
 * One LOI and silence is not outreach. This schedules the follow-up cadence and, more
 * importantly, decides when to STOP — a sequence that keeps mailing after a reply, a
 * status change, or an opt-out is the fastest way to burn a market this size.
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
  if (
    currentListPrice !== undefined &&
    currentListPrice < state.lastKnownListPrice &&
    !state.touchesSent.includes("T5_PRICE_CUT")
  ) {
    const cutPct = (state.lastKnownListPrice - currentListPrice) / state.lastKnownListPrice
    if (cutPct >= acquisitionConfig.priceCutMinPct) {
      return {
        kind: "SEND",
        touch: EVENT_TOUCHES.find((t) => t.id === "T5_PRICE_CUT")!,
        reason: `List price cut ${(cutPct * 100).toFixed(1)}% to $${currentListPrice.toLocaleString()}; re-engaging.`,
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
