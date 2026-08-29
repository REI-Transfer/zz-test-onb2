/**
 * POST /api/acquisition/evaluate
 *
 * Evaluates one normalized MLS listing and returns a decision (SEND / REVIEW / REJECT),
 * the offer math behind it, and a rendered LOI when there is one. Called per-listing by
 * the n8n workflow that polls the Stellar MLS feed.
 *
 * This endpoint never sends anything. It decides and renders; delivery, suppression,
 * and the daily send ledger live in n8n where they can be inspected and replayed.
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { authorize } from "@/lib/acquisition/auth"
import { evaluateListing } from "@/lib/acquisition/pipeline"

// The vision pass makes this materially slower than a typical route.
export const maxDuration = 60
export const dynamic = "force-dynamic"

const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  county: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
})

const ListAgentSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mlsId: z.string().optional(),
  brokerageName: z.string().optional(),
})

const ListingSchema = z.object({
  listingKey: z.string().min(1),
  listingId: z.string().min(1),
  kind: z.enum(["single-family", "duplex", "triplex", "quadplex"]),
  listPrice: z.number().positive(),
  livingArea: z.number().nonnegative().optional(),
  lotSizeSqft: z.number().nonnegative().optional(),
  yearBuilt: z.number().int().optional(),
  bedrooms: z.number().nonnegative().optional(),
  bathrooms: z.number().nonnegative().optional(),
  address: AddressSchema,
  publicRemarks: z.string().default(""),
  privateRemarks: z.string().optional(),
  daysOnMarket: z.number().nonnegative().optional(),
  photos: z.array(z.string().url()).default([]),
  listAgent: ListAgentSchema,
  standardStatus: z.string().min(1),
  modificationTimestamp: z.string().min(1),
})

const ComparableSchema = z.object({
  address: z.string(),
  soldPrice: z.number().positive(),
  soldDate: z.string(),
  livingArea: z.number().nonnegative(),
  distanceMiles: z.number().nonnegative().optional(),
})

const ArvSchema = z.object({
  arv: z.number().nonnegative(),
  comparables: z.array(ComparableSchema).default([]),
  source: z.enum(["comps", "provider", "manual"]),
})

const OwnershipSchema = z.object({
  estimatedMortgageBalance: z.number().nonnegative().optional(),
  otherLiens: z.number().nonnegative().optional(),
  estimatedEquity: z.number().optional(),
  ownerOccupied: z.boolean().optional(),
  ownershipYears: z.number().nonnegative().optional(),
  distressFlags: z.array(z.string()).optional(),
})

const RequestSchema = z.object({
  listing: ListingSchema,
  arv: ArvSchema,
  ownership: OwnershipSchema.optional(),
  submarketMedianPerSqft: z.number().positive().optional(),
  sentToday: z.number().int().nonnegative().optional(),
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
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  try {
    const result = await evaluateListing(parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    // Surface the listing id so a failure in the n8n run is traceable to a record.
    console.error(`[acquisition] evaluation failed for ${parsed.data.listing.listingId}:`, error)
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 })
  }
}
