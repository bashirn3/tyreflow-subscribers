-- Exclude tyre/recovery operators from the TyreFlow dialer queues.
-- This keeps the records for audit/history, but prevents callers from seeing or claiming them.

update tyreflow_dialer_leads leads
set status = 'excluded',
    assigned_to = null,
    assigned_name = null,
    assigned_at = null,
    excluded_reason = case
      when concat_ws(' ', leads.assigned_group, leads.all_groups)
        ~* 'national[[:space:]]+mobile[[:space:]]+tyres[[:space:]]*24[[:space:]]*hr'
        then 'National Mobile Tyres 24HR group'
      else 'Breakdown/recovery contact'
    end,
    excluded_at = now(),
    updated_at = now()
where concat_ws(' ', leads.assigned_group, leads.all_groups)
        ~* 'national[[:space:]]+mobile[[:space:]]+tyres[[:space:]]*24[[:space:]]*hr'
   or concat_ws(
        ' ',
        leads.display_name,
        leads.saved_name,
        leads.public_display_name,
        leads.assigned_group,
        leads.all_groups
      ) ~* '(break[[:space:]]*down|breakdown|recovery|road[[:space:]]*side[[:space:]]+assistance|roadside[[:space:]]+assistance)';

update tyreflow_dialer_tasks tasks
set status = 'done',
    completed_at = now()
where tasks.status = 'open'
  and exists (
    select 1
    from tyreflow_dialer_leads leads
    where leads.id = tasks.lead_id
      and (
        concat_ws(' ', leads.assigned_group, leads.all_groups)
          ~* 'national[[:space:]]+mobile[[:space:]]+tyres[[:space:]]*24[[:space:]]*hr'
        or concat_ws(
          ' ',
          leads.display_name,
          leads.saved_name,
          leads.public_display_name,
          leads.assigned_group,
          leads.all_groups
        ) ~* '(break[[:space:]]*down|breakdown|recovery|road[[:space:]]*side[[:space:]]+assistance|roadside[[:space:]]+assistance)'
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
      and concat_ws(' ', leads.assigned_group, leads.all_groups)
        !~* 'national[[:space:]]+mobile[[:space:]]+tyres[[:space:]]*24[[:space:]]*hr'
      and concat_ws(
        ' ',
        leads.display_name,
        leads.saved_name,
        leads.public_display_name,
        leads.assigned_group,
        leads.all_groups
      ) !~* '(break[[:space:]]*down|breakdown|recovery|road[[:space:]]*side[[:space:]]+assistance|roadside[[:space:]]+assistance)'
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
