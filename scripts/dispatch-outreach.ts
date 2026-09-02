/**
 * scripts/dispatch-outreach.ts — Put the letters in inboxes.
 *
 * Run:  npx tsx scripts/dispatch-outreach.ts                 # pre-flight, sends nothing
 *       npx tsx scripts/dispatch-outreach.ts --release=KEY   # one listing out of review
 *       npx tsx scripts/dispatch-outreach.ts --send          # the auto-send queue, for real
 *
 * This is the end of the pipeline and the only irreversible step in it. Every
 * default here is chosen on the assumption that the first live batch will contain
 * a mistake nobody spotted, because that is what first batches contain.
 *
 * SO:
 *   - dry by default, and --send is additionally gated on ACQ_SEND_ENABLED
 *   - capped per run, well under what the inbox pool could carry
 *   - suppression checked here as well as in the queue view
 *   - every dispatch written to acq_sends before the next one starts, so an
 *     interrupted run never re-mails the people it already reached
 *
 * WHAT COMES OUT OF REVIEW
 *
 * With AUTO_SEND_ENABLED unset, the offer engine routes everything to REVIEW by
 * design and acq_send_queue is empty. That is not a bug to work around: it is the
 * human gate. --release names specific listings a person has actually looked at.
 */

import acquisitionConfig from "../lib/acquisition/config"
import { query, quote, table } from "../lib/acquisition/db"
import { LISTING_COLUMNS, isScored, scoreRow, templateVariant, type ListingRow } from "../lib/acquisition/from-db"
import { renderLoi } from "../lib/acquisition/loi"
import { dispatchAll, campaignDailyCapacity, type OutreachTarget } from "../lib/acquisition/outreach/instantly"

const args = process.argv.slice(2)
const SEND = args.includes("--send")
const release = args.find((a) => a.startsWith("--release="))?.split("=")[1]?.split(",").filter(Boolean) ?? []
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? acquisitionConfig.sendDailyCap)

async function main(): Promise<void> {
  // --- Where the batch comes from --------------------------------------------
  const source = release.length
    ? `review release (${release.length} named)`
    : "acq_send_queue"

  const keyFilter = release.length
    ? `p.listing_key in (${release.map(quote).join(",")}) and p.decision in ('SEND','REVIEW')`
    : `p.listing_key in (select listing_key from ${table("acq_send_queue")})`

  const rows = await query<ListingRow & { offer_price: number | null; priority: number }>(`
    select ${LISTING_COLUMNS}, p.offer_price, p.priority
      from ${table("acq_predictions")} p
      join ${table("acq_listings")} l on l.zpid = p.listing_key
      left join ${table("acq_agents")} a on a.license_number = l.agent_license
     where ${keyFilter}
       and not exists (select 1 from ${table("acq_sends")} s where s.listing_key = p.listing_key)
     order by p.priority desc
     limit ${Math.max(1, Math.min(limit, 500))}
  `)

  // --- The ARV basis, same source the queue was priced from ------------------
  const psfRows = await query<{ postal_code: string; psf: string }>(
    `select postal_code, psf from ${table("acq_arv_psf_current")}`,
  )
  const psf = new Map(psfRows.map((r) => [r.postal_code, Number(r.psf)]))
  const rates = [...psf.values()].sort((a, b) => a - b)
  const psfFallback = rates.length ? rates[Math.floor(rates.length / 2)] : 0

  // --- Pre-flight -------------------------------------------------------------
  const capacity = acquisitionConfig.instantlyCampaignId
    ? await campaignDailyCapacity(acquisitionConfig.instantlyCampaignId).catch(() => null)
    : null

  const problems: string[] = []
  if (!acquisitionConfig.buyerPostalAddress) problems.push("LOI_POSTAL_ADDRESS unset — CAN-SPAM requires one")
  if (!acquisitionConfig.buyerSignerName) problems.push("LOI_SIGNER_NAME unset — the letter would go out unsigned")
  if (!acquisitionConfig.instantlyCampaignId) problems.push("INSTANTLY_CAMPAIGN_ID unset — nowhere to send")
  if (!psfFallback) problems.push("acq_arv_psf is empty — every ARV would be zero")
  if (capacity && capacity.perDay === 0) problems.push("the campaign has no sending accounts attached")

  console.log(`source: ${source}`)
  console.log(`batch : ${rows.length} listings (cap ${limit})`)
  if (capacity) console.log(`inbox : ${capacity.accounts} accounts, ${capacity.perDay}/day ceiling`)
  console.log(`mode  : ${SEND && acquisitionConfig.sendEnabled ? "LIVE" : "dry run"}`)
  if (SEND && !acquisitionConfig.sendEnabled) {
    console.log("        --send was passed but ACQ_SEND_ENABLED is not \"true\". Nothing will be sent.")
  }

  if (problems.length) {
    console.log("\npre-flight failures:")
    for (const p of problems) console.log(`  - ${p}`)
    if (SEND) process.exit(1)
  }

  if (!rows.length) {
    console.log(
      "\nnothing queued." +
        (release.length ? "" : " With AUTO_SEND_ENABLED unset the engine holds every offer for review, which is the intended gate. Release specific listings with --release=<key>,<key>."),
    )
    return
  }

  // --- Render -----------------------------------------------------------------
  const targets: OutreachTarget[] = []
  const unrenderable: Array<{ key: string; why: string }> = []

  for (const row of rows) {
    const scored = scoreRow(row, { psf, psfFallback })
    if (!isScored(scored)) {
      unrenderable.push({ key: row.zpid, why: scored.skipped })
      continue
    }
    const { listing, offer, repairs, condition } = scored

    if (!listing.listAgent.email) {
      unrenderable.push({ key: row.zpid, why: "no verified agent email" })
      continue
    }

    // The letter is priced from the row the queue was ordered by, not from a
    // fresh computation, so the number in the email and the number in the ledger
    // are the same number. A re-price between queueing and sending is exactly the
    // kind of drift an agent catches and we cannot explain.
    if (row.offer_price !== null && offer.offerPrice !== row.offer_price) {
      unrenderable.push({
        key: row.zpid,
        why: `price drifted since scoring: queued $${row.offer_price}, now $${offer.offerPrice}. Re-run persist-predictions.`,
      })
      continue
    }

    let letter
    try {
      letter = renderLoi({ listing, offer, repairs, condition })
    } catch (err) {
      unrenderable.push({ key: row.zpid, why: err instanceof Error ? err.message : String(err) })
      continue
    }

    const [first = "there", ...rest] = listing.listAgent.fullName.trim().split(/\s+/)
    targets.push({
      listingKey: row.zpid,
      agentEmail: listing.listAgent.email,
      agentFirstName: first,
      agentLastName: rest.join(" ") || undefined,
      brokerage: listing.listAgent.brokerageName,
      subject: letter.subject,
      body: letter.body,
      fields: {
        street: listing.address.street,
        city: listing.address.city,
        listingId: listing.listingId,
        offerPrice: `$${(offer.offerPrice ?? 0).toLocaleString("en-US")}`,
        templateVariant: templateVariant(row.zpid),
      },
    })
  }

  if (unrenderable.length) {
    console.log(`\n${unrenderable.length} could not be rendered:`)
    for (const u of unrenderable.slice(0, 10)) console.log(`  ${u.key}  ${u.why}`)
    if (unrenderable.length > 10) console.log(`  ... and ${unrenderable.length - 10} more`)
  }

  // --- Dispatch ----------------------------------------------------------------
  const dryRun = !SEND || !acquisitionConfig.sendEnabled
  const results = await dispatchAll(targets, { dryRun })

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})
  console.log(`\n${targets.length} rendered:`, tally)

  for (const r of results.filter((x) => x.status === "suppressed" || x.status === "error")) {
    console.log(`  ${r.status.toUpperCase()} ${r.email}  ${r.detail}`)
  }

  if (dryRun) {
    const sample = results.find((r) => r.status === "dry-run")
    if (sample) console.log(`\nsample: ${sample.email} — ${sample.detail}`)
    console.log("\nnothing was sent. set ACQ_SEND_ENABLED=true and pass --send to go live.")
    return
  }

  // --- Ledger -------------------------------------------------------------------
  // Written after the fact rather than before, so a row in acq_sends always means
  // a letter actually left. The cost is that a crash between the two re-sends one
  // letter; the alternative cost is a listing marked sent that never was, which
  // hides a target forever.
  const sent = results.filter((r) => r.status === "sent")
  if (sent.length) {
    const byKey = new Map(targets.map((t) => [t.listingKey, t]))
    const values = sent
      .map((r) => {
        const t = byKey.get(r.listingKey)
        return (
          "(" +
          [
            quote(r.listingKey),
            quote("email"),
            quote(r.email),
            quote(t?.subject ?? null),
            // The body is stored, not just referenced. When an agent quotes a
            // number back at us months later, the letter they were actually sent
            // has to be retrievable, not reconstructed from today's templates.
            quote(t?.body ?? ""),
            quote(Number((t?.fields.offerPrice ?? "").replace(/[^0-9]/g, "")) || null),
            "now()",
            quote("T1_LOI"),
            quote(r.leadId ?? null),
          ].join(",") +
          ")"
        )
      })
      .join(",")
    await query(`
      insert into ${table("acq_sends")}
        (listing_key, channel, to_contact, subject, body, offer_price, sent_at, touch, provider_id)
      values ${values}
      on conflict (listing_key, touch) where touch is not null do nothing
    `)
    console.log(`\nrecorded ${sent.length} sends`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
