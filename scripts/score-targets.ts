/** Run the photo-scored TARGETs through the offer engine. */
import { readFileSync } from "node:fs"
import { applyVisionResult, assessCondition, type VisionVerdict } from "../lib/acquisition/condition"
import { computeOffer } from "../lib/acquisition/offer"
import { estimateRepairs } from "../lib/acquisition/repairs"
import { fromZillow } from "../lib/acquisition/adapters/zillow"
import type { ArvEstimate } from "../lib/acquisition/types"

const scored = JSON.parse(readFileSync("/tmp/scored.json", "utf8")) as any[]
const recs = new Map<string, any>(
  (JSON.parse(readFileSync("/tmp/band_out.json", "utf8")) as any[])
    .filter((r) => r.zpid).map((r) => [String(r.zpid), r]))

const targets = scored.filter((s) => s.verdict === "TARGET")
const out: any[] = []
for (const s of targets) {
  const rec = recs.get(String(s.zpid)); if (!rec) continue
  const listing = fromZillow(rec); if (!listing) continue
  const vision: VisionVerdict = {
    datedScore: s.datedScore, tier: s.tier, roofEndOfLife: !!s.roofEndOfLife,
    observations: (s.observations || "").split(" | ").filter(Boolean),
  }
  const cond = applyVisionResult(assessCondition({ listing }), vision)
  const repairs = estimateRepairs({ listing, tier: cond.tier, roofEndOfLife: vision.roofEndOfLife })
  // ARV = what a RENOVATED house in this ZIP asks per foot, times this house's size.
  // The prior version fed the Zestimate or the list price, both of which describe the
  // property in its current dated state — so the formula was asking what a house is
  // worth after repairs while being told what it is worth before them.
  const psf = JSON.parse(readFileSync("/tmp/arv_psf.json", "utf8")) as Record<string, number>
  const zip = listing.address.postalCode
  const rate = psf[zip] ?? psf["_default"]
  const arvVal = Math.round(rate * (listing.livingArea ?? 0))
  const arv: ArvEstimate = { arv: arvVal, comparables: [], source: "comps" }
  const offer = computeOffer({ listing, condition: cond, repairs, arv })
  out.push({ s, listing, cond, repairs, offer, arvVal, arvRate: rate })
}

const ok = out.filter((o) => o.offer.decision !== "REJECT")
const L = "─".repeat(100)
console.log(L)
console.log(`${out.length} photo-verified TARGETs run through the offer engine`)
console.log(L)
for (const o of out.sort((a, b) => (b.offer.offerPrice ?? 0) - (a.offer.offerPrice ?? 0))) {
  const off = o.offer.offerPrice
  const pct = off ? Math.round((off / o.listing.listPrice) * 100) : 0
  const flag = o.offer.decision === "REJECT" ? "✗" : o.offer.decision === "REVIEW" ? "?" : "✓"
  console.log(`${flag} ${o.offer.decision.padEnd(6)} list $${String(o.listing.listPrice).padStart(7)}  ` +
    `arv $${String(o.arvVal).padStart(7)}${o.arvRate ? " " : "*"}  repairs $${String(o.repairs.total).padStart(6)}  ` +
    `offer ${off ? "$" + String(off).padStart(7) + ` (${pct}%)` : "   none    "}  ` +
    `cond ${String(o.cond.conditionScore).padStart(2)}  ${String(o.listing.address.street).slice(0, 28)}`)
  if (o.offer.decision === "REJECT") console.log(`           └ ${o.offer.reasons[0]}`)
}
console.log(L)
console.log(`APPROVED (offer engine did not reject): ${ok.length} of ${out.length}`)
console.log(`   SEND-ready: ${out.filter(o => o.offer.decision === "SEND").length}   held for REVIEW: ${out.filter(o => o.offer.decision === "REVIEW").length}`)
console.log(`ARV = renovated asking $/sqft for the ZIP x living area. Asking, not sold — directional.`)
