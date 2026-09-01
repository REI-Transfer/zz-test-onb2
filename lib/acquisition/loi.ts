/**
 * lib/acquisition/loi.ts — Letter of Intent rendered for the listing agent.
 *
 * Written agent-to-agent: brief, specific, and honest about being a starting point.
 * Listing agents field a lot of automated lowballs; the things that earn a reply are
 * showing the arithmetic, naming a real closing timeline, and being explicit that the
 * number moves once someone has walked the property.
 *
 * The letter is expressly NON-BINDING. It is an invitation to negotiate, not a
 * contract, and it says so. Have your attorney review this template before enabling
 * automatic delivery — the wording below is a starting point, not legal advice.
 */

import acquisitionConfig from "./config"
import type { ConditionAssessment, Listing, OfferResult, RepairEstimate } from "./types"

// The feed hands us "1511 19TH AVENUE S". Shouting the address at the recipient is a
// mail-merge tell, so it is title-cased, with directionals and ordinals left alone
// because "1511 19Th Avenue S" is a worse tell than the caps were.
const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"])
const titleCase = (s: string): string =>
  s
    .split(/\s+/)
    .map((w) => {
      const up = w.toUpperCase()
      if (DIRECTIONALS.has(up)) return up
      if (/^\d+(ST|ND|RD|TH)$/.test(up)) return up.toLowerCase().replace(/^\d+/, (d) => d)
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(" ")

// Displayed to the nearest $5k. The offer itself is exact to the dollar in the ledger,
// but an ARV quoted as "$472,371" reads as a machine's output in the one paragraph
// whose whole job is to sound like a person's judgement. Estimates get stated the way
// an estimate is actually spoken.
const approx = (n: number): string => `$${(Math.round(n / 5000) * 5000).toLocaleString("en-US")}`

const usd = (n: number): string => {
  if (!Number.isFinite(n)) {
    throw new Error(`Refusing to render a letter with a non-numeric dollar amount: ${n}`)
  }
  return `$${Math.round(n).toLocaleString("en-US")}`
}

const addDays = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export type LoiInput = {
  listing: Listing
  offer: OfferResult
  repairs: RepairEstimate
  condition: ConditionAssessment
}

export function renderLoi({ listing, offer, repairs, condition }: LoiInput): {
  subject: string
  body: string
  toEmail?: string
} {
  if (offer.offerPrice === null) {
    throw new Error(`renderLoi called for ${listing.listingId} with no offer price`)
  }

  const cfg = acquisitionConfig
  const addr = `${titleCase(listing.address.street)}, ${listing.address.city}, ${listing.address.state} ${listing.address.postalCode}`
  const agentFirstName = listing.listAgent.fullName.trim().split(/\s+/)[0] || "there"
  const buyer = cfg.buyerEntity || "[LOI_BUYER_ENTITY not set]"

  const subject = `Cash offer: ${titleCase(listing.address.street)}, ${listing.address.city} (MLS# ${listing.listingId})`

  // Naming the scope we priced invites a correction rather than a dismissal — an agent
  // who knows the roof was done last year will say so, which is a reply either way.
  const scopeNote = condition.matchedSignals.length
    ? `Our read on scope came from the listing detail and photos (${condition.matchedSignals.slice(0, 3).join("; ")}).`
    : "Our read on scope came from the listing detail and photos."

  const licenseDisclosure = cfg.flLicenseNumber
    ? `\n\nDisclosure: ${cfg.buyerSignerName || "The undersigned"} holds an active Florida real estate license (# ${cfg.flLicenseNumber}) and is purchasing this property for their own account as a principal, not as a representative of any other party.`
    : ""

  // CAN-SPAM applies to commercial email including agent-to-agent: a valid physical
  // postal address and a working opt-out are both required, and neither is optional
  // because the recipient is a business. Refuse to render without them rather than
  // shipping a letter that is quietly unlawful.
  if (!cfg.buyerPostalAddress) {
    throw new Error(
      "Refusing to render a letter with no postal address: CAN-SPAM requires one. Set LOI_POSTAL_ADDRESS.",
    )
  }
  const footer = `${buyer} | ${cfg.buyerPostalAddress}
Reply with "remove" and I won't contact you about this or any other listing.`

  const body = `Hi ${agentFirstName},

I'm with ${buyer}, ${cfg.buyerDescriptor}. Submitting a cash offer on ${addr} (MLS# ${listing.listingId}), currently listed at ${usd(listing.listPrice)}.

  Offer price:      ${usd(offer.offerPrice)}
  Terms:            All cash, no financing contingency
  Earnest money:    ${usd(cfg.earnestMoney)}, deposited within 3 business days
  Inspection:       ${cfg.inspectionDays}-day inspection period
  Closing:          On or before ${cfg.closingDays} days from executed contract
  Title/closing:    Buyer's choice of Florida title company, seller may select their own

How we got there: we think it's worth about ${approx(offer.arv)} once it's fixed, and that fixing it runs somewhere near ${approx(repairs.total)}. ${scopeNote} That estimate came from photos, so it can be wrong in either direction. If the house is in better shape than it photographs, or your seller has had work done that isn't in the listing (roof, HVAC, electrical, plumbing), send it over and I'll requote the same day. The number goes up as readily as it comes down.

We buy as-is, pay our own closing costs, and don't come back asking for repairs or credits. If your seller needs a particular closing date or time to move, both are easy.

Proof of funds on request, and happy to talk it through if a call is easier. Open through ${addDays(cfg.offerValidDays)}. This is an expression of interest, not a binding contract.${licenseDisclosure}

Best regards,

${cfg.buyerSignerName || "[LOI_SIGNER_NAME not set]"}
${cfg.buyerSignerTitle}
${buyer}${cfg.buyerPhone ? `\n${cfg.buyerPhone}` : ""}${cfg.buyerEmail ? `\n${cfg.buyerEmail}` : ""}

${footer}`

  return { subject, body, toEmail: listing.listAgent.email }
}
