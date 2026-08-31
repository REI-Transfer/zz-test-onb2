/** Run a saved Apify zillow-detail-scraper dataset through the real pipeline. */
import { readFileSync } from "node:fs"
import { fromZillow } from "../lib/acquisition/adapters/zillow"
import { evaluateListing } from "../lib/acquisition/pipeline"
import type { ArvEstimate } from "../lib/acquisition/types"

const records = JSON.parse(readFileSync(process.argv[2], "utf8")) as any[]
const L = "─".repeat(92)

;(async () => {
  console.log(L)
  console.log(`${records.length} scraper records → adapter → pipeline`)
  console.log(L)
  for (const rec of records) {
    const listing = fromZillow(rec)
    if (!listing) {
      console.log(`DROPPED (not a buyable property record): ${rec.streetAddress ?? rec.addressOrUrlFromInput}`)
      continue
    }
    // No comps source wired yet: use list price as a stand-in ARV so the math runs.
    // A real run takes this from DealMachine. Flagged, not hidden.
    const arv: ArvEstimate = { arv: Math.round(listing.listPrice * 1.02), comparables: [], source: "provider" }
    const r = await evaluateListing({ listing, arv })
    const agent = `${listing.listAgent.fullName || "?"} · ${listing.listAgent.brokerageName || "?"}`
    console.log(
      `${r.decision.padEnd(7)} ${listing.address.street.padEnd(24)} $${String(listing.listPrice).padEnd(7)} ` +
      `${String(listing.livingArea ?? "?").padStart(5)}sf  DOM ${String(listing.daysOnMarket ?? "?").padStart(3)}  ` +
      `${String(listing.photos.length).padStart(2)}pix  ${agent}`,
    )
    console.log(`        ${r.offer.reasons[0] ?? ""}`)
    if (listing.listAgent.phone) {
      console.log(`        agent phone ${listing.listAgent.phone} · FL license ${listing.listAgent.mlsId ?? "?"} · email MISSING`)
    }
  }
  console.log(L)
})()
