-- 0007_suppression_gate.sql
--
-- acq_suppressions has existed since 0002 and nothing has ever read it. The send
-- queue joins sends, threads and worked addresses, and then hands over an email
-- address without once asking whether that address is on the do-not-contact list.
-- An empty table hid the bug: with zero rows, a missing check and a working check
-- return the same queue.
--
-- Two things change here.
--
-- 1. Suppression becomes domain-aware. Storing only exact addresses means a client
--    who mails us from a second address at the same company sails through. The
--    agency's own client roster is a list of COMPANIES, so the domain is the unit
--    that actually identifies them.
--
-- 2. The send queue reads it. That is the whole point of the table.
--
-- Direction of failure is deliberate: an address that cannot be parsed is treated
-- as suppressed. A blocked send costs a delay; an unblocked one puts a cold pitch
-- from their own agency in a paying client's inbox.

set search_path = agent_outreach_elevate, public;

-- 'email' and 'sms' were the implied values; 'domain' is new and blocks a whole
-- company. Constrained rather than free text because a typo'd channel silently
-- stops suppressing anything.
alter table acq_suppressions
  add column if not exists source text;

comment on column acq_suppressions.source is
  'Where the entry came from: reply-optout, client-roster, manual. Reply opt-outs are permanent and must never be cleared by a roster rebuild.';

-- 0002 wrote this constraint as ('email','sms'), which rejects the new domain
-- channel. Adding a second, wider constraint would not help: checks are ANDed, so
-- the original keeps refusing the row. It has to be replaced. Postgres names an
-- inline CHECK <table>_<column>_check, but only when it was written inline, so
-- drop both that name and the explicit one before adding the replacement.
alter table acq_suppressions drop constraint if exists acq_suppressions_channel_check;
alter table acq_suppressions drop constraint if exists acq_suppressions_channel_chk;
alter table acq_suppressions
  add constraint acq_suppressions_channel_chk
  check (channel in ('email', 'sms', 'domain', 'all'));

create unique index if not exists acq_suppressions_contact_channel_uk
  on acq_suppressions (lower(contact), channel);

-- Is this address on the do-not-contact list, by itself or by its domain?
create or replace function is_suppressed(addr text)
returns boolean
language sql
stable
parallel safe
as $$
  select case
    -- No address, or something that is not an address, is not mailable. Fail closed.
    when addr is null or position('@' in addr) = 0 then true
    else exists (
      select 1 from agent_outreach_elevate.acq_suppressions s
      where (s.channel in ('email', 'all') and lower(s.contact) = lower(addr))
         or (s.channel = 'domain'
             and lower(s.contact) = lower(split_part(addr, '@', 2)))
    )
  end;
$$;

comment on function is_suppressed(text) is
  'True when an address must not be mailed. Returns true for a null or malformed address as well: the queue should drop what it cannot verify rather than guess.';

-- Rebuild the send queue with the gate in place. Everything else is carried over
-- from 0005 unchanged; the only new clause is the is_suppressed() filter.
create or replace view acq_send_queue as
  select p.listing_key,
         p.listing_id,
         p.county,
         p.market_tier,
         p.priority,
         p.confidence,
         p.offer_price,
         p.predicted_arv,
         p.predicted_repairs,
         p.decided_at,
         p.agent_email
    from acq_predictions p
    left join acq_sends   s on s.listing_key = p.listing_key
    left join acq_threads t on t.listing_key = p.listing_key
   where p.decision = 'SEND'
     and s.id is null
     and t.listing_key is null
     and p.decided_at > now() - interval '48 hours'
     -- No more than one live thread per agent. Two letters from the same company
     -- in the same week reads as a mail-merge, which is exactly what it is.
     and (p.agent_email is null or (
           select count(*) from acq_threads a
            where lower(a.agent_email) = lower(p.agent_email)
              and a.stage <> 'DEAD'
         ) < 2)
     -- Never mail an address a previous listing already worked.
     and not exists (
           select 1 from acq_listings mine
             join acq_worked_addresses w on w.address_key = mine.address_key
            where mine.zpid = p.listing_key)
     -- The new gate. A row with no agent_email is still queued: it goes out by
     -- post, and postal mail is not what this list governs.
     and (p.agent_email is null or not is_suppressed(p.agent_email))
   order by p.priority desc, p.decided_at;

-- What the gate is currently stopping, for the pre-flight check.
create or replace view acq_send_queue_blocked as
  select p.listing_key,
         p.agent_email,
         p.priority,
         p.offer_price,
         (select string_agg(s.reason, '; ')
            from acq_suppressions s
           where (s.channel in ('email', 'all') and lower(s.contact) = lower(p.agent_email))
              or (s.channel = 'domain'
                  and lower(s.contact) = lower(split_part(p.agent_email, '@', 2)))
         ) as reason
    from acq_predictions p
    left join acq_sends   s on s.listing_key = p.listing_key
    left join acq_threads t on t.listing_key = p.listing_key
   where p.decision = 'SEND'
     and s.id is null
     and t.listing_key is null
     and p.decided_at > now() - interval '48 hours'
     and p.agent_email is not null
     and is_suppressed(p.agent_email);

comment on view acq_send_queue_blocked is
  'The rows acq_send_queue is withholding and why. Read this before every launch: a queue that suddenly shrinks should be explainable here rather than a mystery.';
