-- TyreFlow: subscriber ownership for dialer-created fitters.
-- Run this in the same Supabase project as tyreflow_subscribers.
--
-- Safe to run multiple times.

alter table tyreflow_subscribers
  add column if not exists created_by_caller_id text;

alter table tyreflow_subscribers
  add column if not exists created_by_caller_name text;

alter table tyreflow_subscribers
  add column if not exists created_from text;

create index if not exists tyreflow_subscribers_created_by_caller_id_idx
  on tyreflow_subscribers (created_by_caller_id);
