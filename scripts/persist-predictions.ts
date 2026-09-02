/**
 * scripts/persist-predictions.ts — Score every stored listing and write the verdict down.
 *
 * Run:  npx tsx scripts/persist-predictions.ts [--commit]
 *
 * THE GAP THIS CLOSES
 *
 * score-targets.ts read /tmp JSON, ran the offer engine, and printed a table.
 * Nothing was written anywhere. acq_predictions had zero rows, which meant
 * acq_send_queue had zero rows, which meant the send path could not have run
 * even if every other part of it were finished. The offers existed as console
 * output and nowhere else.
 *
 * This reads listings out of Postgres, runs the same engine, and writes the
 * verdict back, so a decision made today is still inspectable next month.
 *
 * Dry by default. --commit writes.
 */

import { query, quote, table } from "../lib/acquisition/db"
import {
  LISTING_COLUMNS,
  isScored,
  scoreRow,
  templateVariant,
  type ListingRow,
  type Scored,
} from "../lib/acquisition/from-db"

const COMMIT = process.argv.includes("--commit")


// tsx compiles these scripts to CJS, where top-level await is not available.
async function main(): Promise<void> {
  const rows = await query<ListingRow>(`
    select ${LISTING_COLUMNS}
      from ${table("acq_listings")} l
      left join ${table("acq_agents")} a on a.license_number = l.agent_license
     where l.condition_score is not null
  `)

  // One rate per ZIP, newest first, sold comps beating asking prices. Falls back to
  // the median of what we do have -- a missing ZIP should widen the error bar, not
  // silently price the house at zero.
  const psfRows = await query<{ postal_code: string; psf: string; basis: string }>(
    `select postal_code, psf, basis from ${table("acq_arv_psf_current")}`,
  )
  const psf = new Map(psfRows.map((r) => [r.postal_code, Number(r.psf)]))
  const sorted = [...psf.values()].sort((a, b) => a - b)
  const psfFallback = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0

  if (!psfFallback) {
    console.error(
      "acq_arv_psf is empty. Load it before scoring: every offer would be built on an ARV of zero.\n" +
        "  npx tsx scripts/load-arv-psf.ts <file.json> --basis=asking --commit",
    )
    process.exit(1)
  }

  const scored: Scored[] = []
  const skipped: Array<{ zpid: string; why: string }> = []

  for (const row of rows) {
    const result = scoreRow(row, { psf, psfFallback })
    if (isScored(result)) scored.push(result)
    else skipped.push({ zpid: row.zpid, why: result.skipped })
  }

  const byDecision = (d: string) => scored.filter((s) => s.offer.decision === d)
  const sendable = byDecision("SEND")
  const withEmail = sendable.filter((s) => s.listing.listAgent.email)

  console.log(`${rows.length} scored listings read`)
  console.log(`  skipped        ${skipped.length}`)
  console.log(`  SEND           ${sendable.length}  (${withEmail.length} with a verified agent email)`)
  console.log(`  REVIEW         ${byDecision("REVIEW").length}`)
  console.log(`  REJECT         ${byDecision("REJECT").length}`)

  if (!COMMIT) {
    console.log("\ndry run. re-run with --commit to write acq_predictions.")
    const top = [...sendable].sort((a, b) => b.priority - a.priority).slice(0, 8)
    for (const s of top) {
      const pct = s.listing.listPrice ? Math.round(((s.offer.offerPrice ?? 0) / s.listing.listPrice) * 100) : 0
      console.log(
        `  p${String(s.priority).padStart(3)}  $${String(s.offer.offerPrice).padStart(7)} (${pct}% of list)  ` +
          `${s.condition.tier.padEnd(9)} ${s.listing.address.street.slice(0, 30).padEnd(30)} ` +
          `${s.listing.listAgent.email ?? "(no email)"}`,
      )
    }
    process.exit(0)
  }

  // Written in one statement per chunk. A decision and its priority have to land
  // together: half a batch would leave the queue ordering meaningless.
  const values = scored.map((s) => {
    const variant = templateVariant(s.row.zpid)
    return (
      "(" +
      [
        quote(s.row.zpid),
        quote(s.listing.listingId),
        "now()",
        quote(s.offer.decision),
        quote(s.condition.tier),
        quote(Math.round(s.condition.conditionScore)),
        quote(Math.round(s.repairs.total)),
        quote(Math.round(s.arv)),
        quote(s.offer.offerPrice === null ? null : Math.round(s.offer.offerPrice)),
        quote(Math.round(s.offer.confidence)),
        quote(s.listing.livingArea ?? null),
        quote(variant),
        quote(Math.round(s.priority)),
        quote(s.repairs.marketTier),
        quote(s.listing.address.county),
        quote(s.listing.listAgent.email ?? null),
      ].join(",") +
      ")"
    )
  })

  let written = 0
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100)
    await query(`
      insert into ${table("acq_predictions")}
        (listing_key, listing_id, decided_at, decision, predicted_tier, condition_score,
         predicted_repairs, predicted_arv, offer_price, confidence, living_area,
         template_variant, priority, market_tier, county, agent_email)
      values ${chunk.join(",")}
    `)
    written += chunk.length
  }

  console.log(`\nwrote ${written} predictions`)
  const [queued] = await query<{ n: number }>(`select count(*)::int n from ${table("acq_send_queue")}`)
  const [blocked] = await query<{ n: number }>(`select count(*)::int n from ${table("acq_send_queue_blocked")}`)
  console.log(`send queue now holds ${queued.n} listings; the client gate is withholding ${blocked.n}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
