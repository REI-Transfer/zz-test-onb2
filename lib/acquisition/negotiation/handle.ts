/**
 * lib/acquisition/negotiation/handle.ts — One inbound reply, end to end.
 *
 *   classify (data) → decide (code) → draft (prose) → validate (code) → new state
 *
 * Like the evaluate endpoint, this decides and drafts but never sends. Delivery and
 * threading stay in the mail layer so a run can be inspected and replayed.
 */

import type { Listing } from "../types"
import { classifyReply, type Classification } from "./classify"
import { decideAction, maxAllowableOffer, validateOutboundOffer } from "./policy"
import { draftReply, type Draft } from "./respond"
import type { NegotiationAction, NegotiationMessage, NegotiationState } from "./types"

export type HandleResult = {
  classification: Classification
  action: NegotiationAction
  draft: Draft | null
  nextState: NegotiationState
  /** Populated whenever a human needs to look at this thread. */
  escalation?: string
}

/** Terminal transitions that must not be reopened by a later message. */
function stageFor(action: NegotiationAction, current: NegotiationState["stage"]): NegotiationState["stage"] {
  switch (action.kind) {
    case "SUPPRESS": return "DEAD"
    case "ESCALATE": return "ESCALATED"
    case "COUNTER":  return "NEGOTIATING"
    default:         return current
  }
}

export async function handleInboundReply(input: {
  state: NegotiationState
  listing: Listing
  inboundBody: string
  receivedAt?: string
}): Promise<HandleResult> {
  const { state, listing, inboundBody } = input
  const receivedAt = input.receivedAt ?? new Date().toISOString()

  const classification = await classifyReply(inboundBody)

  const inboundMessage: NegotiationMessage = {
    direction: "inbound",
    at: receivedAt,
    body: inboundBody,
    offerPrice: classification.counterPrice,
  }

  const withInbound: NegotiationState = {
    ...state,
    theirLastCounter: classification.counterPrice ?? state.theirLastCounter,
    messages: [...state.messages, inboundMessage],
    updatedAt: receivedAt,
  }

  // An ordinary agent reply does not address an automated system. When one does, that
  // is either a probe or a forwarded thread carrying someone else's instructions —
  // either way a person should read it before anything goes back out.
  if (classification.containsInstructionLikeText) {
    const reason = "Reply contains text directed at an automated system; held for human review."
    return {
      classification,
      action: { kind: "ESCALATE", reason },
      draft: null,
      nextState: { ...withInbound, stage: "ESCALATED", escalationReason: reason },
      escalation: reason,
    }
  }

  const action = decideAction({
    state: withInbound,
    intent: classification.intent,
    theirCounter: classification.counterPrice,
  })

  // Accepting is the one outcome that changes stage without escalating through the
  // normal path — it is a human handoff to write a contract, not a failure.
  if (classification.intent === "ACCEPT" && action.kind === "ESCALATE") {
    return {
      classification,
      action,
      draft: null,
      nextState: { ...withInbound, stage: "ACCEPTED_PENDING_HUMAN", escalationReason: action.reason },
      escalation: action.reason,
    }
  }

  if (action.kind === "ESCALATE" || action.kind === "SUPPRESS") {
    const reason = action.reason
    return {
      classification,
      action,
      draft: null,
      nextState: { ...withInbound, stage: stageFor(action, withInbound.stage), escalationReason: reason },
      escalation: reason,
    }
  }

  if (action.kind === "IGNORE") {
    return { classification, action, draft: null, nextState: withInbound }
  }

  // Last gate before a number can leave the building. Runs independently of the model
  // and of decideAction(); a failure here escalates rather than sending anyway.
  if (action.kind === "COUNTER") {
    const check = validateOutboundOffer(withInbound, action.offerPrice)
    if (!check.ok) {
      const reason = `Blocked outbound offer: ${check.reason}`
      console.error(`[negotiation] ${listing.listingId} — ${reason}`)
      return {
        classification,
        action: { kind: "ESCALATE", reason },
        draft: null,
        nextState: { ...withInbound, stage: "ESCALATED", escalationReason: reason },
        escalation: reason,
      }
    }
  }

  const draft = await draftReply({ state: withInbound, action, listing, inboundBody })

  if (!draft) {
    const reason = "Could not produce a valid reply draft; held for human review."
    return {
      classification,
      action: { kind: "ESCALATE", reason },
      draft: null,
      nextState: { ...withInbound, stage: "ESCALATED", escalationReason: reason },
      escalation: reason,
    }
  }

  const conceded = action.kind === "COUNTER"

  return {
    classification,
    action,
    draft,
    nextState: {
      ...withInbound,
      stage: stageFor(action, withInbound.stage),
      currentOffer: conceded ? action.offerPrice : withInbound.currentOffer,
      concessionsUsed: conceded ? withInbound.concessionsUsed + 1 : withInbound.concessionsUsed,
      messages: [
        ...withInbound.messages,
        {
          direction: "outbound",
          at: new Date().toISOString(),
          subject: draft.subject,
          body: draft.body,
          offerPrice: draft.offerPrice,
        },
      ],
    },
  }
}

export { maxAllowableOffer }
