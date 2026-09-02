/**
 * lib/acquisition/suppression.ts — Do not mail our own clients.
 *
 * Both campaigns source from public data. The agent campaign reads MLS and DBPR
 * records; the wholesaler campaign reads public Facebook investor groups. REIT's
 * clients are in both, because they are cash buyers advertising to the same
 * market we are prospecting. Without this gate, Elevate's first send goes to
 * Elevate, and to whichever agency stablemates share the footprint.
 *
 * The list itself is derived — scripts/build-suppression.py writes
 * data/suppression/clients.json from the Whop billing roster and the client
 * project folders. This file only decides what counts as a match.
 *
 * WHAT COUNTS AS EVIDENCE
 *
 * WHY THE EMAILS ARE HASHED
 *
 * clients.json is committed, and 202 client billing addresses do not belong in
 * git history where they outlive any decision to remove them. The gate only ever
 * asks whether an address is on the list, and a digest answers that as well as
 * the address does. Domains stay in the clear because they are public company
 * identities and a blocked-send report has to name the client.
 *
 * An earlier version matched client brand names anywhere in a scraped post and
 * flagged 44 of 559 people, because "Speedy Home Buyer Tampa Bay" hits any post
 * mentioning Tampa and the bay. Identity is in who sent the message, not in
 * which city the deal is in. So brands are matched against the contact's name
 * and email only, and single-word brand hits ("Legacy", "Elevate" — words that
 * appear in a hundred unrelated companies) are a REVIEW, never a block.
 *
 * FAILURE DIRECTION
 *
 * This gate fails CLOSED. A missing or unreadable list throws rather than
 * returning "not suppressed", because the cost of the two outcomes is not
 * symmetric: a blocked send is a delay, an unblocked one is a client receiving
 * a cold pitch from their own agency.
 */

import { createHash } from "node:crypto"

import suppressionData from "@/data/suppression/clients.json"

export type SuppressionVerdict = {
  /** True only for evidence strong enough to act on without a human. */
  suppressed: boolean
  /** Set when the evidence is real but ambiguous. Hold, do not block. */
  review: boolean
  /** Every signal found, so a decision can be audited later. */
  reasons: string[]
}

type Brand = { display: string; tokens: string[]; sources: string[] }
type Override = { match: string; reason: string }

type SuppressionList = {
  generatedAt: string
  emailHashAlgo: string
  emailHashes: string[]
  domains: string[]
  brands: Brand[]
  generic: string[]
  overrides?: { block?: Override[]; allow?: Override[] }
}

const list = suppressionData as unknown as SuppressionList

if (!list?.emailHashes?.length || !list?.brands?.length) {
  throw new Error(
    "data/suppression/clients.json is empty or malformed. Run scripts/build-suppression.py. " +
      "Refusing to run outreach with no client gate.",
  )
}

const EMAIL_HASHES = new Set(list.emailHashes)
const DOMAINS = new Set(list.domains.map((d) => d.toLowerCase()))

/** Must stay byte-identical to digest() in scripts/build-suppression.py. */
const HASH_SALT = "reit-suppression-v1:"
const hashEmail = (addr: string): string =>
  createHash("sha256").update(HASH_SALT + addr.toLowerCase().trim()).digest("hex")

const norm = (s: string): string =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const tokens = (s: string): string[] => norm(s).split(" ").filter((t) => t.length > 2)

const overrideHit = (name: string, rules: Override[] | undefined): Override | undefined => {
  const n = norm(name)
  return rules?.find((r) => n === norm(r.match) || n.includes(norm(r.match)))
}

export type SuppressionInput = {
  /** Contact or company name as it appears on the record. */
  name?: string
  /** Any email we hold for them. */
  email?: string
}

/**
 * Decide whether a prospect is one of ours.
 *
 * Order matters. Manual allows run first — they exist precisely to overrule the
 * derived matcher on names it gets wrong, and an allow that ran second would
 * never fire on anything the matcher had already blocked.
 */
export function checkSuppression(input: SuppressionInput): SuppressionVerdict {
  const name = input.name ?? ""
  const email = (input.email ?? "").toLowerCase().trim()
  const reasons: string[] = []

  const allowed = overrideHit(name, list.overrides?.allow)
  if (allowed) {
    return { suppressed: false, review: false, reasons: [`manual allow: ${allowed.reason}`] }
  }

  const blocked = overrideHit(name, list.overrides?.block)
  if (blocked) reasons.push(`manual block: ${blocked.reason}`)

  if (email && EMAIL_HASHES.has(hashEmail(email))) {
    reasons.push(`client billing email: ${email}`)
  }

  const domain = email.includes("@") ? email.split("@")[1] : ""
  if (domain && DOMAINS.has(domain)) reasons.push(`client domain: ${domain}`)

  // Brands run against identity fields only. See the note at the top of the file.
  const nameNorm = norm(`${name} ${email.split("@")[0] ?? ""}`)
  const nameToks = new Set(tokens(`${name} ${email.split("@")[0] ?? ""}`))
  let ambiguous = false

  for (const brand of list.brands) {
    const key = brand.tokens.join(" ")
    if (brand.tokens.length >= 2) {
      if (nameNorm.includes(key)) {
        reasons.push(`client brand "${brand.display}"`)
      } else if (brand.tokens.filter((t) => nameToks.has(t)).length >= 2) {
        reasons.push(`client brand "${brand.display}" (two words)`)
      }
    } else if (brand.tokens.length === 1 && nameToks.has(brand.tokens[0])) {
      // One shared word is a coincidence far more often than it is a client.
      reasons.push(`possible client brand "${brand.display}" (single word, needs eyes)`)
      ambiguous = true
    }
  }

  const hard = reasons.filter((r) => !r.startsWith("possible"))
  return { suppressed: hard.length > 0, review: hard.length === 0 && ambiguous, reasons }
}

/** Split a batch into what can be mailed, what is ours, and what needs a human. */
export function partitionBySuppression<T extends SuppressionInput>(
  rows: T[],
): { send: T[]; suppressed: Array<T & { reasons: string[] }>; review: Array<T & { reasons: string[] }> } {
  const send: T[] = []
  const suppressed: Array<T & { reasons: string[] }> = []
  const review: Array<T & { reasons: string[] }> = []
  for (const row of rows) {
    const v = checkSuppression(row)
    if (v.suppressed) suppressed.push({ ...row, reasons: v.reasons })
    else if (v.review) review.push({ ...row, reasons: v.reasons })
    else send.push(row)
  }
  return { send, suppressed, review }
}

export const suppressionListGeneratedAt = list.generatedAt
