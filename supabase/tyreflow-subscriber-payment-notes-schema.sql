-- TyreFlow V3: subscriber payment state and admin notes.
-- Run this in the same Supabase project as tyreflow_subscribers.
--
-- Safe to run multiple times.

alter table tyreflow_subscribers
  add column if not exists paid_status text not null default 'trial';

alter table tyreflow_subscribers
  add column if not exists notes text not null default 'Agreed £50';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tyreflow_subscribers_paid_status_check'
  ) then
    alter table tyreflow_subscribers
      add constraint tyreflow_subscribers_paid_status_check
      check (paid_status in ('paid', 'trial'));
  end if;
end $$;
