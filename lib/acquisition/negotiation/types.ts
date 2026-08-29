/**
 * lib/acquisition/negotiation/types.ts — State for an email negotiation with a
 * listing agent.
 *
 * The central design rule, enforced structurally rather than by prompting:
 *
 *     THE MODEL NEVER CHOOSES A NUMBER.
 *
 * Code computes the next offer from the concession ladder in policy.ts. The model
 * only classifies what came back and writes prose around a number already decided.
 * That makes a successful prompt injection in an inbound email a nuisance (bad
 * wording) rather than a financial event (bad offer).
 */

/** Where a thread is in its lifecycle. */
export type NegotiationStage =
  | "OPENED"        // LOI sent, nothing back yet
  | "NEGOTIATING"   // at least one counter exchanged, still inside authority
  | "ESCALATED"     // handed to a human; the bot will not send again
  | "ACCEPTED_PENDING_HUMAN" // they took a number — a person writes the contract
  | "DEAD"          // declined, expired, or suppressed

/** What an inbound reply from the listing agent actually was. */
export type ReplyIntent =
  | "COUNTER"           // named a price
  | "ACCEPT"            // accepted our number
  | "REJECT"            // declined, no counter
  | "QUESTION"          // wants info (proof of funds, timeline, terms)
  | "NEW_INFORMATION"   // facts that change the math (new roof, permits, sqft)
  | "NOT_INTERESTED_STOP" // asked not to be contacted
  | "AUTO_REPLY"        // out-of-office, autoresponder, bounce
  | "UNCLEAR"

/** One outbound or inbound message in the thread. */
export type NegotiationMessage = {
  direction: "outbound" | "inbound"
  at: string
  subject?: string
  body: string
  /** Offer this message carried, when it carried one. */
  offerPrice?: number
}

export type NegotiationState = {
  listingKey: string
  listingId: string
  stage: NegotiationStage
  /** Our opening offer — round 0. */
  openingOffer: number
  /** The most recent number WE have on the table. */
  currentOffer: number
  /** Their most recent counter, when they've made one. */
  theirLastCounter?: number
  /** Concessions we have already made. Bounds the ladder. */
  concessionsUsed: number
  /** Immutable economics captured at LOI time. */
  economics: {
    arv: number
    repairs: number
    listPrice: number
  }
  messages: NegotiationMessage[]
  /** Set when stage is ESCALATED or DEAD. */
  escalationReason?: string
  updatedAt: string
}

/** What the policy engine decided to do next. Consumed by respond.ts. */
export type NegotiationAction =
  | { kind: "COUNTER"; offerPrice: number; rationale: string }
  | { kind: "HOLD_FIRM"; rationale: string }
  | { kind: "ANSWER_ONLY"; rationale: string }
  | { kind: "ESCALATE"; reason: string }
  | { kind: "SUPPRESS"; reason: string }
  | { kind: "IGNORE"; reason: string }
