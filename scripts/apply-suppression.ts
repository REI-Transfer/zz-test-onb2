/**
 * scripts/apply-suppression.ts — Run the client gate over a CSV and split it.
 *
 * Run:  npx tsx scripts/apply-suppression.ts <in.csv> [--name-col=NAME] [--email-col=EMAIL]
 *
 * Writes <in>-clean.csv (safe to mail), <in>-suppressed.csv (ours), and
 * <in>-review.csv (ambiguous, needs eyes) beside the input. Nothing is deleted:
 * a blocked row goes to its own file with the reason attached, so the call can
 * be argued with later.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { checkSuppression } from "../lib/acquisition/suppression"

/** Minimal RFC-4180 reader. The scraped posts contain commas, quotes and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c !== "\r") field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "")
}

const esc = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const toCsv = (rows: string[][]): string => rows.map((r) => r.map(esc).join(",")).join("\n") + "\n"

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith("--"))
if (!input) {
  console.error("usage: apply-suppression.ts <in.csv> [--name-col=X] [--email-col=Y]")
  process.exit(1)
}
const flag = (k: string): string | undefined =>
  args.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")

const rows = parseCsv(readFileSync(input, "utf8"))
const header = rows[0]
const body = rows.slice(1)

const findCol = (explicit: string | undefined, candidates: string[]): number => {
  if (explicit) {
    const i = header.indexOf(explicit)
    if (i < 0) {
      console.error(`no column named "${explicit}"`)
      process.exit(1)
    }
    return i
  }
  for (const c of candidates) {
    const i = header.findIndex((h) => h.toLowerCase() === c)
    if (i >= 0) return i
  }
  return -1
}

const nameCol = findCol(flag("name-col"), ["wholesaler", "name", "full_name", "agent_name", "contact"])
const emailCol = findCol(flag("email-col"), ["email", "agent_email", "email_address"])
if (nameCol < 0 && emailCol < 0) {
  console.error(`found neither a name nor an email column in: ${header.join(", ")}`)
  process.exit(1)
}

const clean: string[][] = []
const blocked: string[][] = []
const review: string[][] = []
// One decision per identity, not per row: a wholesaler with nine deals must not be
// half-suppressed because one of their posts happened to carry a client's domain.
const seen = new Map<string, ReturnType<typeof checkSuppression>>()

for (const r of body) {
  const name = nameCol >= 0 ? (r[nameCol] ?? "") : ""
  const email = emailCol >= 0 ? (r[emailCol] ?? "") : ""
  const key = `${name} ${email}`.toLowerCase()
  let v = seen.get(key)
  if (!v) {
    v = checkSuppression({ name, email })
    seen.set(key, v)
  }
  if (v.suppressed) blocked.push([...r, v.reasons.join("; ")])
  else if (v.review) review.push([...r, v.reasons.join("; ")])
  else clean.push(r)
}

const stem = input.replace(/\.csv$/i, "")
writeFileSync(`${stem}-clean.csv`, toCsv([header, ...clean]))
if (blocked.length) writeFileSync(`${stem}-suppressed.csv`, toCsv([[...header, "suppression_reason"], ...blocked]))
if (review.length) writeFileSync(`${stem}-review.csv`, toCsv([[...header, "suppression_reason"], ...review]))

const idOf = (r: string[]): string => (nameCol >= 0 ? r[nameCol] : r[emailCol])
const people = new Set(body.map(idOf))
const blockedPeople = new Set(blocked.map(idOf))
console.log(`${input}`)
console.log(`  ${body.length} rows / ${people.size} identities`)
console.log(`  clean      ${clean.length} rows  -> ${stem}-clean.csv`)
console.log(`  suppressed ${blocked.length} rows (${blockedPeople.size} identities)`)
console.log(`  review     ${review.length} rows`)
