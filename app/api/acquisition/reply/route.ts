/**
 * POST /api/acquisition/reply
 *
 * Handles one inbound reply from a listing agent: classifies it, applies the
 * concession policy, and returns a drafted response plus the updated thread state.
 *
 * Like /evaluate, this decides and drafts but NEVER sends. The mail layer owns
 * delivery and threading; persisting `nextState` is the caller's job. Every response
 * carrying `escalation` means a human must look before anything goes out.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { authorize } from "@/lib/acquisition/auth"
import { handleInboundReply } from "@/lib/acquisition/negotiation/handle"
import type { Listing, NegotiationStateInput } from "@/lib/acquisition/negotiation/route-types"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const MessageSchema = z.object({
  direction: z.enum(["outbound", "inbound"]),
  channel: z.enum(["email", "sms"]).default("email"),
  at: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  offerPrice: z.number().optional(),
})

const StateSchema = z.object({
  listingKey: z.string().min(1),
  listingId: z.string().min(1),
  stage: z.enum(["OPENED", "NEGOTIATING", "ESCALATED", "ACCEPTED_PENDING_HUMAN", "DEAD"]),
  openingOffer: z.number().positive(),
  currentOffer: z.number().positive(),
  theirLastCounter: z.number().positive().optional(),
  concessionsUsed: z.number().int().nonnegative(),
  economics: z.object({
    arv: z.number().positive(),
    repairs: z.number().nonnegative(),
    listPrice: z.number().positive(),
  }),
  messages: z.array(MessageSchema).default([]),
  escalationReason: z.string().optional(),
  updatedAt: z.string(),
})

const ListingSchema = z.object({
  listingKey: z.string().min(1),
  listingId: z.string().min(1),
  kind: z.enum(["single-family", "duplex", "triplex", "quadplex"]),
  listPrice: z.number().positive(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    county: z.string(),
    state: z.string(),
    postalCode: z.string(),
  }),
  publicRemarks: z.string().default(""),
  photos: z.array(z.string()).default([]),
  listAgent: z.object({
    fullName: z.string().min(1),
    email: z.string().email().optional(),
  }),
  standardStatus: z.string(),
  modificationTimestamp: z.string(),
})

const RequestSchema = z.object({
  state: StateSchema,
  listing: ListingSchema,
  inboundBody: z.string().min(1),
  receivedAt: z.string().optional(),
  channel: z.enum(["email", "sms"]).default("email"),
})

export async function POST(request: Request) {
  const denied = authorize(request)
  if (denied) return denied

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const result = await handleInboundReply({
      state: parsed.data.state as NegotiationStateInput,
      listing: parsed.data.listing as Listing,
      inboundBody: parsed.data.inboundBody,
      receivedAt: parsed.data.receivedAt,
      channel: parsed.data.channel,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[acquisition] reply handling failed for ${parsed.data.state.listingId}:`, error)
    return NextResponse.json({ error: "Reply handling failed" }, { status: 500 })
  }
}
