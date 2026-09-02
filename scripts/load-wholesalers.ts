/**
 * scripts/load-wholesalers.ts — Move the wholesaler pull out of a CSV and into the database.
 *
 * Run:  npx tsx scripts/load-wholesalers.ts <deals.csv> [--commit]
 *
 * Input is the file the Facebook pull produced: one row per deal, with the
 * person's details repeated on each of their rows.
 *
 * Idempotent. Re-running with a wider pull adds the new deals and refreshes
 * last_seen_at without disturbing anything already there -- including a phone
 * number added later by skip tracing, which the CSV does not know about and must
 * not overwrite with a blank.
 *
 * The client-roster gate runs on load rather than at send time. A person who
 * turns out to be a client should be marked the moment they enter the table, not
 * the moment somebody remembers to check.
 */

import { readFileSync } from "node:fs"
import { query, quote, table } from "../lib/acquisition/db"
import { checkSuppression } from "../lib/acquisition/suppression"

const args = process.argv.slice(2)
const input = args.find((a) => !a.startsWith("--"))
const COMMIT = args.includes("--commit")

if (!input) {
  console.error("usage: load-wholesalers.ts <deals.csv> [--commit]")
  process.exit(1)
}

/** Minimal RFC-4180 reader. Scraped posts carry commas, quotes and newlines. */
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

/**
 * Pull a usable key out of a profile URL.
 *
 * Two shapes turn up. A numeric id is permanent and is what you want. A `pfbid`
 * is Facebook's opaque per-viewer identifier and it ROTATES, so the same person
 * can reappear months later under a different one and enter the table twice.
 *
 * Kept anyway, prefixed so the two kinds are never confused. 62 of the 559 people
 * in the first pull have only a pfbid, and losing a ninth of the list to avoid an
 * occasional duplicate is the worse trade: a duplicate costs one extra message,
 * a dropped prospect costs the whole relationship. Dedupe on display name before
 * any send that spans more than one scrape.
 */
const fbId = (url: string): string | null => {
  const numeric = url.match(/facebook\.com\/(?:profile\.php\?id=)?(\d{6,})/)?.[1]
  if (numeric) return numeric
  const pfbid = url.match(/facebook\.com\/(pfbid[A-Za-z0-9]+)/)?.[1]
  return pfbid ? `pfbid:${pfbid}` : null
}

async function main(): Promise<void> {
  const rows = parseCsv(readFileSync(input!, "utf8"))
  const header = rows[0]
  const col = (name: string) => header.indexOf(name)
  const need = ["wholesaler", "fb_profile", "deal_no"]
  for (const n of need) {
    if (col(n) < 0) {
      console.error(`missing column "${n}". found: ${header.join(", ")}`)
      process.exit(1)
    }
  }

  type Person = {
    fbId: string
    name: string
    url: string
    phone: string
    email: string
    deals: Array<{ postId: string; date: string; street: string; city: string; price: string; text: string; url: string }>
  }
  const people = new Map<string, Person>()
  let noId = 0

  for (const r of rows.slice(1)) {
    const url = r[col("fb_profile")] ?? ""
    const id = fbId(url)
    if (!id) {
      // Neither kind of identifier present. A display name alone is not an
      // identity -- two people called "Mike" would merge into one prospect.
      noId++
      continue
    }
    const p = people.get(id) ?? {
      fbId: id,
      name: r[col("wholesaler")] ?? "",
      url,
      phone: r[col("phone")] ?? "",
      email: r[col("email")] ?? "",
      deals: [],
    }
    const dealUrl = r[col("deal_url")] ?? ""
    // The permalink is the only per-deal identifier the scrape carries. Without
    // one the same deal re-imports on every run.
    const postId = dealUrl.match(/(?:permalink|posts)\/(\d+)/)?.[1] ?? `${id}:${r[col("deal_date")] ?? ""}:${r[col("deal_address")] ?? ""}`
    p.deals.push({
      postId,
      date: r[col("deal_date")] ?? "",
      street: r[col("deal_address")] ?? "",
      city: r[col("deal_city")] ?? "",
      price: r[col("deal_price")] ?? "",
      text: r[col("deal_post")] ?? "",
      url: dealUrl,
    })
    people.set(id, p)
  }

  const gated = [...people.values()].map((p) => ({
    ...p,
    verdict: checkSuppression({ name: p.name, email: p.email }),
  }))
  const blocked = gated.filter((p) => p.verdict.suppressed)
  const dealCount = gated.reduce((n, p) => n + p.deals.length, 0)

  console.log(`${input}`)
  console.log(`  ${rows.length - 1} rows -> ${people.size} people, ${dealCount} deals`)
  const rotating = [...people.keys()].filter((k) => k.startsWith("pfbid:")).length
  console.log(`  ${noId} rows had no usable Facebook id and were dropped`)
  console.log(`  ${rotating} keyed on a rotating pfbid — may duplicate across scrapes`)
  console.log(`  reachable directly: ${gated.filter((p) => p.phone || p.email).length}`)
  console.log(`  client-roster blocks: ${blocked.length}`)
  for (const b of blocked) console.log(`    ${b.name} — ${b.verdict.reasons[0]}`)

  if (!COMMIT) {
    console.log("\ndry run. re-run with --commit to write.")
    return
  }

  for (let i = 0; i < gated.length; i += 100) {
    const chunk = gated.slice(i, i + 100)
    const values = chunk
      .map((p) =>
        "(" +
        [
          quote(p.fbId),
          quote(p.name),
          quote(p.url),
          quote(p.phone || null),
          quote(p.email || null),
          quote(p.phone || p.email ? "post" : null),
          "now()",
          "now()",
          p.verdict.suppressed ? "now()" : "null",
          quote(p.verdict.suppressed ? p.verdict.reasons.join("; ") : null),
        ].join(",") +
        ")",
      )
      .join(",")

    // A later skip trace is more informative than this CSV, so coalesce keeps
    // whatever is already there rather than blanking it.
    await query(`
      insert into ${table("acq_wholesalers")}
        (fb_id, display_name, fb_profile_url, phone, email, contact_source,
         first_seen_at, last_seen_at, suppressed_at, suppressed_reason)
      values ${values}
      on conflict (fb_id) do update set
        display_name      = excluded.display_name,
        fb_profile_url    = coalesce(excluded.fb_profile_url, ${table("acq_wholesalers")}.fb_profile_url),
        phone             = coalesce(${table("acq_wholesalers")}.phone, excluded.phone),
        email             = coalesce(${table("acq_wholesalers")}.email, excluded.email),
        last_seen_at      = now(),
        suppressed_at     = excluded.suppressed_at,
        suppressed_reason = excluded.suppressed_reason
    `)
  }

  const deals = gated.flatMap((p) => p.deals.map((d) => ({ ...d, fbId: p.fbId })))
  const seen = new Set<string>()
  const unique = deals.filter((d) => !seen.has(d.postId) && seen.add(d.postId))

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const values = chunk
      .map((d) => {
        const price = Number(d.price.replace(/[^0-9]/g, "")) || null
        const when = d.date && !Number.isNaN(Date.parse(d.date)) ? quote(new Date(d.date).toISOString()) : "null"
        return (
          "(" +
          [
            quote(d.postId),
            quote(d.fbId),
            when,
            quote(d.url || null),
            quote(d.street || null),
            quote(d.city || null),
            quote("FL"),
            quote(price),
            quote(d.text.slice(0, 8000) || null),
            "now()",
          ].join(",") +
          ")"
        )
      })
      .join(",")

    await query(`
      insert into ${table("acq_wholesaler_deals")}
        (post_id, fb_id, posted_at, post_url, street, city, state, price, post_text, scraped_at)
      values ${values}
      on conflict (post_id) do nothing
    `)
  }

  const [t] = await query<{ people: number; deals: number; targets: number }>(`
    select (select count(*)::int from ${table("acq_wholesalers")})       as people,
           (select count(*)::int from ${table("acq_wholesaler_deals")})  as deals,
           (select count(*)::int from ${table("acq_wholesaler_targets")}) as targets
  `)
  console.log(`\nwrote ${t.people} people, ${t.deals} deals. ${t.targets} pass the client gate.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
