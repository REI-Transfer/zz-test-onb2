/**
 * lib/acquisition/negotiation/policy.ts — Authority limits and the concession ladder.
 *
 * This file decides every number. The language model downstream only writes prose
 * around what is decided here, and validateOutboundOffer() re-checks the number
 * immediately before send regardless of what any model produced.
 *
 * Two rules that are not configurable, because making them configurable would defeat
 * the point of having them:
 *
 *   1. The bot never accepts. A counter inside our authority ESCALATES to a human,
 *      who writes the contract. An automated system should not create a binding
 *      obligation to buy real property.
 *   2. The bot never bids against itself. A rejection with no counter does not
 *      trigger a concession — only a live counter above our number does.
 */

import acquisitionConfig from "../config"
import type { NegotiationAction, NegotiationState, ReplyIntent } from "./types"

/**
 * Maximum allowable offer — the walk-away ceiling.
 *
 * Deliberately derived from the SAME ARV and repair figures captured when the LOI was
 * sent, not recomputed live. If new facts arrive (a replaced roof, a corrected square
 * footage), that is a NEW_INFORMATION escalation for a human to re-underwrite — not a
 * silent ceiling change mid-thread.
 */
export function maxAllowableOffer(state: NegotiationState): number {
  const { arv, repairs } = state.economics
  return Math.round(arv * acquisitionConfig.negotiationMaxArvMultiplier - repairs)
}

/** Fractions of the remaining gap conceded at each round. Shrinking steps signal a floor. */
function concessionSteps(): number[] {
  return acquisitionConfig.negotiationConcessionSteps
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1)
}

/**
 * Next number on the ladder, or null when authority is exhausted.
 * Each step closes a shrinking fraction of the distance between where we are and the
 * ceiling, so offers approach the ceiling without ever reaching it by accident.
 */
export function nextConcession(state: NegotiationState): number | null {
  const steps = concessionSteps()
  if (state.concessionsUsed >= steps.length) return null

  const ceiling = maxAllowableOffer(state)
  const gap = ceiling - state.currentOffer
  if (gap <= 0) return null

  const step = steps[state.concessionsUsed]
  const next = Math.round(state.currentOffer + gap * step)

  // Round to the nearest $500 so offers read as considered positions, not model output.
  const rounded = Math.round(next / 500) * 500
  return Math.min(rounded, ceiling)
}

/**
 * Hard validation, called immediately before any outbound send. Independent of the
 * model and of decideAction() — this is the last gate, and it fails closed.
 */
export function validateOutboundOffer(
  state: NegotiationState,
  price: number,
): { ok: true } | { ok: false; reason: string } {
  const ceiling = maxAllowableOffer(state)

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: `Offer ${price} is not a positive number.` }
  }
  if (price > ceiling) {
    return { ok: false, reason: `Offer $${price.toLocaleString()} exceeds authority ceiling $${ceiling.toLocaleString()}.` }
  }
  if (price < state.currentOffer) {
    return { ok: false, reason: `Offer $${price.toLocaleString()} is below our standing offer $${state.currentOffer.toLocaleString()}; we do not retract.` }
  }
  if (state.theirLastCounter !== undefined && price > state.theirLastCounter) {
    return { ok: false, reason: `Offer $${price.toLocaleString()} exceeds their counter $${state.theirLastCounter.toLocaleString()}; never bid above the ask.` }
  }
  return { ok: true }
}

export type DecideInput = {
  state: NegotiationState
  intent: ReplyIntent
  /** Price named in their reply, when the classifier found one. */
  theirCounter?: number
}

export function decideAction({ state, intent, theirCounter }: DecideInput): NegotiationAction {
  if (!acquisitionConfig.negotiationEnabled) {
    return { kind: "ESCALATE", reason: "NEGOTIATION_ENABLED is not set to \"true\"." }
  }

  if (state.stage === "ESCALATED" || state.stage === "DEAD" || state.stage === "ACCEPTED_PENDING_HUMAN") {
    return { kind: "IGNORE", reason: `Thread is already in terminal stage ${state.stage}.` }
  }

  switch (intent) {
    case "NOT_INTERESTED_STOP":
      // Honour this immediately and permanently. One agent asking to be left alone is
      // cheap; ignoring it is how you lose a market.
      return { kind: "SUPPRESS", reason: "Agent asked not to be contacted about this property." }

    case "AUTO_REPLY":
      return { kind: "IGNORE", reason: "Out-of-office or autoresponder; no action." }

    case "ACCEPT":
      return { kind: "ESCALATE", reason: "Agent accepted. A person writes the contract — the bot does not bind." }

    case "NEW_INFORMATION":
      // Facts changed. Re-underwriting mid-thread from unverified email claims is
      // exactly how a bot talks itself into overpaying.
      return { kind: "ESCALATE", reason: "Reply contains facts that change the underwriting; needs human re-underwrite." }

    case "QUESTION":
      return { kind: "ANSWER_ONLY", rationale: "Answer from known terms without moving price." }

    case "REJECT":
      // No counter on the table means no reason to improve. Leave the standing offer
      // in place and keep the door open.
      return { kind: "HOLD_FIRM", rationale: "Declined without a counter; restate standing offer and leave it open." }

    case "COUNTER": {
      if (theirCounter === undefined) {
        return { kind: "ESCALATE", reason: "Classified as a counter but no price was extractable." }
      }

      const ceiling = maxAllowableOffer(state)

      if (theirCounter <= state.currentOffer) {
        return { kind: "ESCALATE", reason: `Counter $${theirCounter.toLocaleString()} is at or below our standing offer — unusual; needs a human.` }
      }

      if (theirCounter <= ceiling) {
        return {
          kind: "ESCALATE",
          reason: `Counter $${theirCounter.toLocaleString()} is within authority (ceiling $${ceiling.toLocaleString()}). Deal is live — a person should close it.`,
        }
      }

      const next = nextConcession(state)
      if (next === null) {
        return {
          kind: "HOLD_FIRM",
          rationale: `Concession ladder exhausted at $${state.currentOffer.toLocaleString()}; ceiling is $${ceiling.toLocaleString()}.`,
        }
      }

      return {
        kind: "COUNTER",
        offerPrice: next,
        rationale: `Counter $${theirCounter.toLocaleString()} is above ceiling $${ceiling.toLocaleString()}; conceding to $${next.toLocaleString()} (round ${state.concessionsUsed + 1}).`,
      }
    }

    case "UNCLEAR":
    default:
      return { kind: "ESCALATE", reason: "Could not classify the reply with confidence." }
  }
}
