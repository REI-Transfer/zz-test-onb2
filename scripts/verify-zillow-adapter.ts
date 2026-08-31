/**
 * scripts/verify-zillow-adapter.ts — the Zillow → Listing mapping.
 *
 * The adapter is the least-tested and most silently-wrong part of any ingest: bad
 * mapping does not throw, it produces a plausible listing with a wrong number, and the
 * pipeline prices it. Every case below is drawn from a real scraper record.
 */
import { fromZillow, trueDaysOnMarket } from "../lib/acquisition/adapters/zillow"

const NOW = new Date("2026-08-31T00:00:00Z")
let pass = 0, fail = 0
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(58)} ${ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
  ok ? pass++ : fail++
}

const base = {
  zpid: 123, streetAddress: "100 Test St", city: "Saint Petersburg", state: "FL",
  county: "Pinellas County", zipcode: "33710", price: 300_000, livingArea: 1500,
  homeType: "SINGLE_FAMILY", homeStatus: "FOR_SALE", description: "as-is",
  daysOnZillow: 1,
  attributionInfo: { mlsId: "TB1", agentName: "A Agent", agentPhoneNumber: "727-000-0000",
    brokerName: "Broker Co", listingAgents: [{ associatedAgentType: "listAgent", memberFullName: "A Agent", memberStateLicense: "999" }] },
  responsivePhotos: [{ mixedSources: { jpeg: [
    { url: "https://x/small.jpg", width: 192 }, { url: "https://x/BIG.jpg", width: 1536 }] } }],
}

// --- true days on market -------------------------------------------------
check("Recent listing event is used",
  trueDaysOnMarket({ ...base, priceHistory: [{ date: "2026-08-01", event: "Listed for sale" }] }, NOW), 30)

// The live bug: a 2020 listing that ended in a 2020 sale is a previous ownership cycle.
// Reading it as the current listing reported 2,245 days on a one-day-old listing.
check("Listing event older than the last SALE is ignored",
  trueDaysOnMarket({ ...base, priceHistory: [
    { date: "2026-08-30", event: "Pending sale" },
    { date: "2020-09-15", event: "Sold" },
    { date: "2020-07-08", event: "Listed for sale" }] }, NOW), 1)

// The case the history check exists FOR: relisted to reset the public clock.
check("Relist is caught — history beats daysOnZillow",
  trueDaysOnMarket({ ...base, daysOnZillow: 2, priceHistory: [
    { date: "2026-06-01", event: "Listed for sale" },
    { date: "2026-05-20", event: "Listing removed" }] }, NOW), 91)

check("No history falls back to daysOnZillow",
  trueDaysOnMarket({ ...base, priceHistory: [] }, NOW), 1)

// --- record validity -----------------------------------------------------
check("Builder-community record is dropped", fromZillow({ isValid: true, coverImages: [] }, NOW), null)
check("Apartment building without zpid is dropped", fromZillow({ streetAddress: "x", price: 1 }, NOW), null)
check("Condo is dropped at the adapter", fromZillow({ ...base, homeType: "CONDO" }, NOW), null)
check("Manufactured is dropped at the adapter", fromZillow({ ...base, homeType: "MANUFACTURED" }, NOW), null)

// --- field mapping -------------------------------------------------------
const l = fromZillow({ ...base, priceHistory: [{ date: "2026-08-01", event: "Listed for sale" }] }, NOW)!
check("County suffix stripped for regions.ts", l.address.county, "Pinellas")
check("MLS number, not zpid, becomes listingId", l.listingId, "TB1")
check("zpid becomes the dedupe key", l.listingKey, "123")
check("Widest photo variant is chosen, not the 192px thumb", l.photos, ["https://x/BIG.jpg"])
check("FOR_SALE maps to RESO Active", l.standardStatus, "Active")
check("PENDING maps to RESO Pending", fromZillow({ ...base, homeStatus: "PENDING" }, NOW)!.standardStatus, "Pending")
check("Agent phone carried", l.listAgent.phone, "727-000-0000")
check("State licence carried for downstream identity resolution", l.listAgent.mlsId, "999")
check("Agent email is undefined, not an empty string", l.listAgent.email, undefined)

console.log(`\n${fail === 0 ? "All cases passed." : `${fail} FAILED`}  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
