-- 0011_wholesalers.sql
--
-- The direct-to-wholesaler side of the acquisition system.
--
-- Different animal from the agent campaign and it needs its own tables rather
-- than a `kind` column on the existing ones. An agent is identified by a state
-- licence, sits on a listing, and is reachable at a verified work address. A
-- wholesaler is identified by a Facebook profile, sits on a deal that exists for
-- days, and is mostly reachable only by direct message. Forcing both through one
-- schema would mean half the columns are null for half the rows and the joins
-- stop meaning anything.
--
-- ONE THING THAT SHAPED THIS
--
-- Nobody in this market calls themselves a wholesaler. They all position as cash
-- buyers. So there is no job title to filter on and identity has to come from
-- deal language -- assignment, EMD, ARV, under contract -- which is why the unit
-- of evidence here is a POST rather than a profile. A person with nine posts is
-- a different prospect from a person with one, and that count is the only
-- volume signal available without paying for skip tracing.

set search_path = agent_outreach_elevate, public;

create table if not exists acq_wholesalers (
  -- The numeric id out of the profile URL. Display names change, get emoji added,
  -- and repeat across people; the id does not.
  fb_id            text primary key,
  display_name     text not null,
  fb_profile_url   text,
  phone            text,
  email            text,
  -- How we came to hold the phone or email: 'post' when they published it in the
  -- deal itself, 'skiptrace' when it was bought. Worth separating, because a
  -- number the person put in a public post carries a very different consent story
  -- from one a data broker sold us.
  contact_source   text check (contact_source in ('post', 'skiptrace', 'manual')),
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  -- Set when the client-roster gate matches. Kept on the row rather than
  -- filtered at read time so that a person who joins the roster later stays
  -- blocked without anyone having to remember to re-run the check.
  suppressed_at    timestamptz,
  suppressed_reason text,
  notes            text
);

comment on table acq_wholesalers is
  'People posting assignable deals in public investor groups. Keyed on Facebook id because that is the only identifier that survives a display-name change.';

create table if not exists acq_wholesaler_deals (
  post_id       text primary key,
  fb_id         text not null references acq_wholesalers (fb_id) on delete cascade,
  posted_at     timestamptz,
  group_name    text,
  post_url      text,
  street        text,
  city          text,
  state         text,
  -- The first figure in one of these posts is usually the earnest money, not the
  -- deal. Anything under fifty thousand is almost certainly EMD and the extractor
  -- skips it; this column holds what survived that filter.
  price         integer,
  post_text     text,
  scraped_at    timestamptz not null default now()
);

comment on column acq_wholesaler_deals.price is
  'Asking or assignment price, whole dollars. Extracted as the first figure at or above $50,000: the first number in a wholesale post is usually the earnest money deposit.';

create index if not exists acq_wholesaler_deals_by_person
  on acq_wholesaler_deals (fb_id, posted_at desc);

create index if not exists acq_wholesaler_deals_recent
  on acq_wholesaler_deals (posted_at desc);

-- Who is worth contacting, and how. Volume is the only quality signal available
-- before anyone picks up the phone, so it leads.
create or replace view acq_wholesaler_targets as
  select w.fb_id,
         w.display_name,
         w.fb_profile_url,
         w.phone,
         w.email,
         w.contact_source,
         count(d.post_id)                        as deals,
         max(d.posted_at)                        as last_deal_at,
         min(d.posted_at)                        as first_deal_at,
         count(distinct d.city)                  as cities,
         (w.phone is not null or w.email is not null) as reachable_directly
    from acq_wholesalers w
    left join acq_wholesaler_deals d on d.fb_id = w.fb_id
   where w.suppressed_at is null
   group by w.fb_id, w.display_name, w.fb_profile_url, w.phone, w.email, w.contact_source
   order by count(d.post_id) desc, max(d.posted_at) desc;

comment on view acq_wholesaler_targets is
  'Contactable wholesalers ranked by how many deals they have posted. Client-roster matches are excluded here rather than at read time, so nobody has to remember the gate.';
