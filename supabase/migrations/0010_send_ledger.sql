-- 0010_send_ledger.sql
--
-- acq_sends records what was said and to whom, but not which touch it was or
-- what the sending platform called it. Both are needed the moment a sequence has
-- more than one step.
--
-- `touch` because sequence.ts decides the next step from the list of touches
-- already sent. Without it, a ledger of three rows for one listing cannot say
-- whether the next letter is T2 or T4, and the cadence either stalls or repeats.
--
-- `provider_id` because when an agent says they never received it, the answer has
-- to be checkable against the sending platform rather than asserted from our own
-- copy of events.

set search_path = agent_outreach_elevate, public;

alter table acq_sends
  add column if not exists touch text,
  add column if not exists provider_id text;

comment on column acq_sends.touch is
  'Which step of the sequence this was: T1_LOI, T2_CREDIBILITY, T3_TERMS, T4_TAKEAWAY, T5_PRICE_CUT. sequence.ts reads the set of touches already sent to decide the next one.';

comment on column acq_sends.provider_id is
  'The sending platform''s id for this message or lead. The independent record when someone says they never got it.';

-- A row here means a letter left. One touch per listing, once.
create unique index if not exists acq_sends_listing_touch_uk
  on acq_sends (listing_key, touch)
  where touch is not null;
