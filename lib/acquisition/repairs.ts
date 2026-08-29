/**
 * lib/acquisition/repairs.ts — Repair budget from condition tier and size.
 *
 * A per-sqft tier model, not a line-item takeoff. It exists to produce a defensible
 * number for the LOI, not to replace a walkthrough. Every offer this feeds is
 * explicitly subject to inspection, which is where the real number gets set.
 *
 * All rates are env-configurable (see config.ts) and MUST be calibrated to your own
 * closed-deal costs before auto-send is enabled.
 */

import acquisitionConfig from "./config"
import type { ConditionTier, Listing, RepairEstimate } from "./types"

const perSqftFor = (tier: ConditionTier): number => {
  switch (tier) {
    case "COSMETIC": return acquisitionConfig.repairCosmeticPerSqft
    case "MODERATE": return acquisitionConfig.repairModeratePerSqft
    case "HEAVY":    return acquisitionConfig.repairHeavyPerSqft
    case "SEVERE":   return acquisitionConfig.repairSeverePerSqft
  }
}

export type RepairInput = {
  listing: Listing
  tier: ConditionTier
  /** From the vision pass. Adds a roof line item when true. */
  roofEndOfLife?: boolean
}

export function estimateRepairs({ listing, tier, roofEndOfLife }: RepairInput): RepairEstimate {
  const sqftKnown = Boolean(listing.livingArea && listing.livingArea > 0)
  const sqft = sqftKnown ? listing.livingArea! : acquisitionConfig.fallbackLivingArea

  const perSqft = perSqftFor(tier)
  const lineItems: Record<string, number> = {
    baseRehab: Math.round(perSqft * sqft),
  }

  if (roofEndOfLife) {
    lineItems.roof = Math.round(acquisitionConfig.repairRoofPerSqft * sqft)
  }

  // HVAC is assumed shot on any heavy/severe rehab, and on a moderate rehab of a
  // house old enough that the original system is past service life.
  const age = listing.yearBuilt ? new Date().getFullYear() - listing.yearBuilt : 0
  const hvacLikelyDead = tier === "HEAVY" || tier === "SEVERE" || (tier === "MODERATE" && age >= 20)
  if (hvacLikelyDead) {
    lineItems.hvac = acquisitionConfig.repairHvacFlat
  }

  const subtotal = Object.values(lineItems).reduce((s, n) => s + n, 0)
  lineItems.contingency = Math.round(subtotal * acquisitionConfig.repairContingencyPct)

  const total = Object.values(lineItems).reduce((s, n) => s + n, 0)

  return { total, perSqft, tier, lineItems, sqftKnown }
}
