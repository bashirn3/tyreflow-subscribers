-- Restrict high-intent dialer lead claiming to Umer.
-- Umer's dialer queue keeps the internal caller id `saleh` for historical
-- compatibility; subscriber ownership is handled separately in the app.

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
      and (
        p_caller_id = 'saleh'
        or (
          concat_ws(' ', leads.assigned_group, leads.all_groups)
            !~* 'tyres?[[:space:]]+anywhere'
          and coalesce(leads.groups_count, 0) < 2
        )
      )
      and not exists (
        select 1
        from tyreflow_subscribers subscribers
        where regexp_replace(coalesce(subscribers.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(leads.phone, ''), '[^0-9]', '', 'g')
      )
    order by
      case when leads.last_outcome = 'no_answer' then 1 else 0 end,
      case
        when p_caller_id = 'saleh'
          and concat_ws(' ', leads.assigned_group, leads.all_groups)
            ~* 'tyres?[[:space:]]+anywhere' then 0
        when p_caller_id = 'saleh'
          and coalesce(leads.groups_count, 0) >= 2 then 1
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
