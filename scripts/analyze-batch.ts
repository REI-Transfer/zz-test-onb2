/** Funnel report over a saved Apify detail dataset. */
import { readFileSync, writeFileSync } from "node:fs"
import { fromZillow } from "../lib/acquisition/adapters/zillow"
import { assessCondition } from "../lib/acquisition/condition"
import { capitulationScore, derivePriceSignals, detectFlip, readsAsDelusional } from "../lib/acquisition/capitulation"
import { evaluateListing } from "../lib/acquisition/pipeline"
import type { ArvEstimate } from "../lib/acquisition/types"

const recs = JSON.parse(readFileSync(process.argv[2], "utf8")) as any[]
const out: any[] = []
let dropped = 0
const decisions: Record<string, number> = {}
const reasons: Record<string, number> = {}

;(async () => {
  for (const rec of recs) {
    const listing = fromZillow(rec)
    if (!listing) { dropped++; continue }
    const cond = assessCondition({ listing })
    const sig = derivePriceSignals(rec.priceHistory ?? [], listing.listPrice, rec.zestimate)
    const flip = detectFlip(rec.priceHistory ?? [], listing.listPrice)
    const arv: ArvEstimate = { arv: rec.zestimate && rec.zestimate > 0 ? rec.zestimate : Math.round(listing.listPrice * 1.02), comparables: [], source: "provider" }
    const r = await evaluateListing({ listing, arv })
    decisions[r.decision] = (decisions[r.decision] ?? 0) + 1
    const why = (r.offer.reasons[0] ?? "").replace(/\$[\d,]+/g, "$X").replace(/\b\d+\b/g, "N").slice(0, 62)
    reasons[why] = (reasons[why] ?? 0) + 1
    out.push({
      zpid: listing.listingKey, mls: listing.listingId,
      address: `${listing.address.street}, ${listing.address.city} ${listing.address.postalCode}`,
      price: listing.listPrice, sqft: listing.livingArea, year: listing.yearBuilt,
      dom: listing.daysOnMarket, photos: listing.photos.length,
      conditionText: cond.conditionScore, tier: cond.tier,
      signals: cond.matchedSignals.slice(0, 4).join(" | "),
      cuts: sig.cuts, reductionPct: Math.round(sig.totalReductionPct * 1000) / 10,
      capitulation: capitulationScore(sig),
      delusional: readsAsDelusional(sig, listing.daysOnMarket),
      likelyFlip: flip.isLikelyFlip, monthsSincePurchase: flip.monthsSincePurchase, markup: flip.markupRatio,
      decision: r.decision, offer: r.offer.offerPrice, confidence: r.offer.confidence,
      agent: listing.listAgent.fullName, agentPhone: listing.listAgent.phone,
      flLicense: listing.listAgent.mlsId, brokerage: listing.listAgent.brokerageName,
      url: `https://www.zillow.com/homedetails/${listing.listingKey}_zpid/`,
    })
  }
  const L = "═".repeat(78)
  console.log(`\n${L}\nFUNNEL — ${recs.length} detail records\n${L}`)
  console.log(`dropped by adapter (not a buyable property): ${dropped}`)
  console.log(`\nDECISIONS:`); Object.entries(decisions).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`   ${k.padEnd(8)} ${v}`))
  console.log(`\nTOP REASONS:`); Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,6).forEach(([k,v])=>console.log(`   ${String(v).padStart(4)}  ${k}`))
  const cond = out.map(o=>o.conditionText).sort((a,b)=>a-b)
  console.log(`\nTEXT CONDITION SCORE  median ${cond[Math.floor(cond.length/2)]}  p90 ${cond[Math.floor(cond.length*0.9)]}  max ${cond[cond.length-1]}`)
  console.log(`   at or above the 45 threshold on TEXT ALONE: ${out.filter(o=>o.conditionText>=45).length}`)
  console.log(`   would reach the photo pass:                 ${out.filter(o=>o.photos>0 && (o.conditionText>=25 || (o.year??9999)<=1985)).length}`)
  const cap = out.map(o=>o.capitulation).sort((a,b)=>a-b)
  const flips=out.filter(o=>o.likelyFlip)
  console.log(`\nLIKELY FLIPS (recent purchase + 25%+ markup): ${flips.length} of ${out.length}`)
  const nonflip=out.filter(o=>!o.likelyFlip && (o.year??9999)<=1985)
  console.log(`PRE-1986 AND NOT A FLIP — the real target pool: ${nonflip.length}`)
  console.log(`\nCAPITULATION  median ${cap[Math.floor(cap.length/2)]}  |  zero-cut sellers: ${out.filter(o=>o.cuts===0).length}  |  flagged delusional: ${out.filter(o=>o.delusional).length}`)
  writeFileSync("/tmp/analyzed.json", JSON.stringify(out, null, 1))
  const cols = Object.keys(out[0])
  writeFileSync("/tmp/analyzed.csv", cols.join(",") + "\n" + out.map(o=>cols.map(c=>{
    const v=(o as any)[c]; const s=v===null||v===undefined?"":String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s }).join(",")).join("\n"))
  console.log(`\nsaved -> /tmp/analyzed.csv (${out.length} rows)`)
})()
