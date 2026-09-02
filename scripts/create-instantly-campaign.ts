/**
 * scripts/create-instantly-campaign.ts — Create the campaign the letters go into.
 *
 * Run:  npx tsx scripts/create-instantly-campaign.ts            # show what it would build
 *       npx tsx scripts/create-instantly-campaign.ts --commit   # create it, PAUSED
 *
 * Creates once and prints the id. Put that id in INSTANTLY_CAMPAIGN_ID and the
 * dispatcher's pre-flight goes green.
 *
 * The campaign is created PAUSED with no leads. Activating it is a person's
 * decision made in the Instantly UI, not something a script should do on its way
 * past.
 *
 * WHY THE SEQUENCE IS ALMOST EMPTY
 *
 * Each step prints a variable and nothing else. The letter is computed per
 * listing by offer.ts and loi.ts -- two-directional pricing, a named repair
 * budget, a rounded offer -- and writing any of that reasoning into an Instantly
 * template would create a second copy that drifts from the first. The day they
 * disagree, the agent is holding the wrong number and we cannot say why. So the
 * platform holds the cadence and the envelope; this codebase holds the words.
 *
 * TRACKING IS OFF, DELIBERATELY
 *
 * Open pixels and rewritten links are both spam signals on Gmail-to-Gmail cold
 * mail, which is exactly what this is: 96 warm Gmail accounts writing to agents
 * who mostly read on Gmail. Open rate is worth less than landing in the inbox.
 */

import acquisitionConfig from "../lib/acquisition/config"

const COMMIT = process.argv.includes("--commit")
const API = "https://api.instantly.ai/api/v2"

async function call<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  const key = process.env.INSTANTLY_API_KEY
  if (!key) throw new Error("INSTANTLY_API_KEY is not set")
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`)
  return (text ? JSON.parse(text) : {}) as T
}

type Account = { email: string; status?: number; warmup_status?: number; daily_limit?: number }

async function main(): Promise<void> {
  const existing = await call<{ items?: Array<{ id: string; name: string; status: number }> }>(
    "/campaigns?limit=100",
  )
  const already = existing.items?.find((c) => c.name.startsWith("Elevate — Agent LOI"))
  if (already) {
    console.log(`campaign already exists: ${already.id} ("${already.name}", status ${already.status})`)
    console.log("set INSTANTLY_CAMPAIGN_ID to that id. Not creating a second one.")
    return
  }

  const accounts = await call<{ items?: Account[] }>("/accounts?limit=100")
  // Warm and active only. A cold or paused inbox in the pool does not send, it
  // just makes the capacity number a lie.
  const warm = (accounts.items ?? []).filter((a) => a.status === 1 && a.warmup_status === 1)
  const perDay = warm.reduce((n, a) => n + (a.daily_limit ?? 0), 0)

  console.log(`${warm.length} warm and active inboxes, ${perDay}/day ceiling`)
  console.log(`campaign daily limit will be set to ${acquisitionConfig.sendDailyCap}`)

  if (!warm.length) {
    console.error("no warm inboxes: nothing to attach")
    process.exit(1)
  }

  const payload = {
    name: "Elevate — Agent LOI (St Pete)",
    email_list: warm.map((a) => a.email),
    daily_limit: acquisitionConfig.sendDailyCap,
    stop_on_reply: true,
    stop_on_auto_reply: true,
    link_tracking: false,
    open_tracking: false,
    text_only: true,
    campaign_schedule: {
      schedules: [
        {
          name: "Business hours",
          // Agents read email between showings. Nothing sends at 2am, which is
          // both a deliverability signal and the difference between a letter that
          // reads as written by a person and one that reads as sent by a machine.
          timing: { from: "09:00", to: "16:30" },
          days: { "1": true, "2": true, "3": true, "4": true, "5": true },
          timezone: "America/New_York",
        },
      ],
    },
    sequences: [
      {
        steps: [
          // Day 0. The letter itself.
          { type: "email", delay: 0, variants: [{ subject: "{{loiSubject}}", body: "{{loiBody}}" }] },
          // Every follow-up has an empty subject so it threads under the original
          // rather than arriving as a second cold email.
          { type: "email", delay: 3, variants: [{ subject: "", body: "{{t2Body}}" }] },
          { type: "email", delay: 4, variants: [{ subject: "", body: "{{t3Body}}" }] },
          { type: "email", delay: 5, variants: [{ subject: "", body: "{{t4Body}}" }] },
        ],
      },
    ],
  }

  if (!COMMIT) {
    console.log("\ndry run. would create:")
    console.log(`  name      ${payload.name}`)
    console.log(`  inboxes   ${payload.email_list.length}`)
    console.log(`  schedule  ${payload.campaign_schedule.schedules[0].timing.from}-${payload.campaign_schedule.schedules[0].timing.to} ET, Mon-Fri`)
    console.log(`  steps     ${payload.sequences[0].steps.length} (day 0, +3, +4, +5)`)
    console.log(`  tracking  opens off, links off`)
    console.log("\nre-run with --commit. It is created paused; you activate it in the UI.")
    return
  }

  const created = await call<{ id: string; name: string; status: number }>("/campaigns", "POST", payload)
  console.log(`\ncreated ${created.id} ("${created.name}") paused, no leads.`)
  console.log(`\nadd to .env.local:\n  INSTANTLY_CAMPAIGN_ID="${created.id}"`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
