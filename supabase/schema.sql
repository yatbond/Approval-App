create extension if not exists "pgcrypto";

create type public.approval_action_type as enum (
  'approve',
  'approve_with_comment',
  'reject_with_comment',
  'reassign',
  'delegate'
);

create type public.task_status as enum (
  'pending',
  'approved',
  'rejected',
  'reassigned',
  'delegated',
  'skipped'
);

create type public.submission_status as enum (
  'draft',
  'in_review',
  'approved',
  'rejected',
  'cancelled'
);

create type public.field_source as enum (
  'ai',
  'ocr',
  'excel',
  'manual'
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  department_id uuid references public.departments(id),
  role text not null default 'requester',
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  name text not null,
  description text,
  document_types text[] not null default '{}',
  supported_languages text[] not null default array['en', 'zh-Hant', 'zh-Hans'],
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.workflow_fields (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references public.workflow_templates(id) on delete cascade,
  name text not null,
  label text not null,
  field_type text not null default 'text',
  source field_source not null default 'ai',
  is_required boolean not null default false,
  instructions text,
  display_order integer not null default 0
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references public.workflow_templates(id) on delete cascade,
  name text not null,
  approver_role text not null,
  department_id uuid references public.departments(id),
  due_in_hours integer not null default 48,
  escalation_role text,
  branch_condition jsonb not null default '{}'::jsonb,
  display_order integer not null default 0
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  workflow_template_id uuid not null references public.workflow_templates(id),
  requester_id uuid references public.profiles(id),
  title text not null,
  status submission_status not null default 'draft',
  current_step_id uuid references public.workflow_steps(id),
  extracted_data jsonb not null default '{}'::jsonb,
  confirmed_data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  parser_strategy text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.parsed_documents (
  id uuid primary key default gen_random_uuid(),
  submission_file_id uuid not null references public.submission_files(id) on delete cascade,
  parser_strategy text not null,
  raw_text text,
  extracted_data jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  user_corrections jsonb not null default '{}'::jsonb,
  parser_version text not null default 'mvp-1',
  created_at timestamptz not null default now(),
  corrected_at timestamptz
);

create table public.approval_tasks (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps(id),
  assigned_to uuid references public.profiles(id),
  assigned_role text not null,
  status task_status not null default 'pending',
  due_at timestamptz not null,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  approval_task_id uuid not null references public.approval_tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action approval_action_type not null,
  comment text,
  reassigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id),
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_id uuid not null references public.profiles(id),
  delegate_id uuid not null references public.profiles(id),
  department_id uuid references public.departments(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.workflow_templates enable row level security;
alter table public.workflow_fields enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.parsed_documents enable row level security;
alter table public.approval_tasks enable row level security;
alter table public.approval_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.delegations enable row level security;

create policy "authenticated can read active departments"
on public.departments for select
to authenticated
using (is_active);

create policy "users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
));

create policy "admins manage workflow setup"
on public.workflow_templates for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "authenticated read workflow setup"
on public.workflow_templates for select
to authenticated
using (is_active);

create policy "users read own submissions or assigned tasks"
on public.submissions for select
to authenticated
using (
  requester_id = auth.uid()
  or exists (
    select 1 from public.approval_tasks t
    where t.submission_id = submissions.id
    and t.assigned_to = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

create policy "users create own submissions"
on public.submissions for insert
to authenticated
with check (requester_id = auth.uid());

create policy "assigned users read tasks"
on public.approval_tasks for select
to authenticated
using (
  assigned_to = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

create policy "users read own notifications"
on public.notifications for select
to authenticated
using (recipient_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('approval-documents', 'approval-documents', false)
on conflict (id) do nothing;
