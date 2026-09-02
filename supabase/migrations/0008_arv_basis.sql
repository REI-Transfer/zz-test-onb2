-- 0008_arv_basis.sql
--
-- Where ARV comes from, written down.
--
-- The offer engine multiplies a per-ZIP renovated dollar-per-foot rate by the
-- house's living area. That rate has been living in /tmp/arv_psf.json, which
-- means the single most consequential number in the offer -- it moves the offer
-- roughly dollar for dollar -- has no history, no provenance, and disappears
-- when the machine is rebooted. When an agent argues with a number, the first
-- question is what it was based on and when. That has to be answerable.
--
-- The rate is also, right now, derived from ASKING prices of renovated listings
-- rather than sold comps. That is a real weakness and it is recorded per row in
-- `basis` rather than left in a comment, because the day DealMachine comps get
-- wired the two kinds of row have to be distinguishable at a glance.

set search_path = agent_outreach_elevate, public;

create table if not exists acq_arv_psf (
  postal_code   text not null,
  -- 'asking' = renovated list prices in the ZIP. 'sold' = closed comps.
  -- An offer built on 'asking' is directional and the letter says so.
  basis         text not null check (basis in ('asking', 'sold')),
  psf           numeric(10, 2) not null check (psf > 0),
  sample_size   integer not null check (sample_size >= 0),
  computed_at   timestamptz not null default now(),
  note          text,
  primary key (postal_code, basis, computed_at)
);

comment on table acq_arv_psf is
  'Renovated price per heated square foot by ZIP. Append-only: a new computation adds a row rather than overwriting, so an offer made last month can still be explained.';

create index if not exists acq_arv_psf_lookup
  on acq_arv_psf (postal_code, basis, computed_at desc);

-- The rate the offer engine should use for a ZIP today: newest first, and sold
-- comps beat asking prices whenever both exist for the same ZIP.
create or replace view acq_arv_psf_current as
  select distinct on (postal_code)
         postal_code, basis, psf, sample_size, computed_at, note
    from acq_arv_psf
   order by postal_code,
            case basis when 'sold' then 0 else 1 end,
            computed_at desc;

comment on view acq_arv_psf_current is
  'One rate per ZIP. Sold comps outrank asking prices; within a basis, newest wins.';
