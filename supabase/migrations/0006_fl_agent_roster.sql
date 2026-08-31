-- Florida real estate licensee roster.
--
-- Source: Florida DBPR public records extract, REALESTATE2501LICENSE_1.csv, published
-- free and refreshed weekly at
--   https://www2.myfloridalicense.com/sto/file_download/extracts/
-- Loader: scripts/load-fl-agents.py (idempotent, safe to cron weekly).
--
-- Why this table exists: Zillow gives us the listing agent's name, direct phone,
-- brokerage and FL license number, but never an email. The license number is the join
-- key, and it holds -- 280 of the 283 licensed agents on the first St Pete sweep matched
-- (98.3%). What DBPR adds that Zillow does not have:
--
--   * legal name, so "Pat Haugabook" and "Patrick Haugabook" are one person
--   * license STATUS, so a lapsed agent is never mailed
--   * the employing brokerage AND its license number, which is the input to email
--     domain discovery -- the practical route to the address we are missing
--
-- DBPR does NOT publish licensee email addresses. The email columns here are ours to
-- fill and are deliberately kept separate from the DBPR columns, and the loader's
-- ON CONFLICT DO UPDATE never lists them, so a weekly reload refreshes the state's
-- data without destroying addresses we paid to discover and verify.

create table if not exists agent_outreach_elevate.acq_agents (
  -- Bare number as DBPR prints it. 7 digits for most sales associates, 6 for older
  -- brokers. Kept as text: leading zeros exist and it is an identifier, not a quantity.
  license_number     text        primary key,
  license_prefixed   text,
  profession         text,

  -- DBPR prints "LAST, FIRST MIDDLE". Split on first comma; the remainder is kept whole
  -- because middle names, suffixes and "LLC" all appear in the second half.
  full_name          text        not null,
  last_name          text,
  first_name         text,

  license_type       text,
  status_primary     text,
  status_secondary   text,

  address1           text,
  address2           text,
  address3           text,
  city               text,
  state              text,
  zip                text,
  county             text,

  original_license_date date,
  status_date           date,
  expiration_date       date,

  employer_name      text,
  employer_license   text,

  -- ---- ours, not DBPR's ----
  email              text,
  email_source       text,
  email_confidence   text,
  email_verified_at  timestamptz,
  email_status       text,

  dbpr_loaded_at     timestamptz not null default now()
);

create index if not exists acq_agents_name_idx     on agent_outreach_elevate.acq_agents (last_name, first_name);
create index if not exists acq_agents_employer_idx on agent_outreach_elevate.acq_agents (employer_license);
create index if not exists acq_agents_county_idx   on agent_outreach_elevate.acq_agents (county);
create index if not exists acq_agents_email_idx    on agent_outreach_elevate.acq_agents (lower(email))
  where email is not null;
create index if not exists acq_agents_active_idx   on agent_outreach_elevate.acq_agents (status_secondary)
  where status_secondary = 'Active';

alter table agent_outreach_elevate.acq_agents enable row level security;

-- Every agent currently holding a listing we care about, DBPR record attached.
-- left join on purpose: an unmatched agent is still a real person with a real phone
-- number, and dropping them here would hide them from the roster entirely.
create or replace view agent_outreach_elevate.acq_listing_agents as
  select
    l.agent_license,
    coalesce(a.full_name, l.agent_name)              as name,
    l.agent_name                                     as name_on_listing,
    a.license_type,
    a.status_secondary                               as license_status,
    coalesce(a.employer_name, l.brokerage)           as brokerage,
    a.employer_license,
    a.city, a.county,
    l.agent_phone,
    coalesce(a.email, l.agent_email)                 as email,
    a.email_status,
    count(*)                                         as live_listings,
    min(l.days_on_market)                            as freshest_dom,
    max(l.days_on_market)                            as stalest_dom
  from agent_outreach_elevate.acq_listings l
  left join agent_outreach_elevate.acq_agents a on a.license_number = l.agent_license
  where l.excluded_reason is null
  group by l.agent_license, a.full_name, l.agent_name, a.license_type, a.status_secondary,
           a.employer_name, l.brokerage, a.employer_license, a.city, a.county,
           l.agent_phone, a.email, l.agent_email, a.email_status
  order by count(*) desc, name;

-- Brokerages ranked by how much of our target inventory they hold. This is the work
-- order for email-domain discovery: one domain pattern unlocks every agent under it,
-- so the top of this list is worth more per unit of effort than the bottom.
--
-- On the first St Pete sweep this came back far flatter than expected: 140 brokerages
-- across 281 listings, 99 of them holding exactly one. The top 18 cover only 48%, so
-- domain-pattern discovery is a head strategy, not a whole strategy.
create or replace view agent_outreach_elevate.acq_target_brokerages as
  select
    coalesce(a.employer_name, l.brokerage)  as brokerage,
    a.employer_license,
    count(*)                                as live_listings,
    count(distinct l.agent_license)         as agents,
    count(*) filter (where a.email is not null) as agents_with_email
  from agent_outreach_elevate.acq_listings l
  left join agent_outreach_elevate.acq_agents a on a.license_number = l.agent_license
  where l.excluded_reason is null
  group by 1, 2
  order by count(*) desc;
