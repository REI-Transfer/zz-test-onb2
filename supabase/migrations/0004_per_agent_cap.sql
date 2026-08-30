-- Per-agent volume cap on the send queue.
--
-- acq_suppressions is keyed per agent email and it works, but it only catches agents
-- who have already asked to be left alone — it is a record of damage already done.
-- Nothing capped VOLUME. A busy Tampa listing agent holding eight dated listings would
-- receive eight LOIs plus up to twenty-four follow-ups inside fourteen days, all from
-- the same sender, none of them wrong on their own. That is a complaint, not outreach,
-- and in a market this size it costs you every listing that agent takes afterwards.
--
-- Mirrors MAX_ACTIVE_THREADS_PER_AGENT / agentAtVolumeCap() in lib/acquisition/offer.ts.
-- Both layers exist on purpose: the code gate decides whether one evaluation may
-- auto-send, and this one decides what the drain workflow is allowed to pick up. A
-- queue that hands out work the send gate will refuse is a queue nobody trusts.

-- The queue could not see the listing agent at all: acq_predictions carries the
-- listing, the county and the economics, but never the person being mailed. Intake
-- writes it here so the cap can be applied before anything is drafted.
alter table acq_predictions
  add column if not exists agent_email text;

create index if not exists acq_predictions_agent_email_idx
  on acq_predictions (lower(agent_email));

-- Pending LOIs, best first. Excludes anything already sent, any thread already open,
-- any suppressed agent, and now any agent already carrying their allowance of live
-- conversations.
--
-- NOTE the cap literal below is 2 and must match MAX_ACTIVE_THREADS_PER_AGENT. SQL
-- cannot read the app's env; if you raise one, raise the other in the same commit or
-- the two layers will disagree and the drain workflow will keep offering work that
-- computeOffer() then holds for review.
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
    p.decided_at,
    -- Appended last: create or replace view can only add columns at the end. The drain
    -- workflow needs the address it is about to write to.
    p.agent_email
  from acq_predictions p
  left join acq_sends   s on s.listing_key = p.listing_key
  left join acq_threads t on t.listing_key = p.listing_key
  where p.decision = 'SEND'
    and s.id is null
    and t.listing_key is null
    -- Decisions go stale: a listing that has since gone pending or had a price cut is
    -- no longer the listing that was underwritten.
    and p.decided_at > now() - interval '48 hours'
    -- Per-agent volume cap. DEAD is the only terminal stage: an escalated thread or one
    -- sitting in ACCEPTED_PENDING_HUMAN is still a live conversation with that person,
    -- and a thread that died in March should not block a good listing in September.
    --
    -- A null agent_email passes: there is nobody to over-mail, and such a row is held
    -- for review by computeOffer() anyway for want of a delivery address.
    and (
      p.agent_email is null
      or (
        select count(*)
        from acq_threads a
        where lower(a.agent_email) = lower(p.agent_email)
          and a.stage <> 'DEAD'
      ) < 2
    )
  order by p.priority desc, p.decided_at asc;

-- The view counts threads that already EXIST, so a single drain batch can still take
-- two rows for the same agent and open both. Have the drain workflow open the thread as
-- it sends each row rather than opening them all up front — the next row then sees the
-- thread the previous one created. At the default cap of 2 the worst case is one extra
-- letter; at a higher cap it stops being harmless.
