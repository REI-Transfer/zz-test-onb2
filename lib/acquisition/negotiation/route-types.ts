/**
 * lib/acquisition/negotiation/route-types.ts — Re-exports for the API layer.
 *
 * The reply route validates a narrower payload than the full domain `Listing` (it does
 * not need photos or remarks to answer an email), so it casts its parsed input to these
 * aliases at the single boundary rather than duplicating the domain types.
 */

export type { Listing } from "../types"
export type { NegotiationState as NegotiationStateInput } from "./types"
