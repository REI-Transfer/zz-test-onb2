/**
 * lib/acquisition/regions.ts — Statewide cost and market variation.
 *
 * A flat repair rate was defensible across two adjacent Gulf Coast counties. It is not
 * defensible across Florida: Miami-Dade and Monroe run materially hotter than the
 * Panhandle on labour, permitting and insurance, and a single $/sqft number applied
 * statewide systematically overpays in cheap markets while rejecting good deals in
 * expensive ones — the second failure being the one you never see in the logs.
 *
 * CALIBRATION WARNING: the multipliers below are ordinal placeholders. They encode the
 * RANKING of Florida construction markets, which is stable and uncontroversial, not
 * their magnitudes, which are not. Replace them with your own numbers as closed rehabs
 * accumulate — outcomes.ts will tell you which tiers are off, per tier, once you have
 * enough samples.
 */

/** Cost bands. Multiplies the base per-sqft rate from config.ts. */
export type MarketTier = "PREMIUM" | "METRO" | "STANDARD" | "RURAL"

export const TIER_MULTIPLIERS: Record<MarketTier, number> = {
  PREMIUM:  1.35, // South Florida coastal + Keys: labour scarcity, permitting, insurance
  METRO:    1.10, // Major metros with competitive trades
  STANDARD: 1.00, // The baseline the rates in config.ts are expressed in
  RURAL:    0.85, // Thin trade markets, lower labour cost, longer schedules
}

/**
 * County → tier. Florida has 67 counties; only those differing from STANDARD are
 * listed, and everything unlisted falls through to STANDARD. Keys are lowercased
 * RESO CountyOrParish values.
 */
const COUNTY_TIERS: Record<string, MarketTier> = {
  // Premium — South Florida coastal and the Keys
  "monroe": "PREMIUM",
  "miami-dade": "PREMIUM",
  "broward": "PREMIUM",
  "palm beach": "PREMIUM",
  "collier": "PREMIUM",

  // Metro — competitive trade markets
  "hillsborough": "METRO",
  "pinellas": "METRO",
  "orange": "METRO",
  "duval": "METRO",
  "sarasota": "METRO",
  "lee": "METRO",
  "manatee": "METRO",
  "seminole": "METRO",
  "st. johns": "METRO",
  "st johns": "METRO",
  "martin": "METRO",
  "indian river": "METRO",
  "st. lucie": "METRO",
  "st lucie": "METRO",

  // Rural — thin trade markets, mostly north-central and inland Panhandle
  "liberty": "RURAL", "lafayette": "RURAL", "union": "RURAL", "glades": "RURAL",
  "hamilton": "RURAL", "calhoun": "RURAL", "gilchrist": "RURAL", "franklin": "RURAL",
  "dixie": "RURAL", "holmes": "RURAL", "jefferson": "RURAL", "madison": "RURAL",
  "taylor": "RURAL", "washington": "RURAL", "bradford": "RURAL", "gulf": "RURAL",
  "hardee": "RURAL", "desoto": "RURAL", "okeechobee": "RURAL", "levy": "RURAL",
  "suwannee": "RURAL", "baker": "RURAL", "wakulla": "RURAL", "columbia": "RURAL",
  "jackson": "RURAL", "putnam": "RURAL", "hendry": "RURAL", "gadsden": "RURAL",
}

export function tierForCounty(county: string): MarketTier {
  return COUNTY_TIERS[county.trim().toLowerCase()] ?? "STANDARD"
}

export function costMultiplierForCounty(county: string): number {
  return TIER_MULTIPLIERS[tierForCounty(county)]
}

/**
 * Counties where wind/flood exposure should gate an automatic offer.
 *
 * THIS IS A CRUDE PROXY AND SHOULD BE REPLACED. Flood risk is a property-level
 * attribute — a house in inland Hillsborough is fine, one on a barrier island is not —
 * and the correct implementation is a per-parcel FEMA National Flood Hazard Layer
 * lookup, which is a free API. Until that exists, this list is deliberately NARROW:
 * only the counties where post-Ian and post-Helene insurability problems are acute
 * enough that a county-level hold beats no signal at all.
 *
 * It is kept narrow on purpose. Flagging every coastal Florida county would hold
 * roughly half the state for review and defeat the point of going statewide.
 */
const COASTAL_EXPOSURE = new Set([
  // Keys — insurability and elevation are decisive here, not incidental
  "monroe",
  // Southwest Gulf, Ian corridor
  "lee", "charlotte", "collier",
  // Big Bend, Helene corridor — thin markets, severe surge history
  "franklin", "gulf", "wakulla", "dixie", "taylor", "levy",
])

export function hasCoastalExposure(county: string): boolean {
  return COASTAL_EXPOSURE.has(county.trim().toLowerCase())
}
