create table if not exists public.workflow_collaboration_requests (
  id text primary key,
  approval_request_no text not null,
  contributor_email text not null,
  contributor_name text not null default '',
  requested_by_email text not null,
  status text not null,
  due_at text,
  blocks_approval boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_shared_fulfillments (
  id text primary key,
  approval_request_no text not null,
  requirement_node_id text not null,
  document_id text not null,
  document_type text not null,
  assigned_submitter_email text not null,
  uploader_email text not null,
  attachment_id text not null,
  status text not null,
  required boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_correction_requests (
  id text primary key,
  approval_request_no text not null,
  shared_fulfillment_id text not null,
  requested_by_email text not null,
  assigned_submitter_email text not null,
  uploader_email text not null,
  status text not null,
  blocks_approval boolean not null default true,
  rejection_note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_notification_events (
  id text primary key,
  approval_request_no text not null,
  recipient_email text not null,
  title text not null,
  body text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_collaboration_requests_request_idx
on public.workflow_collaboration_requests(approval_request_no);

create index if not exists workflow_shared_fulfillments_request_idx
on public.workflow_shared_fulfillments(approval_request_no);

create index if not exists workflow_correction_requests_request_idx
on public.workflow_correction_requests(approval_request_no);

create index if not exists workflow_notification_events_request_idx
on public.workflow_notification_events(approval_request_no);

alter table public.workflow_collaboration_requests enable row level security;
alter table public.workflow_shared_fulfillments enable row level security;
alter table public.workflow_correction_requests enable row level security;
alter table public.workflow_notification_events enable row level security;

grant select, insert, update on public.workflow_collaboration_requests to authenticated;
grant select, insert, update on public.workflow_shared_fulfillments to authenticated;
grant select, insert, update on public.workflow_correction_requests to authenticated;
grant select, insert, update on public.workflow_notification_events to authenticated;

drop policy if exists "participants read collaboration requests"
on public.workflow_collaboration_requests;
create policy "participants read collaboration requests"
on public.workflow_collaboration_requests for select
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_collaboration_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants write collaboration requests"
on public.workflow_collaboration_requests;
create policy "participants write collaboration requests"
on public.workflow_collaboration_requests for insert
to authenticated
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_collaboration_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants update collaboration requests"
on public.workflow_collaboration_requests;
create policy "participants update collaboration requests"
on public.workflow_collaboration_requests for update
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_collaboration_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
))
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_collaboration_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants read shared fulfillments"
on public.workflow_shared_fulfillments;
create policy "participants read shared fulfillments"
on public.workflow_shared_fulfillments for select
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_shared_fulfillments.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants write shared fulfillments"
on public.workflow_shared_fulfillments;
create policy "participants write shared fulfillments"
on public.workflow_shared_fulfillments for insert
to authenticated
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_shared_fulfillments.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants update shared fulfillments"
on public.workflow_shared_fulfillments;
create policy "participants update shared fulfillments"
on public.workflow_shared_fulfillments for update
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_shared_fulfillments.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
))
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_shared_fulfillments.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants read correction requests"
on public.workflow_correction_requests;
create policy "participants read correction requests"
on public.workflow_correction_requests for select
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_correction_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants write correction requests"
on public.workflow_correction_requests;
create policy "participants write correction requests"
on public.workflow_correction_requests for insert
to authenticated
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_correction_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants update correction requests"
on public.workflow_correction_requests;
create policy "participants update correction requests"
on public.workflow_correction_requests for update
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_correction_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
))
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_correction_requests.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants read notification events"
on public.workflow_notification_events;
create policy "participants read notification events"
on public.workflow_notification_events for select
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_notification_events.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.email = workflow_notification_events.recipient_email
    or p.is_admin
  )
));

drop policy if exists "participants write notification events"
on public.workflow_notification_events;
create policy "participants write notification events"
on public.workflow_notification_events for insert
to authenticated
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_notification_events.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));

drop policy if exists "participants update notification events"
on public.workflow_notification_events;
create policy "participants update notification events"
on public.workflow_notification_events for update
to authenticated
using (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_notification_events.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
))
with check (exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = workflow_notification_events.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
));
