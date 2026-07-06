create table if not exists tyreflow_inbound_leads (
  id bigint generated always as identity primary key,
  phone text not null unique,
  source_number text,
  first_message text,
  latest_message text,
  message_count integer not null default 0,
  messages jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_message_id text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tyreflow_inbound_leads_status_check
    check (status in ('new', 'contacted', 'converted', 'ignored'))
);

create index if not exists tyreflow_inbound_leads_status_idx
  on tyreflow_inbound_leads (status, last_seen_at desc);

create or replace function tyreflow_log_inbound_lead(
  p_phone text,
  p_message text,
  p_source_number text default null,
  p_message_id text default null,
  p_seen_at timestamptz default now()
)
returns tyreflow_inbound_leads
language plpgsql
as $$
declare
  v_row tyreflow_inbound_leads;
  v_msg jsonb;
begin
  v_msg := jsonb_build_object(
    'message', coalesce(p_message, ''),
    'message_id', p_message_id,
    'source_number', p_source_number,
    'seen_at', coalesce(p_seen_at, now())
  );

  insert into tyreflow_inbound_leads (
    phone,
    source_number,
    first_message,
    latest_message,
    message_count,
    messages,
    first_seen_at,
    last_seen_at,
    last_message_id,
    updated_at
  )
  values (
    p_phone,
    p_source_number,
    p_message,
    p_message,
    1,
    jsonb_build_array(v_msg),
    coalesce(p_seen_at, now()),
    coalesce(p_seen_at, now()),
    p_message_id,
    now()
  )
  on conflict (phone) do update
  set source_number = excluded.source_number,
      latest_message = excluded.latest_message,
      message_count = tyreflow_inbound_leads.message_count + 1,
      messages = coalesce(tyreflow_inbound_leads.messages, '[]'::jsonb) || v_msg,
      last_seen_at = excluded.last_seen_at,
      last_message_id = excluded.last_message_id,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

alter table tyreflow_inbound_leads disable row level security;
