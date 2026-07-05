create table if not exists tyreflow_dialer_leads (
  id bigint generated always as identity primary key,
  phone text not null unique,
  display_name text not null,
  public_display_name text,
  saved_name text,
  country_code text,
  country text,
  assigned_group text,
  groups_count integer not null default 0,
  all_groups text,
  is_my_contact boolean not null default false,
  is_business boolean not null default false,
  status text not null default 'unassigned',
  assigned_to text,
  assigned_name text,
  assigned_at timestamptz,
  last_outcome text,
  last_note text,
  last_called_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tyreflow_dialer_leads_status_check
    check (status in ('unassigned', 'assigned', 'called', 'closed'))
);

create index if not exists tyreflow_dialer_leads_assigned_to_idx
  on tyreflow_dialer_leads (assigned_to, status);

create index if not exists tyreflow_dialer_leads_status_idx
  on tyreflow_dialer_leads (status, id);

create table if not exists tyreflow_dialer_call_events (
  id bigint generated always as identity primary key,
  lead_id bigint not null references tyreflow_dialer_leads(id) on delete cascade,
  caller_id text not null,
  caller_name text not null,
  outcome text not null,
  notes text,
  call_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tyreflow_dialer_call_events_outcome_check
    check (outcome in (
      'not_interested',
      'no_answer',
      'callback',
      'send_whatsapp',
      'send_voice_note',
      'closed'
    ))
);

create index if not exists tyreflow_dialer_call_events_lead_idx
  on tyreflow_dialer_call_events (lead_id, created_at desc);

create index if not exists tyreflow_dialer_call_events_caller_idx
  on tyreflow_dialer_call_events (caller_id, created_at desc);

create table if not exists tyreflow_dialer_tasks (
  id bigint generated always as identity primary key,
  lead_id bigint not null references tyreflow_dialer_leads(id) on delete cascade,
  caller_id text not null,
  caller_name text not null,
  task_type text not null,
  due_at timestamptz,
  notes text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tyreflow_dialer_tasks_type_check
    check (task_type in ('callback', 'send_whatsapp', 'send_voice_note')),
  constraint tyreflow_dialer_tasks_status_check
    check (status in ('open', 'done'))
);

create index if not exists tyreflow_dialer_tasks_caller_idx
  on tyreflow_dialer_tasks (caller_id, status, due_at);

create index if not exists tyreflow_dialer_tasks_lead_idx
  on tyreflow_dialer_tasks (lead_id, status);

create table if not exists tyreflow_dialer_recordings (
  id text primary key,
  lead_id bigint not null references tyreflow_dialer_leads(id) on delete cascade,
  caller_id text not null,
  caller_name text not null,
  outcome text,
  storage_bucket text not null default 'tyreflow-dialer-recordings',
  storage_path text not null,
  mime_type text,
  ext text,
  duration_ms integer,
  size integer,
  created_at timestamptz not null default now()
);

create index if not exists tyreflow_dialer_recordings_lead_idx
  on tyreflow_dialer_recordings (lead_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('tyreflow-dialer-recordings', 'tyreflow-dialer-recordings', false)
on conflict (id) do nothing;

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
    select id
    from tyreflow_dialer_leads
    where status = 'unassigned'
      and assigned_to is null
    order by is_business desc, groups_count desc, id asc
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

alter table tyreflow_dialer_leads disable row level security;
alter table tyreflow_dialer_call_events disable row level security;
alter table tyreflow_dialer_tasks disable row level security;
alter table tyreflow_dialer_recordings disable row level security;
