-- Listing inventory, market config, and scrape bookkeeping.
--
-- SCHEMA NOTE: this system lives in the `agent_outreach_elevate` schema of the REI
-- Transfer Supabase project (glaxjfmfhlhwsblwprzo), alongside motivated_seller_elevate
-- and swipe. Files 0001-0004 above are written unqualified and were applied under
-- `set local search_path = agent_outreach_elevate, public`. This file is qualified
-- explicitly because it is the one that gets read most.
--
-- Migrations 0001-0004 model what happens AFTER a listing is chosen: threads, sends,
-- sequences, calibration. Nothing modelled the listings themselves, which leaves three
-- holes that only appear once the sweep runs unattended:
--
--   1. Every run re-scrapes everything. The detail scraper is billed per listing, so a
--      daily sweep pays full price for houses whose record has not moved in a week.
--   2. Nothing knows which houses CROSSED into the 21-89 day window since the last run.
--      That crossing is the actual trigger; "new listing" is not, because a house on
--      day 2 fails our own buy box.
--   3. Double-outreach is only blocked per listing_key. A house that expires and
--      relists three months later arrives with a NEW zpid and reads as a fresh find.
--      The agent receives a second LOI on a house they already declined one for.
--
-- Hole 3 is the expensive one. It is keyed on the address, not the listing.

-- ---------------------------------------------------------------------------
-- Address normalization. Immutable so it can back a generated column.
--
-- Deliberately shallow: Zillow is the only writer today and it is internally
-- consistent, so this only has to survive suffix and directional drift between a
-- listing and its relist ("19TH AVENUE S" vs "19th Ave S"). It is NOT a USPS
-- normalizer. Unit designators are kept, so unit A and unit B of a duplex stay
-- distinct addresses.
-- ---------------------------------------------------------------------------
create or replace function agent_outreach_elevate.acq_norm_street(street text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select coalesce(string_agg(
    case tok
      when 'STREET'    then 'ST'   when 'AVENUE'  then 'AVE'  when 'ROAD'     then 'RD'
      when 'DRIVE'     then 'DR'   when 'LANE'    then 'LN'   when 'COURT'    then 'CT'
      when 'BOULEVARD' then 'BLVD' when 'CIRCLE'  then 'CIR'  when 'PLACE'    then 'PL'
      when 'TERRACE'   then 'TER'  when 'PARKWAY' then 'PKWY' when 'HIGHWAY'  then 'HWY'
      when 'TRAIL'     then 'TRL'  when 'SQUARE'  then 'SQ'
      when 'NORTHEAST' then 'NE'   when 'NORTHWEST' then 'NW'
      when 'SOUTHEAST' then 'SE'   when 'SOUTHWEST' then 'SW'
      when 'NORTH'     then 'N'    when 'SOUTH'   then 'S'
      when 'EAST'      then 'E'    when 'WEST'    then 'W'
      else tok
    end, ' ' order by ord), '')
  from unnest(
    string_to_array(
      trim(regexp_replace(regexp_replace(upper(street), '[^A-Z0-9]+', ' ', 'g'), '\s+', ' ', 'g')),
      ' ')
  ) with ordinality as t(tok, ord);
$$;

create or replace function agent_outreach_elevate.acq_address_key(street text, postal text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select agent_outreach_elevate.acq_norm_street(street)
      || '|'
      || substring(regexp_replace(postal, '[^0-9]', '', 'g') from 1 for 5);
$$;

-- ---------------------------------------------------------------------------
-- The inventory. One row per property we have ever seen, keyed on zpid, which is
-- also acq_threads.listing_key for the Zillow path (see adapters/zillow.ts).
-- ---------------------------------------------------------------------------
create table if not exists agent_outreach_elevate.acq_listings (
  zpid                text        primary key,
  mls_number          text,

  street              text        not null,
  city                text,
  county              text,
  state               text        not null default 'FL',
  postal_code         text,
  -- The anti-double-outreach key. Survives a relist under a new zpid. Null when the
  -- zip is missing, which correctly means "cannot dedupe this one".
  address_key         text generated always as
                        (agent_outreach_elevate.acq_address_key(street, postal_code)) stored,

  property_kind       text,
  living_area         integer,
  year_built          integer,
  beds                numeric(4,1),
  baths               numeric(4,1),

  list_price          integer,
  original_list_price integer,
  status              text,
  days_on_market      integer,
  listed_at           date,

  photo_count         integer,
  -- Cached so the vision pass does not need a second detail scrape.
  photo_urls          text[],

  agent_name          text,
  agent_phone         text,
  agent_license       text,
  agent_email         text,
  brokerage           text,

  condition_score     integer,
  vision_score        integer,
  condition_tier      text,
  vision_done_at      timestamptz,

  -- Set once, the first time we observe it inside the 21-89 day window. This is the
  -- crossing that triggers outreach.
  entered_window_at   timestamptz,
  -- Why it failed the buy box, so a rejected house is not re-underwritten every night.
  excluded_reason     text,

  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  -- Null means search-stage only: we know it exists, we have not paid for the detail.
  last_detail_at      timestamptz,
  -- list_price as of the last detail scrape. A change means the cached record is stale
  -- regardless of how recently we looked.
  last_detail_price   integer
);

create index if not exists acq_listings_address_key_idx
  on agent_outreach_elevate.acq_listings (address_key);
create index if not exists acq_listings_window_idx
  on agent_outreach_elevate.acq_listings (days_on_market)
  where status = 'FOR_SALE' and excluded_reason is null;
create index if not exists acq_listings_entered_idx
  on agent_outreach_elevate.acq_listings (entered_window_at desc)
  where entered_window_at is not null;
create index if not exists acq_listings_agent_idx
  on agent_outreach_elevate.acq_listings (lower(agent_email));

-- ---------------------------------------------------------------------------
-- Markets. The expansion map (St Pete -> Sarasota/Orlando -> Ocala/Gainesville ->
-- Jacksonville/Fort Lauderdale) lives here as data so adding a market is an insert,
-- not a deploy. sweep_every_days exists because a full daily sweep of one metro runs
-- about $2.24 on the Apify STARTER plan's $39 of monthly credit.
-- ---------------------------------------------------------------------------
create table if not exists agent_outreach_elevate.acq_markets (
  slug             text        primary key,
  label            text        not null,
  counties         text[]      not null default '{}',
  -- Zillow map bounds, fed straight into searchQueryState.
  bound_west       numeric(9,5),
  bound_east       numeric(9,5),
  bound_south      numeric(9,5),
  bound_north      numeric(9,5),
  -- Zillow caps results per search, so the sweep is sliced into price bands.
  price_bands      jsonb       not null default '[]'::jsonb,
  phase            integer     not null default 1,
  active           boolean     not null default false,
  sweep_every_days integer     not null default 2,
  last_swept_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- Scrape bookkeeping. Apify bills per run; without this the only record of spend is
-- the Apify console, which nothing downstream can read.
-- ---------------------------------------------------------------------------
create table if not exists agent_outreach_elevate.acq_scrape_runs (
  id           uuid        primary key default gen_random_uuid(),
  apify_run_id text        unique,
  actor_id     text,
  market_slug  text        references agent_outreach_elevate.acq_markets (slug),
  kind         text        not null check (kind in ('search','detail')),
  status       text,
  item_count   integer,
  cost_usd     numeric(10,4),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists acq_scrape_runs_started_idx
  on agent_outreach_elevate.acq_scrape_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Which listings are worth paying the detail scraper for today.
--
-- The whole point of the inventory: a house whose search-stage record has not moved
-- since the last detail scrape does not need re-scraping. Seven days is arbitrary but
-- safe against silent record drift; a price change overrides it.
-- ---------------------------------------------------------------------------
create or replace view agent_outreach_elevate.acq_detail_scrape_due as
  select zpid, street, city, postal_code, list_price, days_on_market, last_detail_at
  from agent_outreach_elevate.acq_listings
  where status = 'FOR_SALE'
    and excluded_reason is null
    and days_on_market between 21 and 89
    and (
      last_detail_at is null
      or last_detail_at < now() - interval '7 days'
      or last_detail_price is distinct from list_price
    )
  order by days_on_market desc;

-- Crossed into the window and never underwritten. This is the daily work list.
create or replace view agent_outreach_elevate.acq_window_entrants as
  select l.*
  from agent_outreach_elevate.acq_listings l
  left join agent_outreach_elevate.acq_predictions p on p.listing_key = l.zpid
  where l.status = 'FOR_SALE'
    and l.excluded_reason is null
    and l.days_on_market between 21 and 89
    and p.listing_key is null
  order by l.entered_window_at desc nulls last;

-- Every address we have ever mailed about, under any listing_key. The relist guard.
create or replace view agent_outreach_elevate.acq_worked_addresses as
  select distinct l.address_key, min(s.sent_at) as first_sent_at
  from agent_outreach_elevate.acq_sends s
  join agent_outreach_elevate.acq_listings l on l.zpid = s.listing_key
  where l.address_key is not null
  group by l.address_key;

-- ---------------------------------------------------------------------------
-- Send queue, now address-aware.
--
-- Everything from 0004 plus: never mail an address that has already received one,
-- even under a different zpid.
--
-- This guard fails OPEN when acq_listings has no row for the prediction: the joins
-- find nothing and the row passes. That is deliberate. Intake writes acq_listings
-- before acq_predictions, so a miss means something upstream broke, and a guard that
-- silently empties the send queue on upstream breakage is worse than one that lets a
-- correctly-underwritten listing through.
-- ---------------------------------------------------------------------------
create or replace view agent_outreach_elevate.acq_send_queue as
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
    p.agent_email
  from agent_outreach_elevate.acq_predictions p
  left join agent_outreach_elevate.acq_sends   s on s.listing_key = p.listing_key
  left join agent_outreach_elevate.acq_threads t on t.listing_key = p.listing_key
  where p.decision = 'SEND'
    and s.id is null
    and t.listing_key is null
    and p.decided_at > now() - interval '48 hours'
    and (
      p.agent_email is null
      or (
        select count(*)
        from agent_outreach_elevate.acq_threads a
        where lower(a.agent_email) = lower(p.agent_email)
          and a.stage <> 'DEAD'
      ) < 2
    )
    and not exists (
      select 1
      from agent_outreach_elevate.acq_listings mine
      join agent_outreach_elevate.acq_worked_addresses w on w.address_key = mine.address_key
      where mine.zpid = p.listing_key
    )
  order by p.priority desc, p.decided_at asc;

alter table agent_outreach_elevate.acq_listings    enable row level security;
alter table agent_outreach_elevate.acq_markets     enable row level security;
alter table agent_outreach_elevate.acq_scrape_runs enable row level security;
