/**
 * lib/acquisition/negotiation/escalation.ts — When to stop typing and pick up the phone.
 *
 * Email is good at opening a conversation and bad at closing a gap. Once a counter
 * lands close enough that the deal is arguably doable, another polite email is the
 * worst available move: it burns a day, invites another round of anchoring, and lets a
 * live seller cool off. That is the moment a person should be calling the agent.
 *
 * This classifies how urgent a thread is and produces the payload n8n routes to Slack,
 * SMS, or a GHL pipeline.
 */

import acquisitionConfig from "../config"
import { maxAllowableOffer } from "./policy"
import type { NegotiationState, ReplyIntent } from "./types"

export type Urgency = "CALL_NOW" | "REVIEW_TODAY" | "QUEUE" | "NONE"

export type EscalationSignal = {
  urgency: Urgency
  /** One line, written to be read on a phone screen. */
  headline: string
  /** How far their counter sits above our ceiling. Negative means inside authority. */
  gapPct: number | null
  gapDollars: number | null
  callTarget?: { name: string; phone?: string; email?: string }
}

export type EscalationInput = {
  state: NegotiationState
  intent: ReplyIntent
  theirCounter?: number
  agent: { fullName: string; phone?: string; email?: string }
}

export function assessUrgency({ state, intent, theirCounter, agent }: EscalationInput): EscalationSignal {
  const ceiling = maxAllowableOffer(state)
  const callTarget = { name: agent.fullName, phone: agent.phone, email: agent.email }

  const gapDollars = theirCounter !== undefined ? theirCounter - ceiling : null
  const gapPct = theirCounter !== undefined && ceiling > 0 ? (theirCounter - ceiling) / ceiling : null

  // An acceptance is the most time-sensitive event in the system. Every hour between
  // "yes" and a signed contract is an hour for a competing offer to arrive.
  if (intent === "ACCEPT") {
    return {
      urgency: "CALL_NOW",
      headline: `ACCEPTED at $${state.currentOffer.toLocaleString()} — ${state.listingId}. Call to paper it today.`,
      gapPct: null,
      gapDollars: null,
      callTarget,
    }
  }

  if (intent === "COUNTER" && theirCounter !== undefined && gapPct !== null) {
    // Inside authority: closeable right now without anyone approving anything.
    if (gapPct <= 0) {
      return {
        urgency: "CALL_NOW",
        headline: `Counter $${theirCounter.toLocaleString()} is INSIDE authority (ceiling $${ceiling.toLocaleString()}) on ${state.listingId}. Call and close.`,
        gapPct,
        gapDollars,
        callTarget,
      }
    }

    // The band that matters: above our ceiling, but close enough that a conversation
    // could plausibly bridge it. Emailing here wastes the moment.
    if (gapPct <= acquisitionConfig.callTriggerBandPct) {
      return {
        urgency: "CALL_NOW",
        headline: `Counter $${theirCounter.toLocaleString()} is ${(gapPct * 100).toFixed(1)}% over ceiling ($${gapDollars!.toLocaleString()}) on ${state.listingId}. Bridgeable — call the agent.`,
        gapPct,
        gapDollars,
        callTarget,
      }
    }

    // Wide but not hopeless — the ladder can work this without a human.
    if (gapPct <= acquisitionConfig.reviewTriggerBandPct) {
      return {
        urgency: "REVIEW_TODAY",
        headline: `Counter $${theirCounter.toLocaleString()} is ${(gapPct * 100).toFixed(1)}% over ceiling on ${state.listingId}. Ladder is working it; look today.`,
        gapPct,
        gapDollars,
        callTarget,
      }
    }

    return {
      urgency: "QUEUE",
      headline: `Counter $${theirCounter.toLocaleString()} is ${(gapPct * 100).toFixed(1)}% over ceiling on ${state.listingId}. Far apart.`,
      gapPct,
      gapDollars,
      callTarget,
    }
  }

  // New facts can turn a rejected deal into a live one, and only a person can verify
  // a claim about a roof. Worth a same-day look, not a same-minute call.
  if (intent === "NEW_INFORMATION") {
    return {
      urgency: "REVIEW_TODAY",
      headline: `New information on ${state.listingId} — re-underwrite before replying.`,
      gapPct,
      gapDollars,
      callTarget,
    }
  }

  if (intent === "QUESTION" || intent === "REJECT") {
    return { urgency: "QUEUE", headline: `${intent} on ${state.listingId}.`, gapPct, gapDollars, callTarget }
  }

  return { urgency: "NONE", headline: `No action needed on ${state.listingId}.`, gapPct, gapDollars }
}
