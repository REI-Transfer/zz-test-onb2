/**
 * lib/acquisition/negotiation/handle.ts — One inbound reply, end to end.
 *
 *   classify (data) → decide (code) → draft (prose) → validate (code) → new state
 *
 * Like the evaluate endpoint, this decides and drafts but never sends. Delivery and
 * threading stay in the mail layer so a run can be inspected and replayed.
 */

import acquisitionConfig from "../config"
import type { Listing } from "../types"
import { checkMandatoryKeywords, helpResponse, type Channel } from "./channel"
import { classifyReply, type Classification } from "./classify"
import { assessUrgency, type EscalationSignal } from "./escalation"
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
  /**
   * How fast a person needs to touch this, and why. CALL_NOW means the gap is
   * bridgeable by phone right now and another email is the wrong move.
   */
  urgency: EscalationSignal
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
  /** Defaults to email. SMS changes both the drafting voice and the length ceiling. */
  channel?: Channel
}): Promise<HandleResult> {
  const { state, listing, inboundBody } = input
  const channel: Channel = input.channel ?? "email"
  const receivedAt = input.receivedAt ?? new Date().toISOString()

  // MANDATORY KEYWORDS FIRST — before any model call, on every channel.
  // Honouring an opt-out is a legal obligation with statutory damages attached, so it
  // must not depend on a classifier being right. See channel.ts.
  const keyword = checkMandatoryKeywords(inboundBody)

  if (keyword.kind === "STOP") {
    const reason = "Recipient sent a STOP/unsubscribe keyword; suppressed permanently."
    return {
      classification: { intent: "NOT_INTERESTED_STOP", newFacts: [], containsInstructionLikeText: false, confidence: 1 },
      action: { kind: "SUPPRESS", reason },
      draft: null,
      urgency: { urgency: "NONE", headline: `Suppressed ${state.listingId}; no action needed.`, gapPct: null, gapDollars: null },
      nextState: {
        ...state,
        stage: "DEAD",
        escalationReason: reason,
        messages: [...state.messages, { direction: "inbound", channel, at: receivedAt, body: inboundBody }],
        updatedAt: receivedAt,
      },
      escalation: reason,
    }
  }

  if (keyword.kind === "HELP") {
    // Fixed text, never model-generated — it must be stable and accurate.
    const body = helpResponse(acquisitionConfig.buyerEntity || "Cash buyer", acquisitionConfig.buyerPhone)
    return {
      classification: { intent: "QUESTION", newFacts: [], containsInstructionLikeText: false, confidence: 1 },
      action: { kind: "ANSWER_ONLY", rationale: "HELP keyword; returned the fixed disclosure." },
      draft: { body, channel },
      urgency: { urgency: "NONE", headline: `HELP keyword on ${state.listingId}; auto-answered.`, gapPct: null, gapDollars: null },
      nextState: {
        ...state,
        messages: [
          ...state.messages,
          { direction: "inbound", channel, at: receivedAt, body: inboundBody },
          { direction: "outbound", channel, at: new Date().toISOString(), body },
        ],
        updatedAt: receivedAt,
      },
    }
  }

  const classification = await classifyReply(inboundBody)

  // How fast a person needs this, computed independently of what the policy decides to
  // send. A thread can be both auto-answerable AND worth a phone call — the ladder
  // conceding does not mean nobody should be dialling.
  const urgency = assessUrgency({
    state,
    intent: classification.intent,
    theirCounter: classification.counterPrice,
    agent: listing.listAgent,
  })

  const inboundMessage: NegotiationMessage = {
    direction: "inbound",
    channel,
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
      urgency,
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
      urgency,
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
      urgency,
    }
  }

  if (action.kind === "IGNORE") {
    return { classification, action, draft: null, nextState: withInbound, urgency }
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
        urgency,
      }
    }
  }

  const draft = await draftReply({ state: withInbound, action, listing, inboundBody, channel })

  if (!draft) {
    const reason = "Could not produce a valid reply draft; held for human review."
    return {
      classification,
      action: { kind: "ESCALATE", reason },
      draft: null,
      nextState: { ...withInbound, stage: "ESCALATED", escalationReason: reason },
      escalation: reason,
      urgency,
    }
  }

  const conceded = action.kind === "COUNTER"

  return {
    classification,
    action,
    draft,
    urgency,
    nextState: {
      ...withInbound,
      stage: stageFor(action, withInbound.stage),
      currentOffer: conceded ? action.offerPrice : withInbound.currentOffer,
      concessionsUsed: conceded ? withInbound.concessionsUsed + 1 : withInbound.concessionsUsed,
      messages: [
        ...withInbound.messages,
        {
          direction: "outbound",
          channel,
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
