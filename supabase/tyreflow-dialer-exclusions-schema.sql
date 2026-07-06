alter table tyreflow_dialer_leads
  add column if not exists excluded_reason text,
  add column if not exists excluded_at timestamptz;

alter table tyreflow_dialer_leads
  drop constraint if exists tyreflow_dialer_leads_status_check;

alter table tyreflow_dialer_leads
  add constraint tyreflow_dialer_leads_status_check
    check (status in ('unassigned', 'assigned', 'called', 'closed', 'excluded'));

update tyreflow_dialer_leads
set status = 'excluded',
    assigned_to = null,
    assigned_name = null,
    assigned_at = null,
    excluded_reason = case
      when coalesce(assigned_group, '') || ' ' || coalesce(all_groups, '') ~* 'tyres?[[:space:]]+anywhere[[:space:]]+live'
        then 'Tyres Anywhere Live group'
      when coalesce(display_name, '') || ' ' || coalesce(saved_name, '') || ' ' || coalesce(public_display_name, '') ~* 'm[[:space:]]*25|logistics'
        then 'M25/admin-style contact'
      when coalesce(display_name, '') || ' ' || coalesce(saved_name, '') || ' ' || coalesce(public_display_name, '') ~* 'tyres'
        then 'Tyres in contact name'
      else 'Dialer exclusion'
    end,
    excluded_at = coalesce(excluded_at, now()),
    updated_at = now()
where status in ('unassigned', 'assigned')
  and (
    coalesce(assigned_group, '') || ' ' || coalesce(all_groups, '') ~* 'tyres?[[:space:]]+anywhere[[:space:]]+live'
    or coalesce(display_name, '') || ' ' || coalesce(saved_name, '') || ' ' || coalesce(public_display_name, '') ~* 'm[[:space:]]*25|logistics|tyres'
  );
