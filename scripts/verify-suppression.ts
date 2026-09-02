/**
 * scripts/verify-suppression.ts — The client gate, and specifically its failure direction.
 *
 * Run:  npx tsx scripts/verify-suppression.ts
 *
 * The cases that matter here are the near-misses. A gate that blocks obvious
 * matches is easy; the ones that cost money are a client who slips through on a
 * spelling, and a stranger who gets blocked because they share one common word
 * with a client's brand. Both are tested below with real names from the pull.
 */

import { checkSuppression, partitionBySuppression, suppressionListGeneratedAt } from "../lib/acquisition/suppression"

let failures = 0
const check = (name: string, cond: boolean, detail = "") => {
  if (!cond) failures++
  console.log(`${cond ? "PASS" : "FAIL"}  ${name.padEnd(52)}${detail ? ` ${detail}` : ""}`)
}

console.log(`suppression list generated ${suppressionListGeneratedAt}\n`)

// --- Blocks: evidence strong enough to act on with no human in the loop ------
const billing = checkSuppression({ name: "Yousef", email: "yseo@masonri.com" })
check("client billing email blocks", billing.suppressed, billing.reasons[0])

const domain = checkSuppression({ name: "Someone New", email: "newhire@elevategrouprei.com" })
check("client domain blocks a new address", domain.suppressed, domain.reasons[0])

const franchise = checkSuppression({ name: "Joe Homebuyer of Central Florida" })
check("manual block on the CFL franchisee", franchise.suppressed, franchise.reasons[0])

// --- Allows: near-misses that cost real prospects if they block --------------
const lender = checkSuppression({
  name: "Legacy Griffin Funding Solutions",
  email: "nicoleg@griffinfundingsolutions.com",
})
check("'Legacy' alone does not block a lender", !lender.suppressed, lender.reasons[0] ?? "")

const jax = checkSuppression({ name: "LG Elevate" })
check("'Elevate' alone does not block a stranger", !jax.suppressed, jax.reasons[0] ?? "")

const md = checkSuppression({ name: "Suncoast Sales Team" })
check("'Suncoast' alone does not block a stranger", !md.suppressed, md.reasons[0] ?? "")

// --- The city bug that produced 44 false positives on the first pass ---------
const city = checkSuppression({ name: "Sam Studioz" })
check("a Tampa wholesaler is not a Tampa client", !city.suppressed && !city.review)

const plain = checkSuppression({ name: "Gary L. Jones Jr.", email: "gary@gmail.com" })
check("an ordinary person passes clean", !plain.suppressed && !plain.review)

// --- An allow must beat a derived block, or it can never fire ----------------
check(
  "manual allow outranks the derived matcher",
  checkSuppression({ name: "LG Elevate" }).reasons.some((r) => r.startsWith("manual allow")),
)

// --- Partitioning keeps every row, in exactly one bucket --------------------
const batch = [
  { name: "Gary L. Jones Jr.", email: "gary@gmail.com" },
  { name: "Yousef", email: "yseo@masonri.com" },
  { name: "Joe Homebuyer of Central Florida" },
  { name: "Mark Price", email: "" },
]
const parts = partitionBySuppression(batch)
check(
  "partition loses nothing",
  parts.send.length + parts.suppressed.length + parts.review.length === batch.length,
  `${parts.send.length} send / ${parts.suppressed.length} blocked / ${parts.review.length} review`,
)
check("partition blocks both clients", parts.suppressed.length === 2)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 1 - 1 : 1)
