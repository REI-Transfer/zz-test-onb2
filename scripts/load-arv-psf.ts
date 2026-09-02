/**
 * scripts/load-arv-psf.ts — Put the ARV basis in the database.
 *
 * Run:  npx tsx scripts/load-arv-psf.ts /tmp/arv_psf.json --basis=asking [--commit]
 *
 * Input is the flat map the ZIP sweep produces: { "33704": 367.44, ..., "_default": 316.67 }.
 * The _default key is dropped: a fallback belongs in the query that reads these,
 * where it can be seen, not stored as if it were a real ZIP.
 *
 * --basis is required and there is no default. Asking prices and sold comps are
 * different claims about the world, and an offer built on the first is
 * directional in a way an agent can and will push back on. Making the caller say
 * which one they have keeps that distinction from evaporating.
 */

import { readFileSync } from "node:fs"
import { query, quote, table } from "../lib/acquisition/db"

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
const basis = args.find((a) => a.startsWith("--basis="))?.split("=")[1]
const note = args.find((a) => a.startsWith("--note="))?.split("=").slice(1).join("=")
const COMMIT = args.includes("--commit")

if (!file || !basis) {
  console.error("usage: load-arv-psf.ts <file.json> --basis=asking|sold [--note=...] [--commit]")
  process.exit(1)
}
if (basis !== "asking" && basis !== "sold") {
  console.error(`--basis must be "asking" or "sold", got "${basis}"`)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>
const entries = Object.entries(raw).filter(([zip]) => /^\d{5}$/.test(zip))
const dropped = Object.keys(raw).length - entries.length

if (!entries.length) {
  console.error(`no five-digit ZIP keys in ${file}`)
  process.exit(1)
}

const bad = entries.filter(([, v]) => !Number.isFinite(v) || v <= 0)
if (bad.length) {
  console.error(`refusing to load: ${bad.length} ZIPs have a non-positive rate (${bad[0][0]}=${bad[0][1]})`)
  process.exit(1)
}

const rates = entries.map(([, v]) => v).sort((a, b) => a - b)
console.log(`${file}`)
console.log(`  ${entries.length} ZIPs, basis=${basis}${dropped ? `, ${dropped} non-ZIP keys dropped` : ""}`)
console.log(`  $/sqft  low ${rates[0].toFixed(2)}  median ${rates[Math.floor(rates.length / 2)].toFixed(2)}  high ${rates[rates.length - 1].toFixed(2)}`)

if (!COMMIT) {
  console.log("\ndry run. re-run with --commit to write.")
  process.exit(0)
}

// sample_size is 0 because the flat map does not carry one. Recorded honestly
// rather than invented: a fabricated sample size is worse than a missing one,
// because it looks like evidence.
const values = entries
  .map(([zip, v]) => `(${quote(zip)},${quote(basis)},${quote(Number(v.toFixed(2)))},0,now(),${quote(note ?? null)})`)
  .join(",")

// tsx compiles these scripts to CJS, where top-level await is not available.
async function main(): Promise<void> {
  await query(`
    insert into ${table("acq_arv_psf")} (postal_code, basis, psf, sample_size, computed_at, note)
    values ${values}
  `)

  const current = await query<{ n: number }>(`select count(*)::int n from ${table("acq_arv_psf_current")}`)
  console.log(`\nwrote ${entries.length} rows. ${current[0].n} ZIPs now have a current rate.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
