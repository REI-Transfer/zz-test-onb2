-- Statewide send queue.
--
-- At two counties the daily cap was slack and processing order did not matter. Across
-- Florida far more listings qualify than you can responsibly mail, so the cap becomes
-- the binding constraint and ORDER becomes a strategy decision. Sending in MLS feed
-- order means the day's mail goes to whichever counties the feed returned first.
--
-- This splits intake from sending: intake evaluates and enqueues, a separate drain
-- workflow takes the top N by priority. See n8n/README.md.

alter table acq_predictions
  add column if not exists priority integer not null default 0,
  add column if not exists market_tier text,
  add column if not exists county text;

create index if not exists acq_predictions_queue_idx
  on acq_predictions (priority desc, decided_at desc);

-- Pending LOIs, best first. Excludes anything already sent, any thread already open,
-- and any suppressed agent — the suppression join is the important one, since a
-- statewide feed will surface listings from agents who opted out in another county.
create or replace view acq_send_queue as
  select
    p.listing_key,
    p.listing_id,
    p.county,
    p.market_tier,
    p.priority,
    p.confidence,
    p.offer_price,
    p.predicted_arv,
    p.predicted_repairs,
    p.decided_at
  from acq_predictions p
  left join acq_sends   s on s.listing_key = p.listing_key
  left join acq_threads t on t.listing_key = p.listing_key
  where p.decision = 'SEND'
    and s.id is null
    and t.listing_key is null
    -- Decisions go stale: a listing that has since gone pending or had a price cut is
    -- no longer the listing that was underwritten.
    and p.decided_at > now() - interval '48 hours'
  order by p.priority desc, p.decided_at asc;

-- Same idea for the human queue, so the review list is worth working top-down.
create or replace view acq_review_queue as
  select p.*, t.stage
  from acq_predictions p
  left join acq_threads t on t.listing_key = p.listing_key
  where p.decision = 'REVIEW'
  order by p.priority desc, p.decided_at desc;
