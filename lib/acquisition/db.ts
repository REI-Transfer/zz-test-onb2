/**
 * lib/acquisition/db.ts — The one place the acquisition pipeline talks to Postgres.
 *
 * WHY THIS EXISTS
 *
 * Until now the scoring scripts read and wrote /tmp JSON files and the database
 * was populated by hand from Python. The consequence showed up the first time
 * anyone looked at the send queue: acq_predictions was empty, so the queue was
 * empty, so the send path could never have run no matter how well the rest of it
 * worked. The offers existed only as console output.
 *
 * WHY THE MANAGEMENT API AND NOT POSTGREST
 *
 * The agent_outreach_elevate schema is not exposed through PostgREST, so
 * supabase-js cannot see it. Exposing it would put the whole outreach ledger
 * behind the anon key's RLS surface for the sake of a convenience client, which
 * is a bad trade for a table full of agent contact details.
 *
 * The cost is that this uses SUPABASE_PAT, an account-level admin credential.
 * That is acceptable for scripts a human runs and NOT acceptable for anything
 * unattended. Before this runs on a schedule it needs a service-role key and the
 * schema exposed to it alone. Flagged here rather than in a ticket because this
 * is the file where someone would otherwise copy the pattern.
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "glaxjfmfhlhwsblwprzo"
const SCHEMA = "agent_outreach_elevate"

export type Row = Record<string, unknown>

/**
 * Run SQL and return rows.
 *
 * `params` are interpolated by this function rather than sent as bind
 * parameters, because the Management API's query endpoint takes a string. So
 * every value goes through quote() below and callers must not build SQL by
 * concatenating anything else.
 */
export async function query<T extends Row = Row>(sql: string): Promise<T[]> {
  const pat = process.env.SUPABASE_PAT
  if (!pat) throw new Error("SUPABASE_PAT is not set")

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      // The default agent is refused at Supabase's edge with a bare 403 that reads
      // exactly like a bad token. Cost an hour once; it is not coming back.
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query: sql }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`supabase query failed (${res.status}): ${text.slice(0, 400)}`)

  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) throw new Error(`unexpected response shape: ${text.slice(0, 200)}`)
  return parsed as T[]
}

/** SQL literal for a value. Null and undefined both become NULL. */
export function quote(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`refusing to write a non-finite number: ${v}`)
    return String(v)
  }
  if (typeof v === "boolean") return v ? "true" : "false"
  return `'${v.replace(/'/g, "''")}'`
}

export const table = (name: string): string => `${SCHEMA}.${name}`
export const schema = SCHEMA
