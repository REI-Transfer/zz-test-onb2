/**
 * lib/acquisition/outreach/instantly.ts — The send path. Everything upstream of
 * this file decides WHAT to say; this is the only thing that puts it in an inbox.
 *
 * WHY INSTANTLY RATHER THAN SMTP
 *
 * The bottleneck on cold email is not sending, it is landing. 96 Gmail accounts
 * are already warm on this workspace at 20/day each, with warmup traffic running
 * permanently alongside. Rebuilding that on raw SMTP would mean re-earning
 * several months of sender reputation to save an API call.
 *
 * WHO OWNS THE CADENCE
 *
 * Instantly owns the clock for the scheduled touches (T1 through T4). It paces
 * across the account pool, respects per-inbox daily caps, and stops a lead the
 * moment a reply lands, which is exactly the stop condition sequence.ts cares
 * most about. sequence.ts stays the source of truth for what each touch SAYS and
 * for the one touch Instantly cannot know about: a price cut on the listing.
 *
 * WHY THE WHOLE LETTER IS A VARIABLE
 *
 * Instantly's own merge tags are per-lead strings. Our letter is computed —
 * two-directional pricing, a named repair budget, a rounded offer — by offer.ts
 * and loi.ts. Re-expressing that arithmetic inside an Instantly template would
 * create a second copy of the pricing logic that drifts from the first. So the
 * letter is rendered here and pushed as one variable, and the Instantly sequence
 * step is a thin wrapper that prints it.
 *
 * WHAT THIS FILE WILL NOT DO
 *
 * It will not send to an address the suppression gate rejects, it will not send
 * without ACQ_SEND_ENABLED, and it has no SMS path at all. See config for why
 * the texts are written but not wired.
 */

import acquisitionConfig from "../config"
import { checkSuppression } from "../suppression"

const API = "https://api.instantly.ai/api/v2"

export type InstantlyLead = {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  /** Per-lead merge variables. The rendered letter rides in here. */
  custom_variables: Record<string, string>
}

export type DispatchResult = {
  listingKey: string
  email: string
  status: "sent" | "suppressed" | "duplicate" | "dry-run" | "error"
  detail?: string
  leadId?: string
}

class InstantlyError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "InstantlyError"
  }
}

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
  if (!res.ok) {
    throw new InstantlyError(res.status, `${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

export type CampaignAccount = { email: string; daily_limit?: number; warmup_status?: number; status?: number }

/**
 * Daily ceiling for the campaign, from the accounts actually attached to it.
 *
 * Worth computing rather than assuming: a campaign wired to 96 inboxes at 20/day
 * can move 1,920 letters, and a campaign wired to 3 can move 60. Queueing 400
 * listings against the second one silently spreads the send over a week, and the
 * offers age out while they sit.
 */
export async function campaignDailyCapacity(campaignId: string): Promise<{ accounts: number; perDay: number }> {
  const campaign = await call<{ email_list?: string[] }>(`/campaigns/${campaignId}`)
  const attached = new Set(campaign.email_list ?? [])
  if (attached.size === 0) return { accounts: 0, perDay: 0 }

  const all = await call<{ items?: CampaignAccount[] }>("/accounts?limit=100")
  const items = (all.items ?? []).filter((a) => attached.has(a.email))
  const perDay = items.reduce((sum, a) => sum + (a.daily_limit ?? 0), 0)
  return { accounts: items.length, perDay }
}

export type OutreachTarget = {
  listingKey: string
  agentEmail: string
  agentFirstName: string
  agentLastName?: string
  brokerage?: string
  /** The rendered letter, subject and body, from loi.ts. */
  subject: string
  body: string
  /** Everything the follow-up touches merge in. */
  fields: Record<string, string>
}

/**
 * Push one target into the campaign.
 *
 * The suppression check runs here rather than only at the queue, deliberately.
 * The queue is a view and this function is callable from a script, a webhook or
 * a retry; a gate that only exists in one of those paths is a gate that a future
 * caller walks around without noticing.
 */
export async function dispatch(
  target: OutreachTarget,
  opts: { campaignId?: string; dryRun?: boolean } = {},
): Promise<DispatchResult> {
  const campaignId = opts.campaignId ?? acquisitionConfig.instantlyCampaignId
  const base = { listingKey: target.listingKey, email: target.agentEmail }

  const verdict = checkSuppression({
    name: `${target.agentFirstName} ${target.agentLastName ?? ""} ${target.brokerage ?? ""}`.trim(),
    email: target.agentEmail,
  })
  if (verdict.suppressed) {
    return { ...base, status: "suppressed", detail: verdict.reasons.join("; ") }
  }
  if (verdict.review) {
    // Ambiguous is not a licence to send. Held, and reported, so a human clears it.
    return { ...base, status: "suppressed", detail: `needs review: ${verdict.reasons.join("; ")}` }
  }

  // Dry run is checked before the campaign id, deliberately. A dry run is how you
  // read the letter before anyone else does, and it needs no destination to do
  // that; demanding one turns the safe path into the harder path, which is how
  // people end up skipping it.
  if (opts.dryRun ?? !acquisitionConfig.sendEnabled) {
    return {
      ...base,
      status: "dry-run",
      detail: `${target.subject} (${target.body.split(/\s+/).length} words)`,
    }
  }

  if (!campaignId) {
    return { ...base, status: "error", detail: "INSTANTLY_CAMPAIGN_ID is not set" }
  }

  const lead: InstantlyLead & { campaign: string; skip_if_in_campaign: boolean } = {
    campaign: campaignId,
    // Instantly dedupes on address within a campaign. Cheaper and more reliable
    // than our own check, because it also catches a lead added by hand in the UI.
    skip_if_in_campaign: true,
    email: target.agentEmail,
    first_name: target.agentFirstName,
    last_name: target.agentLastName,
    company_name: target.brokerage,
    custom_variables: {
      ...target.fields,
      loiSubject: target.subject,
      loiBody: target.body,
      listingKey: target.listingKey,
    },
  }

  try {
    const created = await call<{ id?: string; skipped?: boolean }>("/leads", "POST", lead)
    if (created.skipped) return { ...base, status: "duplicate", detail: "already in campaign" }
    return { ...base, status: "sent", leadId: created.id }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ...base, status: "error", detail }
  }
}

/**
 * Push a batch, sequentially and paced.
 *
 * Sequential on purpose. Instantly rate-limits, and a parallel flood returns 429s
 * that are indistinguishable from a bad key at the call site. The whole batch is
 * a few hundred rows a day; there is nothing to win by racing.
 */
export async function dispatchAll(
  targets: OutreachTarget[],
  opts: { campaignId?: string; dryRun?: boolean; pauseMs?: number } = {},
): Promise<DispatchResult[]> {
  const out: DispatchResult[] = []
  const pause = opts.pauseMs ?? 250
  for (const t of targets) {
    out.push(await dispatch(t, opts))
    if (!(opts.dryRun ?? !acquisitionConfig.sendEnabled)) {
      await new Promise((r) => setTimeout(r, pause))
    }
  }
  return out
}
