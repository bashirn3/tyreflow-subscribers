-- TyreFlow V2: multiple coverage areas per subscriber.
-- Run this in the same Supabase SQL editor as tyreflow_subscribers.
--
-- This does not modify existing subscriber rows. Existing postcode/miles columns
-- remain as the fallback path until every subscriber has explicit coverage rows.

create table if not exists tyreflow_subscriber_coverages (
  id bigint generated always as identity primary key,
  subscriber_id bigint not null references tyreflow_subscribers(id) on delete cascade,
  coverage_type text not null check (coverage_type in ('radius', 'prefix')),
  code text not null,                    -- e.g. 'E14 9GG', 'LA', 'L1'
  label text,                            -- e.g. 'Lancaster', 'Liverpool'
  postcode text,                         -- geocoded postcode/outcode for radius coverages
  miles numeric,                         -- required for radius, optional/null for prefix
  lat double precision,
  lon double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subscriber_id, coverage_type, code)
);

create index if not exists tyreflow_subscriber_coverages_subscriber_idx
  on tyreflow_subscriber_coverages (subscriber_id);

create index if not exists tyreflow_subscriber_coverages_active_idx
  on tyreflow_subscriber_coverages (active, coverage_type, code);

alter table tyreflow_subscriber_coverages disable row level security;

-- Optional later backfill, intentionally not run automatically:
-- insert into tyreflow_subscriber_coverages
--   (subscriber_id, coverage_type, code, label, postcode, miles, lat, lon, active)
-- select id, 'radius', postcode, null, postcode, miles, lat, lon, active
-- from tyreflow_subscribers
-- where postcode is not null
-- on conflict (subscriber_id, coverage_type, code) do nothing;
