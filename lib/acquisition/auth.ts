/**
 * lib/acquisition/auth.ts — Shared bearer-token auth for the acquisition endpoints.
 *
 * Fails closed: an unset ACQ_API_SECRET means misconfiguration, not "open to
 * everyone". These endpoints price offers and draft correspondence sent under your
 * name, so they must never be publicly callable.
 */

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"

/** Constant-time compare so the secret can't be recovered by timing the endpoint. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Returns a response to short-circuit with, or null when the caller is authorized. */
export function authorize(request: Request): NextResponse | null {
  const expected = process.env.ACQ_API_SECRET
  if (!expected) {
    console.error("[acquisition] ACQ_API_SECRET is not set; refusing all requests")
    return NextResponse.json({ error: "Endpoint not configured" }, { status: 503 })
  }

  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
