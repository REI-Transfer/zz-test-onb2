# n8n workflows

Import both into your existing n8n instance.

| File | What it does |
|---|---|
| `01-listing-intake.json` | Polls Stellar MLS → normalizes → enriches → evaluates → sends LOI or queues for review |
| `02-reply-handler.json` | Inbound email/SMS reply → suppression check → policy → auto-reply or escalate |

## What lives where, and why

The split is deliberate. n8n is good at scheduling, fan-out, retries, delivery, and
being inspectable when something goes wrong at 2am. It is bad at holding logic you need
to test, version, and review.

**In n8n:** polling, normalization, enrichment calls, delivery (Gmail/Twilio),
persistence, retries, the review queue, human notification.

**In code (`lib/acquisition/`):** the offer math, the concession ladder, condition
scoring, the confidence gate, keyword handling. These are the parts where a mistake
costs money, so they live where they can have tests. `scripts/verify-negotiation.ts`
covers 43 of those cases; none of that is expressible in a Switch node.

Both API endpoints **decide and draft but never send**. That is what makes a bad run
recoverable — you can replay an execution and see exactly what would have gone out.

## Setup

1. **Apply the schema.** `supabase/migrations/0001_acquisition_pipeline.sql` against your
   Supabase project. Nothing works without it: n8n has no memory between runs, so
   without these tables every reply looks like the first one in the thread.
2. **Credentials in n8n:**
   - Header Auth → `Authorization: Bearer <ACQ_API_SECRET>` (both HTTP nodes)
   - Header Auth → Stellar RESO Web API token
   - Header Auth → DealMachine API key
   - Supabase (service role key — these tables have RLS on with no policies)
   - Gmail OAuth2 on your real Workspace address
   - Twilio (only if you enable SMS)
3. **Env vars in n8n:** `ACQ_BASE_URL`, `STELLAR_RESO_BASE`, `DEALMACHINE_BASE`
4. **Normalize inbound replies before the webhook.** Gmail Pub/Sub push and Twilio's
   inbound webhook have different shapes. Both must reach `/webhook/acq-reply` as:
   ```json
   { "channel": "email|sms", "from": "...", "body": "...",
     "listingKey": "...", "receivedAt": "ISO8601" }
   ```
   Matching an inbound message back to `listingKey` is the one piece you must build:
   for email use the thread id or a plus-address; for SMS, look up
   `acq_threads.agent_phone`.

## Statewide volume: split intake from sending

`01-listing-intake.json` sends the LOI inline, which is fine at pilot scope. Statewide it
is wrong: the daily cap becomes binding, and sending inline means the day's mail goes to
whichever counties the MLS feed happened to return first.

Split it into two workflows:

1. **Intake** — evaluate and write to `acq_predictions` (including `priority`). Stop there.
   Remove the `Open Negotiation Thread → Send LOI → Log Send` branch.
2. **Drain** — a separate schedule (say hourly) that reads
   `select * from acq_send_queue limit <remaining cap>`, opens the thread, sends, logs.

The `acq_send_queue` view (migration 0002) handles best-first ordering, excludes
already-sent listings, drops decisions older than 48 hours, and filters suppressed
agents — that last one matters more statewide, since a statewide feed will surface
listings from agents who opted out in a different county.

## Before enabling SMS

One thing worth knowing, because it is genuinely counterintuitive: **the TCPA has no
B2B exemption.** Its restrictions on automated texts apply to the number, not the
recipient's role — a listing agent's mobile is a cell phone, and an automated system
texting it is treated the same as texting a consumer. Florida's FTSA is stricter still.
"They published the number in the MLS" is not consent for an automated system.

This matters for the direction of the thread, and the workflow is built around that:

- **Replying to a thread the agent started** — they texted you first — is a
  fundamentally different posture, and it is all `02-reply-handler.json` does.
- **Initiating automated outbound SMS** to agent cells is the exposed version. Nothing
  here does it, and you should get a Florida telemarketing attorney to look before you
  add it.

Email to listing agents has none of this attached. Start there; add SMS as a reply-only
channel once threads are running.

## Import caveat

These were written against n8n's current node schemas but not round-tripped through a
live instance. Node type versions drift — if a node imports with a validation warning,
the parameters are right and the `typeVersion` needs bumping. Fix it in the UI and
re-export over the file.
