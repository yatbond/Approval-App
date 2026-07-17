create table if not exists public.workflow_operation_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  operation_type text not null
    check (operation_type in (
      'autosave',
      'extraction',
      'notification',
      'form_intake',
      'collaboration',
      'routing'
    )),
  outcome text not null
    check (outcome in ('succeeded', 'failed', 'skipped')),
  request_no text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  message text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workflow_operation_events_owner_created_idx
on public.workflow_operation_events (owner_user_id, created_at desc);

create index if not exists workflow_operation_events_health_idx
on public.workflow_operation_events (operation_type, outcome, created_at desc);

alter table public.workflow_operation_events enable row level security;

revoke all on public.workflow_operation_events from anon, authenticated;
grant select, insert on public.workflow_operation_events to authenticated;
grant select, insert on public.workflow_operation_events to service_role;

drop policy if exists "users read own operation events"
on public.workflow_operation_events;
create policy "users read own operation events"
on public.workflow_operation_events for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin
  )
);

drop policy if exists "users record own operation events"
on public.workflow_operation_events;
create policy "users record own operation events"
on public.workflow_operation_events for insert
to authenticated
with check (owner_user_id = (select auth.uid()));
