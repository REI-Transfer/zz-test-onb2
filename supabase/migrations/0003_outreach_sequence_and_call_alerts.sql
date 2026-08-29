-- Follow-up sequence state and the call-trigger work queue.
--
-- Two additions:
--   acq_sequences    — where each thread sits in the follow-up cadence
--   acq_call_alerts  — threads where a counter landed close enough that a person
--                      should be dialling instead of another email going out

create table if not exists acq_sequences (
  listing_key           text        primary key references acq_threads (listing_key) on delete cascade,
  loi_sent_at           timestamptz not null,
  touches_sent          jsonb       not null default '[]'::jsonb,
  -- Set the instant anything arrives from the agent. The sequence and the negotiation
  -- engine must never both be mailing the same person.
  replied_at            timestamptz,
  standard_status       text        not null default 'Active',
  -- Watched for reductions: a cut below this fires the re-engagement touch, which is
  -- the highest-converting message in the sequence and the one most operations skip.
  last_known_list_price integer     not null,
  stopped_reason        text,
  next_due_at           timestamptz,
  updated_at            timestamptz not null default now()
);

create index if not exists acq_sequences_due_idx
  on acq_sequences (next_due_at)
  where stopped_reason is null and replied_at is null;

-- Touches due now. The drain workflow reads this; nothing else needs to know the rules.
create or replace view acq_sequence_due as
  select s.*, t.agent_email, t.current_offer, t.listing_id
  from acq_sequences s
  join acq_threads t using (listing_key)
  where s.stopped_reason is null
    and s.replied_at is null
    and s.standard_status not in ('Pending','Closed','Sold','Withdrawn','Expired','Canceled')
    and (s.next_due_at is null or s.next_due_at <= now())
    and not exists (select 1 from acq_suppressions x where x.contact = lower(t.agent_email))
  order by s.next_due_at nulls first;

-- ---------------------------------------------------------------------------
-- Call alerts. A row here means email is now the wrong channel.
-- ---------------------------------------------------------------------------
create table if not exists acq_call_alerts (
  id            uuid        primary key default gen_random_uuid(),
  listing_key   text        not null references acq_threads (listing_key) on delete cascade,
  listing_id    text        not null,
  urgency       text        not null check (urgency in ('CALL_NOW','REVIEW_TODAY','QUEUE')),
  headline      text        not null,
  their_counter integer,
  our_ceiling   integer,
  -- How far above the authority ceiling their counter sits. Negative means the deal is
  -- already closeable and nobody needs to approve anything.
  gap_dollars   integer,
  gap_pct       numeric(6,4),
  agent_name    text,
  agent_phone   text,
  agent_email   text,
  created_at    timestamptz not null default now(),
  -- Claimed and worked. Left null, this is an open item on someone's desk.
  claimed_by    text,
  claimed_at    timestamptz,
  outcome       text
);

create index if not exists acq_call_alerts_open_idx
  on acq_call_alerts (urgency, created_at desc)
  where claimed_at is null;

-- The team's live call list, most urgent first.
create or replace view acq_call_queue as
  select * from acq_call_alerts
  where claimed_at is null and urgency in ('CALL_NOW','REVIEW_TODAY')
  order by case urgency when 'CALL_NOW' then 0 else 1 end, created_at asc;

alter table acq_sequences   enable row level security;
alter table acq_call_alerts enable row level security;
