-- Acquisition pipeline state.
--
-- The Next.js endpoints are stateless by design: they decide and draft, then hand the
-- result back. Something has to remember what happened between n8n runs, and n8n is a
-- workflow engine, not a database. These tables are that memory.
--
-- Everything here is written by the server (n8n via the service role). No table is
-- reachable from a browser, so RLS is enabled with NO permissive policies — the service
-- role bypasses RLS, and anon/authenticated get nothing. Do not add a policy here
-- without a specific reason to expose the data client-side.

-- ---------------------------------------------------------------------------
-- Suppression list. Checked before ANY outbound send, on every channel.
-- Deliberately the first table in the file: it is the one whose failure is legal
-- rather than commercial.
-- ---------------------------------------------------------------------------
create table if not exists acq_suppressions (
  id            uuid primary key default gen_random_uuid(),
  -- Lowercased email or E.164 phone. One row per address/number, not per listing:
  -- an opt-out is a person saying "not from you, ever", not "not about this house".
  contact       text        not null unique,
  channel       text        not null check (channel in ('email', 'sms')),
  reason        text        not null,
  suppressed_at timestamptz not null default now()
);

create index if not exists acq_suppressions_contact_idx on acq_suppressions (contact);

-- ---------------------------------------------------------------------------
-- One negotiation thread per listing. Mirrors NegotiationState in
-- lib/acquisition/negotiation/types.ts.
-- ---------------------------------------------------------------------------
create table if not exists acq_threads (
  listing_key       text        primary key,
  listing_id        text        not null,
  stage             text        not null check (stage in (
                        'OPENED', 'NEGOTIATING', 'ESCALATED',
                        'ACCEPTED_PENDING_HUMAN', 'DEAD')),
  opening_offer     integer     not null,
  current_offer     integer     not null,
  their_last_counter integer,
  concessions_used  integer     not null default 0,
  -- ARV / repairs / list price captured at LOI time. Frozen on purpose: the authority
  -- ceiling must not drift mid-thread on unverified claims in an email.
  economics         jsonb       not null,
  messages          jsonb       not null default '[]'::jsonb,
  escalation_reason text,
  -- Denormalized for fast queue queries; also the natural threading key for SMS.
  agent_email       text,
  agent_phone       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists acq_threads_stage_idx on acq_threads (stage);
create index if not exists acq_threads_agent_email_idx on acq_threads (lower(agent_email));
create index if not exists acq_threads_agent_phone_idx on acq_threads (agent_phone);

-- ---------------------------------------------------------------------------
-- Send ledger. Backs the daily auto-send cap and gives you a replayable record of
-- exactly what left the building.
-- ---------------------------------------------------------------------------
create table if not exists acq_sends (
  id           uuid        primary key default gen_random_uuid(),
  listing_key  text        not null references acq_threads (listing_key) on delete cascade,
  channel      text        not null check (channel in ('email', 'sms')),
  to_contact   text        not null,
  subject      text,
  body         text        not null,
  offer_price  integer,
  sent_at      timestamptz not null default now()
);

create index if not exists acq_sends_sent_at_idx on acq_sends (sent_at desc);

-- Today's automatic sends, for the MAX_AUTO_SENDS_PER_DAY gate. Uses America/New_York
-- because the cap is about when agents receive mail, not UTC midnight.
create or replace view acq_sends_today as
  select count(*)::int as sent_today
  from acq_sends
  where sent_at >= date_trunc('day', now() at time zone 'America/New_York')
                     at time zone 'America/New_York';

-- ---------------------------------------------------------------------------
-- Calibration ledger. Mirrors PredictionRecord / OutcomeRecord in outcomes.ts.
-- Split into two tables because they are written months apart.
-- ---------------------------------------------------------------------------
create table if not exists acq_predictions (
  listing_key       text        primary key,
  listing_id        text        not null,
  decided_at        timestamptz not null default now(),
  decision          text        not null check (decision in ('SEND', 'REVIEW', 'REJECT')),
  predicted_tier    text        not null,
  condition_score   integer     not null,
  predicted_repairs integer     not null,
  predicted_arv     integer     not null,
  offer_price       integer,
  confidence        integer     not null,
  living_area       integer,
  template_variant  text
);

create index if not exists acq_predictions_decided_at_idx on acq_predictions (decided_at desc);
create index if not exists acq_predictions_variant_idx on acq_predictions (template_variant);

create table if not exists acq_outcomes (
  listing_key         text        primary key references acq_predictions (listing_key) on delete cascade,
  replied             boolean,
  replied_at          timestamptz,
  counter_price       integer,
  contract_price      integer,
  -- The only exact ground truth in the system. Everything else is an estimate
  -- compared against another estimate.
  actual_repair_cost  integer,
  actual_resale_value integer,
  -- Set after a walkthrough. Cheapest, fastest label available — record it every time.
  observed_tier       text,
  corrections_from_agent jsonb,
  updated_at          timestamptz not null default now()
);

-- Everything the calibration report needs, pre-joined.
create or replace view acq_calibration_input as
  select p.*, to_jsonb(o.*) - 'listing_key' as outcome
  from acq_predictions p
  left join acq_outcomes o using (listing_key);

-- ---------------------------------------------------------------------------
-- RLS on, no policies. Server-side access only via the service role.
-- ---------------------------------------------------------------------------
alter table acq_suppressions enable row level security;
alter table acq_threads      enable row level security;
alter table acq_sends        enable row level security;
alter table acq_predictions  enable row level security;
alter table acq_outcomes     enable row level security;
