alter table tyreflow_dialer_leads
  add column if not exists excluded_reason text,
  add column if not exists excluded_at timestamptz;

alter table tyreflow_dialer_leads
  drop constraint if exists tyreflow_dialer_leads_status_check;

alter table tyreflow_dialer_leads
  add constraint tyreflow_dialer_leads_status_check
    check (status in ('unassigned', 'assigned', 'called', 'closed', 'excluded'));

update tyreflow_dialer_leads leads
set status = 'excluded',
    assigned_to = null,
    assigned_name = null,
    assigned_at = null,
    excluded_reason = case
      when regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g') in ('447354247247', '447476190546')
        then 'Dialer hard-filter number'
      when exists (
        select 1
        from tyreflow_subscribers subscribers
        where regexp_replace(coalesce(subscribers.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g')
      )
        then 'Existing TyreFlow subscriber'
      else 'Dialer phone hard filter'
    end,
    excluded_at = coalesce(excluded_at, now()),
    updated_at = now()
where status in ('unassigned', 'assigned')
  and (
    regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g') in ('447354247247', '447476190546')
    or exists (
      select 1
      from tyreflow_subscribers subscribers
      where regexp_replace(coalesce(subscribers.phone, ''), '[^0-9]', '', 'g')
        = regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g')
    )
  );

create or replace function tyreflow_claim_dialer_leads(
  p_caller_id text,
  p_caller_name text,
  p_limit integer default 25
)
returns setof tyreflow_dialer_leads
language plpgsql
as $$
begin
  return query
  with picked as (
    select leads.id
    from tyreflow_dialer_leads leads
    where leads.status = 'unassigned'
      and leads.assigned_to is null
      and regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g') not in ('447354247247', '447476190546')
      and not exists (
        select 1
        from tyreflow_subscribers subscribers
        where regexp_replace(coalesce(subscribers.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g')
      )
    order by leads.is_business desc, leads.groups_count desc, leads.id asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update tyreflow_dialer_leads leads
  set assigned_to = p_caller_id,
      assigned_name = p_caller_name,
      assigned_at = now(),
      status = 'assigned',
      updated_at = now()
  from picked
  where leads.id = picked.id
  returning leads.*;
end;
$$;
