/**
 * lib/acquisition/adapters/zillow.ts — Apify `maxcopell/zillow-detail-scraper` → Listing.
 *
 * Every MLS or portal source normalizes INTO the Listing shape here, so nothing
 * downstream of this file knows or cares where a listing came from. See types.ts.
 *
 * WHAT THIS SOURCE CANNOT GIVE YOU
 *
 * There is no listing-agent email anywhere in the payload — verified against a complete
 * 766-field record, not assumed. Name, direct phone, brokerage, brokerage phone and the
 * agent's STATE LICENSE NUMBER are all present, which is a strong enough identity to
 * resolve an address downstream, but resolution is a separate step and it is not done
 * here. `listAgent.email` is left undefined on purpose so the gap is visible rather than
 * silently empty.
 *
 * There is also no privateRemarks. That is the agent-only field where "as-is, cash only,
 * bring your contractor" tends to be stated bluntly, so condition scoring on this source
 * runs on public marketing copy plus photos alone and will read slightly softer than the
 * same property would from a RESO feed.
 */

import type { Listing, PropertyKind } from "../types"

/** Zillow homeType → our buy box. Anything absent from this map is not a property we buy. */
const KIND_BY_HOME_TYPE: Record<string, PropertyKind> = {
  SINGLE_FAMILY: "single-family",
  MULTI_FAMILY: "duplex", // refined below by unit count when the feed states one
}

/** Zillow homeStatus → RESO StandardStatus, which is what the pipeline gates on. */
const STATUS_BY_HOME_STATUS: Record<string, string> = {
  FOR_SALE: "Active",
  COMING_SOON: "Coming Soon",
  PENDING: "Pending",
  RECENTLY_SOLD: "Closed",
  SOLD: "Closed",
  OTHER: "Unknown",
}

export type ZillowRecord = Record<string, any>

/**
 * True days on market, reconstructed from price history rather than trusting the
 * scraper's own counter.
 *
 * This matters more than it looks. `daysOnZillow` resets when a listing is withdrawn and
 * relisted, and relisting to reset the clock is a known and deliberate agent tactic — so
 * the one number the whole DOM floor gates on is the number most likely to be gamed. The
 * price history keeps every "Listed for sale" event, including the earlier ones, so the
 * most recent listing event gives the honest answer and an older one exposes the relist.
 *
 * Falls back to daysOnZillow only when there is no listing event to measure from.
 */
export function trueDaysOnMarket(rec: ZillowRecord, now = new Date()): number | undefined {
  const history: any[] = Array.isArray(rec.priceHistory) ? rec.priceHistory : []
  const dated = (pattern: RegExp): Date | undefined =>
    history
      .filter((e) => typeof e?.event === "string" && pattern.test(e.event) && e.date)
      .map((e) => new Date(e.date))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0]

  const listed = dated(/listed for sale/i)
  const sold = dated(/^sold$/i)
  const fallback = typeof rec.daysOnZillow === "number" ? rec.daysOnZillow : undefined

  if (!listed) return fallback

  // A listing event older than the most recent SALE belongs to a previous ownership
  // cycle, not to the listing in front of us. Zillow does not always write a "Listed
  // for sale" row for the current cycle — a property that went straight to pending can
  // have its newest listing event years back — and without this check that stale row
  // is read as the start of the current listing. Observed live: a St. Pete listing one
  // day old reported 2,245 days, which would have sailed through the DOM floor as the
  // most seasoned inventory on the board.
  if (sold && sold.getTime() > listed.getTime()) return fallback

  const days = Math.floor((now.getTime() - listed.getTime()) / 86_400_000)
  return Math.max(0, days)
}

/**
 * Highest-resolution URL per photo.
 *
 * The vision pass is scoring cabinet doors, counter material and roof shingles, and the
 * 192px thumbnail Zillow lists first cannot carry any of that. Each entry ships the same
 * image at several widths; take the widest every time.
 */
function bestPhotoUrls(rec: ZillowRecord, limit = 40): string[] {
  const photos: any[] = Array.isArray(rec.responsivePhotos) ? rec.responsivePhotos : []
  const urls: string[] = []
  for (const p of photos) {
    const jpegs: any[] = p?.mixedSources?.jpeg ?? []
    if (!jpegs.length) continue
    const widest = jpegs.reduce((a, b) => ((b?.width ?? 0) > (a?.width ?? 0) ? b : a))
    if (widest?.url) urls.push(widest.url)
    if (urls.length >= limit) break
  }
  return urls
}

/** "Pinellas County" → "Pinellas". regions.ts matches on the bare name. */
const bareCounty = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+County$/i, "").trim() : ""

/**
 * Map one scraper record. Returns null when the record is not a buyable property.
 *
 * The null cases are not defensive padding. This actor accepts any Zillow URL and
 * happily returns builder communities, apartment buildings and map views — a six-item
 * run in testing contained four of them — and each comes back with a completely
 * different shape. Without this gate those become listings with no address and a
 * $0 price, and the pipeline prices them.
 */
export function fromZillow(rec: ZillowRecord, now = new Date()): Listing | null {
  if (!rec || typeof rec !== "object") return null
  if (!rec.zpid) return null
  if (!rec.streetAddress || typeof rec.price !== "number") return null

  const kind = KIND_BY_HOME_TYPE[String(rec.homeType)]
  if (!kind) return null

  const attribution = rec.attributionInfo ?? {}
  const agent = (attribution.listingAgents ?? []).find(
    (a: any) => a?.associatedAgentType === "listAgent",
  )

  return {
    listingKey: String(rec.zpid),
    listingId: String(attribution.mlsId ?? rec.zpid),
    kind,
    listPrice: rec.price,
    livingArea: typeof rec.livingArea === "number" ? rec.livingArea : undefined,
    lotSizeSqft: typeof rec.lotSize === "number" ? rec.lotSize : undefined,
    yearBuilt: typeof rec.yearBuilt === "number" ? rec.yearBuilt : undefined,
    bedrooms: typeof rec.bedrooms === "number" ? rec.bedrooms : undefined,
    bathrooms: typeof rec.bathrooms === "number" ? rec.bathrooms : undefined,
    address: {
      street: String(rec.streetAddress),
      city: String(rec.city ?? ""),
      county: bareCounty(rec.county),
      state: String(rec.state ?? ""),
      postalCode: String(rec.zipcode ?? ""),
    },
    publicRemarks: String(rec.description ?? ""),
    // privateRemarks intentionally absent — this source does not carry it.
    daysOnMarket: trueDaysOnMarket(rec, now),
    photos: bestPhotoUrls(rec),
    listAgent: {
      fullName: String(attribution.agentName ?? agent?.memberFullName ?? ""),
      phone: attribution.agentPhoneNumber ?? undefined,
      // email is deliberately undefined — see the module header.
      mlsId: agent?.memberStateLicense ?? undefined,
      brokerageName: attribution.brokerName ?? undefined,
    },
    standardStatus: STATUS_BY_HOME_STATUS[String(rec.homeStatus)] ?? "Unknown",
    modificationTimestamp: String(attribution.lastUpdated ?? rec.scrapedAt ?? new Date(0).toISOString()),
  }
}

/** Map a whole run, dropping everything that is not a buyable property. */
export function fromZillowBatch(records: ZillowRecord[], now = new Date()): Listing[] {
  return records.map((r) => fromZillow(r, now)).filter((l): l is Listing => l !== null)
}
