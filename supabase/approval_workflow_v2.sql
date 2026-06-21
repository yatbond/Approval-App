create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('approval-documents', 'approval-documents', false)
on conflict (id) do nothing;

create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_departments (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, name)
);

create table if not exists public.workflow_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version_number integer not null default 1,
  name text not null,
  business_unit_id uuid references public.business_units(id),
  department_id uuid references public.business_departments(id),
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  document_requirements jsonb not null default '[]'::jsonb,
  supported_languages text[] not null default array['en', 'zh-Hant', 'zh-Hans'],
  template_snapshot jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, version_number)
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  workflow_template_version_id uuid not null references public.workflow_template_versions(id),
  requester_id uuid references public.profiles(id),
  requester_name text not null default '',
  requester_email text not null default '',
  title text not null,
  workflow_name text not null default '',
  department_name text not null default '',
  status text not null default 'pending',
  due_label text not null default '',
  current_node_id text,
  current_owner_email text,
  current_step text not null default '',
  value_label text not null default '',
  last_action text not null default '',
  completed_node_ids text[] not null default '{}',
  notified_node_ids text[] not null default '{}',
  active_branch_id text,
  extracted_fields jsonb not null default '{}'::jsonb,
  participants text[] not null default '{}',
  task_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_request_events (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  event_key text not null default '',
  action text not null,
  actor_name text not null default '',
  actor_id uuid references public.profiles(id),
  actor_email text not null,
  detail text not null,
  target_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_request_attachments (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  attachment_key text not null default '',
  file_name text not null,
  storage_path text,
  document_id text,
  document_type text not null,
  document_format text not null,
  workflow_node_id text,
  uploaded_by uuid references public.profiles(id),
  uploaded_by_email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null unique,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approval_requests
  add column if not exists due_at timestamptz,
  add column if not exists pending_node_ids text[] not null default '{}',
  add column if not exists pending_owner_emails text[] not null default '{}',
  add column if not exists node_decisions jsonb not null default '{}'::jsonb,
  add column if not exists escalated_at timestamptz,
  add column if not exists requester_name text not null default '',
  add column if not exists requester_email text not null default '',
  add column if not exists workflow_name text not null default '',
  add column if not exists department_name text not null default '',
  add column if not exists due_label text not null default '',
  add column if not exists current_step text not null default '',
  add column if not exists value_label text not null default '',
  add column if not exists last_action text not null default '',
  add column if not exists task_snapshot jsonb not null default '{}'::jsonb;

alter table public.workflow_template_versions
  add column if not exists version_number integer not null default 1,
  add column if not exists template_snapshot jsonb not null default '{}'::jsonb;

alter table public.approval_request_events
  add column if not exists event_key text not null default '',
  add column if not exists actor_name text not null default '';

alter table public.approval_request_attachments
  add column if not exists attachment_key text not null default '';

alter table public.business_units enable row level security;
alter table public.business_departments enable row level security;
alter table public.workflow_template_versions enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_request_events enable row level security;
alter table public.approval_request_attachments enable row level security;
alter table public.workspace_snapshots enable row level security;
alter table public.profiles enable row level security;

create policy "authenticated read active user directory"
on public.profiles for select
to authenticated
using (is_active);

create policy "authenticated read active business units"
on public.business_units for select
to authenticated
using (is_active);

create policy "admins create business units"
on public.business_units for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins update business units"
on public.business_units for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "authenticated read active business departments"
on public.business_departments for select
to authenticated
using (is_active);

create policy "admins create business departments"
on public.business_departments for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins update business departments"
on public.business_departments for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "authenticated read active workflow templates"
on public.workflow_template_versions for select
to authenticated
using (is_active);

create policy "admins create workflow template versions"
on public.workflow_template_versions for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admins update workflow template versions"
on public.workflow_template_versions for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "participants read approval requests"
on public.approval_requests for select
to authenticated
using (
  requester_id = (select auth.uid())
  or current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
  or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(participants)
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
);

create policy "users create own approval requests"
on public.approval_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
);

create policy "current owner or requester update approval requests"
on public.approval_requests for update
to authenticated
using (
  requester_id = (select auth.uid())
  or current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
)
with check (
  requester_id = (select auth.uid())
  or current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
);

create policy "participants read approval request events"
on public.approval_request_events for select
to authenticated
using (
  exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_events.approval_request_id
    and (
      r.requester_id = (select auth.uid())
      or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
      or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    )
  )
);

create policy "current owner or requester create approval request events"
on public.approval_request_events for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or
  exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_events.approval_request_id
    and (
      r.requester_id = (select auth.uid())
      or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    )
  )
);

create policy "current owner or requester update approval request events"
on public.approval_request_events for update
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_events.approval_request_id
    and (
      r.requester_id = (select auth.uid())
      or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    )
  )
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_events.approval_request_id
    and (
      r.requester_id = (select auth.uid())
      or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    )
  )
);

create policy "participants read approval request attachments"
on public.approval_request_attachments for select
to authenticated
using (
  exists (
    select 1
    from public.approval_requests r
    where r.id = approval_request_attachments.approval_request_id
    and (
      r.requester_id = (select auth.uid())
      or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
      or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
      or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
    )
  )
);

create policy "participants create approval request attachments"
on public.approval_request_attachments for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.approval_requests r
      where r.id = approval_request_attachments.approval_request_id
      and (
        r.requester_id = (select auth.uid())
        or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
        or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
      )
    )
  )
);

create policy "participants update approval request attachments"
on public.approval_request_attachments for update
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.approval_requests r
      where r.id = approval_request_attachments.approval_request_id
      and (
        r.requester_id = (select auth.uid())
        or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
        or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
      )
    )
  )
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
  or (
    uploaded_by = (select auth.uid())
    and exists (
      select 1
      from public.approval_requests r
      where r.id = approval_request_attachments.approval_request_id
      and (
        r.requester_id = (select auth.uid())
        or r.current_owner_email = (select p.email from public.profiles p where p.id = (select auth.uid()))
        or (select p.email from public.profiles p where p.id = (select auth.uid())) = any(r.participants)
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
      )
    )
  )
);

create policy "users read own workspace snapshot"
on public.workspace_snapshots for select
to authenticated
using (owner_user_id = (select auth.uid()) or owner_email = (select auth.email()));

create policy "users create own workspace snapshot"
on public.workspace_snapshots for insert
to authenticated
with check (owner_user_id = (select auth.uid()) and owner_email = (select auth.email()));

create policy "users update own workspace snapshot"
on public.workspace_snapshots for update
to authenticated
using (owner_user_id = (select auth.uid()) or owner_email = (select auth.email()))
with check (owner_user_id = (select auth.uid()) and owner_email = (select auth.email()));

drop policy if exists "approval document owners upload" on storage.objects;
create policy "approval document owners upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'approval-documents'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "approval document owners read" on storage.objects;
create policy "approval document owners read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'approval-documents'
  and owner_id = (select auth.uid()::text)
);

drop policy if exists "approval document owners update" on storage.objects;
create policy "approval document owners update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'approval-documents'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'approval-documents'
  and owner_id = (select auth.uid()::text)
);

revoke all privileges on table
  public.business_units,
  public.business_departments,
  public.profiles,
  public.workflow_template_versions,
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_attachments,
  public.workspace_snapshots
from anon, authenticated;

grant select, insert, update on public.business_units to authenticated;
grant select, insert, update on public.business_departments to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.workflow_template_versions to authenticated;
grant select, insert, update on public.approval_requests to authenticated;
grant select, insert, update on public.approval_request_events to authenticated;
grant select, insert, update on public.approval_request_attachments to authenticated;
grant select, insert, update on public.workspace_snapshots to authenticated;

create unique index if not exists workflow_template_versions_template_key_version_idx
on public.workflow_template_versions(template_key, version_number);

create unique index if not exists approval_request_events_request_event_key_idx
on public.approval_request_events(approval_request_id, event_key);

create unique index if not exists approval_request_attachments_request_attachment_key_idx
on public.approval_request_attachments(approval_request_id, attachment_key);

create index if not exists approval_request_attachments_request_id_idx
on public.approval_request_attachments(approval_request_id);

create index if not exists approval_request_attachments_uploaded_by_idx
on public.approval_request_attachments(uploaded_by);

create index if not exists approval_request_events_request_id_idx
on public.approval_request_events(approval_request_id);

create index if not exists approval_request_events_actor_id_idx
on public.approval_request_events(actor_id);

create index if not exists approval_requests_requester_id_idx
on public.approval_requests(requester_id);

create index if not exists approval_requests_template_version_id_idx
on public.approval_requests(workflow_template_version_id);

create index if not exists workflow_template_versions_business_unit_id_idx
on public.workflow_template_versions(business_unit_id);

create index if not exists workflow_template_versions_department_id_idx
on public.workflow_template_versions(department_id);

create index if not exists workflow_template_versions_created_by_idx
on public.workflow_template_versions(created_by);

create index if not exists workspace_snapshots_owner_user_id_idx
on public.workspace_snapshots(owner_user_id);
