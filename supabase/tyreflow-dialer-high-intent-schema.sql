-- Mark safe Tyres Anywhere / multi-group leads as high-intent by making them
-- claimable again and ordering the claim RPC toward those leads first.
--
-- This does not restore hard-blocked phones, existing subscribers, National
-- Mobile Tyres 24HR, breakdown/recovery/roadside contacts, M25/logistics, or
-- contacts whose names look like tyre operators.

update tyreflow_dialer_leads leads
set status = 'unassigned',
    assigned_to = null,
    assigned_name = null,
    assigned_at = null,
    excluded_reason = null,
    excluded_at = null,
    updated_at = now()
where leads.status = 'excluded'
  and leads.excluded_reason = 'Tyres Anywhere Live group'
  and concat_ws(' ', leads.assigned_group, leads.all_groups)
    ~* 'tyres?[[:space:]]+anywhere'
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
  and concat_ws(' ', leads.display_name, leads.saved_name, leads.public_display_name)
    !~* '(m[[:space:]]*25|logistics|tyres)'
  and not exists (
    select 1
    from tyreflow_subscribers subscribers
    where regexp_replace(coalesce(subscribers.phone, ''), '[^0-9]', '', 'g')
      = regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g')
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
    order by
      case
        when concat_ws(' ', leads.assigned_group, leads.all_groups)
          ~* 'tyres?[[:space:]]+anywhere' then 0
        when coalesce(leads.groups_count, 0) >= 2 then 1
        else 2
      end,
      leads.groups_count desc,
      leads.is_business desc,
      leads.id asc
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
