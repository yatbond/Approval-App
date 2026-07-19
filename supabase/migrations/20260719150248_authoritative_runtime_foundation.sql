-- Phase 1: establish the database as the authority for shared approval runtime.
-- This migration is additive first, backfills resolvable identities, records
-- unresolved legacy identities, and then removes direct browser mutation paths.

create schema if not exists private;

alter table public.approval_requests
  add column if not exists schema_version integer not null default 1,
  add column if not exists state_version bigint not null default 0,
  add column if not exists current_owner_id uuid references public.profiles(id),
  add column if not exists pinned_template_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

alter table public.approval_request_events
  add column if not exists schema_version integer not null default 1,
  add column if not exists command_id uuid,
  add column if not exists request_version bigint,
  add column if not exists event_type text,
  add column if not exists target_id uuid references public.profiles(id),
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.approval_migration_issues (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  field_name text not null,
  legacy_value text not null default '',
  reason text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (entity_type, entity_id, field_name, legacy_value)
);

create table if not exists public.approval_request_participants (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  participant_role text not null,
  visibility_reason text not null,
  workflow_node_id text not null default '',
  is_active boolean not null default true,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (approval_request_id, profile_id, participant_role, workflow_node_id),
  check (participant_role in (
    'requester',
    'owner',
    'approver',
    'delegate',
    'reassignment_candidate',
    'contributor',
    'observer',
    'fyi'
  )),
  check (length(visibility_reason) between 1 and 200),
  check (active_until is null or active_until >= active_from)
);

create table if not exists public.approval_request_assignments (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  workflow_node_id text not null default '',
  assignee_id uuid not null references public.profiles(id),
  assignment_type text not null,
  status text not null default 'active',
  assigned_by uuid references public.profiles(id),
  predecessor_assignment_id uuid references public.approval_request_assignments(id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assignment_type in ('owner', 'delegate', 'reassignment', 'contributor')),
  check (status in (
    'active',
    'pending_acceptance',
    'accepted',
    'declined',
    'revoked',
    'completed',
    'expired'
  )),
  check (expires_at is null or expires_at >= starts_at),
  check (length(reason) <= 2000)
);

create table if not exists public.approval_command_receipts (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  action text not null,
  payload_hash text not null,
  expected_state_version bigint not null,
  resulting_state_version bigint not null,
  status text not null default 'completed',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (approval_request_id, actor_id, idempotency_key),
  check (length(idempotency_key) between 8 and 128),
  check (payload_hash ~ '^[0-9a-f]{64}$'),
  check (length(action) between 1 and 80),
  check (expected_state_version >= 0),
  check (resulting_state_version >= 1),
  check (status in ('completed'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_request_events_command_id_fkey'
      and conrelid = 'public.approval_request_events'::regclass
  ) then
    alter table public.approval_request_events
      add constraint approval_request_events_command_id_fkey
      foreign key (command_id)
      references public.approval_command_receipts(id);
  end if;
end
$$;

create table if not exists public.approval_notifications (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  source_event_id uuid references public.approval_request_events(id),
  kind text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (length(kind) between 1 and 80),
  check (length(title) between 1 and 200),
  check (length(body) between 1 and 4000)
);

create table if not exists public.approval_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.approval_notifications(id) on delete cascade,
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  recipient_email text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id),
  check (status in ('pending', 'processing', 'retry', 'sent', 'failed')),
  check (attempt_count between 0 and 100),
  check (length(recipient_email) between 3 and 320),
  check (length(template_key) between 1 and 120)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workflow_collaboration_requests_request_no_fkey'
      and conrelid = 'public.workflow_collaboration_requests'::regclass
  ) then
    alter table public.workflow_collaboration_requests
      add constraint workflow_collaboration_requests_request_no_fkey
      foreign key (approval_request_no)
      references public.approval_requests(request_no)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workflow_shared_fulfillments_request_no_fkey'
      and conrelid = 'public.workflow_shared_fulfillments'::regclass
  ) then
    alter table public.workflow_shared_fulfillments
      add constraint workflow_shared_fulfillments_request_no_fkey
      foreign key (approval_request_no)
      references public.approval_requests(request_no)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workflow_correction_requests_request_no_fkey'
      and conrelid = 'public.workflow_correction_requests'::regclass
  ) then
    alter table public.workflow_correction_requests
      add constraint workflow_correction_requests_request_no_fkey
      foreign key (approval_request_no)
      references public.approval_requests(request_no)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workflow_notification_events_request_no_fkey'
      and conrelid = 'public.workflow_notification_events'::regclass
  ) then
    alter table public.workflow_notification_events
      add constraint workflow_notification_events_request_no_fkey
      foreign key (approval_request_no)
      references public.approval_requests(request_no)
      on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_requests_schema_version_positive'
      and conrelid = 'public.approval_requests'::regclass
  ) then
    alter table public.approval_requests
      add constraint approval_requests_schema_version_positive
      check (schema_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_requests_state_version_nonnegative'
      and conrelid = 'public.approval_requests'::regclass
  ) then
    alter table public.approval_requests
      add constraint approval_requests_state_version_nonnegative
      check (state_version >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_requests_status_supported'
      and conrelid = 'public.approval_requests'::regclass
  ) then
    alter table public.approval_requests
      add constraint approval_requests_status_supported
      check (status in (
        'pending',
        'overdue',
        'escalated',
        'approved',
        'returned',
        'reassigned',
        'delegated',
        'cancelled'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_requests_pinned_snapshot_object'
      and conrelid = 'public.approval_requests'::regclass
  ) then
    alter table public.approval_requests
      add constraint approval_requests_pinned_snapshot_object
      check (jsonb_typeof(pinned_template_snapshot) = 'object');
  end if;

end
$$;

-- Repair malformed compatibility JSON before adding its schema marker.
update public.approval_requests
set task_snapshot = jsonb_build_object(
  'id', request_no,
  'title', title,
  'status', status,
  'currentNodeId', coalesce(current_node_id, ''),
  'currentOwner', coalesce(current_owner_email, ''),
  'participants', to_jsonb(participants)
)
where task_snapshot is null
   or jsonb_typeof(task_snapshot) <> 'object';

update public.approval_requests
set task_snapshot = jsonb_set(task_snapshot, '{schemaVersion}', '1'::jsonb, true)
where not (task_snapshot ? 'schemaVersion');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'approval_requests_task_snapshot_object'
      and conrelid = 'public.approval_requests'::regclass
  ) then
    alter table public.approval_requests
      add constraint approval_requests_task_snapshot_object
      check (jsonb_typeof(task_snapshot) = 'object');
  end if;
end
$$;

update public.approval_requests r
set pinned_template_snapshot = case
  when jsonb_typeof(v.template_snapshot) = 'object'
    then jsonb_set(v.template_snapshot, '{schemaVersion}', '1'::jsonb, true)
  else jsonb_build_object(
    'schemaVersion', 1,
    'templateKey', v.template_key,
    'version', v.version_number,
    'name', v.name,
    'graph', coalesce(v.graph, '{"nodes":[],"edges":[]}'::jsonb),
    'documents', coalesce(v.document_requirements, '[]'::jsonb)
  )
end
from public.workflow_template_versions v
where v.id = r.workflow_template_version_id
  and (
    r.pinned_template_snapshot = '{}'::jsonb
    or jsonb_typeof(r.pinned_template_snapshot) <> 'object'
  );

-- Resolve legacy email identities case-insensitively and report every miss.
update public.approval_requests r
set requester_id = p.id
from public.profiles p
where r.requester_id is null
  and lower(p.email) = lower(r.requester_email);

update public.approval_requests r
set current_owner_id = p.id
from public.profiles p
where r.current_owner_id is null
  and nullif(trim(r.current_owner_email), '') is not null
  and lower(p.email) = lower(r.current_owner_email);

insert into public.approval_migration_issues (
  entity_type,
  entity_id,
  field_name,
  legacy_value,
  reason
)
select
  'approval_request',
  r.id::text,
  'requester_email',
  coalesce(r.requester_email, ''),
  'No profile matched the legacy requester email.'
from public.approval_requests r
where r.requester_id is null
on conflict do nothing;

insert into public.approval_migration_issues (
  entity_type,
  entity_id,
  field_name,
  legacy_value,
  reason
)
select
  'approval_request',
  r.id::text,
  'current_owner_email',
  coalesce(r.current_owner_email, ''),
  'No active profile matched the legacy current owner email.'
from public.approval_requests r
left join public.profiles p on p.id = r.current_owner_id and p.is_active
where nullif(trim(r.current_owner_email), '') is not null
  and p.id is null
on conflict do nothing;

insert into public.approval_migration_issues (
  entity_type,
  entity_id,
  field_name,
  legacy_value,
  reason
)
select
  'approval_request',
  r.id::text,
  'participants',
  legacy.email,
  'No profile matched the legacy participant email.'
from public.approval_requests r
cross join lateral unnest(r.participants) as legacy(email)
left join public.profiles p on lower(p.email) = lower(legacy.email)
where p.id is null
on conflict do nothing;

insert into public.approval_request_participants (
  approval_request_id,
  profile_id,
  participant_role,
  visibility_reason,
  created_by
)
select
  r.id,
  r.requester_id,
  'requester',
  'Legacy requester backfill',
  r.requester_id
from public.approval_requests r
where r.requester_id is not null
on conflict do nothing;

insert into public.approval_request_participants (
  approval_request_id,
  profile_id,
  participant_role,
  visibility_reason,
  created_by
)
select distinct
  r.id,
  p.id,
  case when p.id = r.current_owner_id then 'owner' else 'observer' end,
  'Legacy participant backfill',
  r.requester_id
from public.approval_requests r
cross join lateral unnest(r.participants) as legacy(email)
join public.profiles p on lower(p.email) = lower(legacy.email)
on conflict do nothing;

insert into public.approval_request_participants (
  approval_request_id,
  profile_id,
  participant_role,
  visibility_reason,
  workflow_node_id,
  created_by
)
select
  r.id,
  r.current_owner_id,
  'owner',
  'Legacy current owner backfill',
  coalesce(r.current_node_id, ''),
  r.requester_id
from public.approval_requests r
where r.current_owner_id is not null
on conflict do nothing;

insert into public.approval_request_assignments (
  approval_request_id,
  workflow_node_id,
  assignee_id,
  assignment_type,
  status,
  assigned_by,
  starts_at
)
select
  r.id,
  coalesce(r.current_node_id, ''),
  r.current_owner_id,
  'owner',
  'active',
  r.requester_id,
  r.submitted_at
from public.approval_requests r
join public.profiles p on p.id = r.current_owner_id and p.is_active
where r.current_owner_id is not null
  and r.status in ('pending', 'overdue', 'escalated', 'reassigned', 'delegated')
  and not exists (
    select 1
    from public.approval_request_assignments a
    where a.approval_request_id = r.id
      and a.workflow_node_id = coalesce(r.current_node_id, '')
      and a.assignee_id = r.current_owner_id
      and a.assignment_type = 'owner'
      and a.status = 'active'
  );

update public.approval_request_events
set event_type = action
where event_type is null;

update public.approval_request_events e
set request_version = r.state_version
from public.approval_requests r
where r.id = e.approval_request_id
  and e.request_version is null;

alter table public.approval_request_events
  alter column event_type set not null,
  alter column request_version set not null;

create unique index if not exists approval_request_active_owner_per_node_idx
on public.approval_request_assignments (approval_request_id, workflow_node_id)
where assignment_type = 'owner' and status = 'active';

create index if not exists approval_requests_current_owner_state_idx
on public.approval_requests (current_owner_id, status, updated_at desc);

create index if not exists approval_requests_status_due_idx
on public.approval_requests (status, due_at, id)
where status in ('pending', 'overdue', 'escalated');

create index if not exists approval_requests_updated_cursor_idx
on public.approval_requests (updated_at desc, id desc);

create index if not exists approval_request_participants_profile_request_idx
on public.approval_request_participants (profile_id, approval_request_id);

create index if not exists approval_request_participants_request_profile_idx
on public.approval_request_participants (approval_request_id, profile_id);

create index if not exists approval_request_participants_created_by_idx
on public.approval_request_participants (created_by)
where created_by is not null;

create index if not exists approval_request_assignments_assignee_active_idx
on public.approval_request_assignments (assignee_id, status, approval_request_id);

create index if not exists approval_request_assignments_request_idx
on public.approval_request_assignments (approval_request_id, workflow_node_id);

create index if not exists approval_request_assignments_assigned_by_idx
on public.approval_request_assignments (assigned_by)
where assigned_by is not null;

create index if not exists approval_request_assignments_predecessor_idx
on public.approval_request_assignments (predecessor_assignment_id)
where predecessor_assignment_id is not null;

create index if not exists approval_command_receipts_actor_created_idx
on public.approval_command_receipts (actor_id, created_at desc, id);

create index if not exists approval_request_events_request_version_idx
on public.approval_request_events (approval_request_id, request_version, created_at, id);

create index if not exists approval_request_events_command_id_idx
on public.approval_request_events (command_id)
where command_id is not null;

create index if not exists approval_request_events_target_id_idx
on public.approval_request_events (target_id)
where target_id is not null;

create index if not exists approval_notifications_recipient_unread_idx
on public.approval_notifications (recipient_id, created_at desc, id)
where read_at is null;

create index if not exists approval_notifications_recipient_idx
on public.approval_notifications (recipient_id);

create index if not exists approval_notifications_request_idx
on public.approval_notifications (approval_request_id, created_at, id);

create index if not exists approval_notifications_source_event_idx
on public.approval_notifications (source_event_id)
where source_event_id is not null;

create index if not exists approval_email_outbox_due_idx
on public.approval_email_outbox (next_attempt_at, id)
where status in ('pending', 'retry');

create index if not exists approval_email_outbox_request_idx
on public.approval_email_outbox (approval_request_id, created_at, id);

create index if not exists approval_email_outbox_recipient_idx
on public.approval_email_outbox (recipient_id);

create or replace function private.is_active_approval_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active
      and p.is_admin
  );
$$;

create or replace function private.can_read_approval_request(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_active
      and (
        p.is_admin
        or exists (
          select 1
          from public.approval_requests r
          where r.id = p_request_id
            and r.requester_id = p_user_id
        )
        or exists (
          select 1
          from public.approval_request_participants rp
          where rp.approval_request_id = p_request_id
            and rp.profile_id = p_user_id
        )
      )
  );
$$;

create or replace function private.can_read_approval_request_by_no(
  p_request_no text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.approval_requests r
    where r.request_no = p_request_no
      and private.can_read_approval_request(r.id, p_user_id)
  );
$$;

revoke all on function private.is_active_approval_admin(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.can_read_approval_request(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.can_read_approval_request_by_no(text, uuid)
from public, anon, authenticated, service_role;
grant execute on function private.is_active_approval_admin(uuid)
to authenticated;
grant execute on function private.can_read_approval_request(uuid, uuid)
to authenticated;
grant execute on function private.can_read_approval_request_by_no(text, uuid)
to authenticated;

alter table public.approval_request_participants enable row level security;
alter table public.approval_request_assignments enable row level security;
alter table public.approval_command_receipts enable row level security;
alter table public.approval_migration_issues enable row level security;
alter table public.approval_notifications enable row level security;
alter table public.approval_email_outbox enable row level security;

drop policy if exists "participants read approval requests"
on public.approval_requests;
create policy "authorized users read approval requests"
on public.approval_requests for select
to authenticated
using (
  (select private.can_read_approval_request(
    approval_requests.id,
    (select auth.uid())
  ))
);

drop policy if exists "users create own approval requests"
on public.approval_requests;
drop policy if exists "current owner or requester update approval requests"
on public.approval_requests;

drop policy if exists "participants read approval request events"
on public.approval_request_events;
create policy "authorized users read approval request events"
on public.approval_request_events for select
to authenticated
using (
  (select private.can_read_approval_request(
    approval_request_events.approval_request_id,
    (select auth.uid())
  ))
);

drop policy if exists "current owner or requester create approval request events"
on public.approval_request_events;
drop policy if exists "current owner or requester update approval request events"
on public.approval_request_events;

create policy "authorized users read request participants"
on public.approval_request_participants for select
to authenticated
using (
  (select private.can_read_approval_request(
    approval_request_participants.approval_request_id,
    (select auth.uid())
  ))
);

create policy "authorized users read request assignments"
on public.approval_request_assignments for select
to authenticated
using (
  (select private.can_read_approval_request(
    approval_request_assignments.approval_request_id,
    (select auth.uid())
  ))
);

create policy "actors read own command receipts"
on public.approval_command_receipts for select
to authenticated
using (
  actor_id = (select auth.uid())
  and (select private.can_read_approval_request(
    approval_command_receipts.approval_request_id,
    (select auth.uid())
  ))
);

create policy "admins read migration issues"
on public.approval_migration_issues for select
to authenticated
using ((select private.is_active_approval_admin((select auth.uid()))));

create policy "recipients read notifications"
on public.approval_notifications for select
to authenticated
using (
  recipient_id = (select auth.uid())
  or (select private.is_active_approval_admin((select auth.uid())))
);

create policy "admins read email outbox"
on public.approval_email_outbox for select
to authenticated
using ((select private.is_active_approval_admin((select auth.uid()))));

drop policy if exists "participants read collaboration requests"
on public.workflow_collaboration_requests;
drop policy if exists "participants write collaboration requests"
on public.workflow_collaboration_requests;
drop policy if exists "participants update collaboration requests"
on public.workflow_collaboration_requests;
create policy "authorized users read collaboration requests"
on public.workflow_collaboration_requests for select
to authenticated
using (
  (select private.can_read_approval_request_by_no(
    workflow_collaboration_requests.approval_request_no,
    (select auth.uid())
  ))
);

drop policy if exists "participants read shared fulfillments"
on public.workflow_shared_fulfillments;
drop policy if exists "participants write shared fulfillments"
on public.workflow_shared_fulfillments;
drop policy if exists "participants update shared fulfillments"
on public.workflow_shared_fulfillments;
create policy "authorized users read shared fulfillments"
on public.workflow_shared_fulfillments for select
to authenticated
using (
  (select private.can_read_approval_request_by_no(
    workflow_shared_fulfillments.approval_request_no,
    (select auth.uid())
  ))
);

drop policy if exists "participants read correction requests"
on public.workflow_correction_requests;
drop policy if exists "participants write correction requests"
on public.workflow_correction_requests;
drop policy if exists "participants update correction requests"
on public.workflow_correction_requests;
create policy "authorized users read correction requests"
on public.workflow_correction_requests for select
to authenticated
using (
  (select private.can_read_approval_request_by_no(
    workflow_correction_requests.approval_request_no,
    (select auth.uid())
  ))
);

drop policy if exists "participants read notification events"
on public.workflow_notification_events;
drop policy if exists "participants write notification events"
on public.workflow_notification_events;
drop policy if exists "participants update notification events"
on public.workflow_notification_events;
create policy "recipients read legacy notification events"
on public.workflow_notification_events for select
to authenticated
using (
  lower(recipient_email) = lower((select p.email from public.profiles p where p.id = (select auth.uid())))
  or (select private.is_active_approval_admin((select auth.uid())))
);

revoke all privileges on table
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_participants,
  public.approval_request_assignments,
  public.approval_command_receipts,
  public.approval_migration_issues,
  public.approval_notifications,
  public.approval_email_outbox
from anon, authenticated;

grant select on table
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_participants,
  public.approval_request_assignments,
  public.approval_command_receipts,
  public.approval_migration_issues,
  public.approval_notifications,
  public.approval_email_outbox
to authenticated;

revoke all privileges on table
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events
from anon, authenticated;

grant select on table
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events
to authenticated;

revoke all privileges on table
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_participants,
  public.approval_request_assignments,
  public.approval_command_receipts,
  public.approval_migration_issues,
  public.approval_notifications,
  public.approval_email_outbox
from service_role;

grant select, insert on public.approval_request_events to service_role;
grant select, insert, update on public.approval_requests to service_role;
grant select, insert, update on public.approval_request_participants to service_role;
grant select, insert, update on public.approval_request_assignments to service_role;
grant select on public.approval_command_receipts to service_role;
grant select, insert, update on public.approval_migration_issues to service_role;
grant select, insert, update on public.approval_notifications to service_role;
grant select, insert, update on public.approval_email_outbox to service_role;

revoke all privileges on table
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events
from service_role;
grant select, insert, update on public.workflow_collaboration_requests to service_role;
grant select, insert, update on public.workflow_shared_fulfillments to service_role;
grant select, insert, update on public.workflow_correction_requests to service_role;
grant select, insert on public.workflow_notification_events to service_role;

create or replace function private.prevent_approval_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'approval_request_events are append-only';
end;
$$;

drop trigger if exists approval_request_events_append_only
on public.approval_request_events;
create trigger approval_request_events_append_only
before update or delete on public.approval_request_events
for each row execute function private.prevent_approval_event_mutation();

drop trigger if exists workflow_notification_events_append_only
on public.workflow_notification_events;
create trigger workflow_notification_events_append_only
before update or delete on public.workflow_notification_events
for each row execute function private.prevent_approval_event_mutation();

revoke all on function private.prevent_approval_event_mutation()
from public, anon, authenticated, service_role;

-- Atomic, admin-only workspace configuration save. Runtime request rows are
-- intentionally not accepted by this function.
create or replace function public.save_workspace_configuration(
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_business jsonb;
  v_department jsonb;
  v_template jsonb;
  v_business_id uuid;
  v_department_id uuid;
  v_business_count integer := 0;
  v_department_count integer := 0;
  v_template_count integer := 0;
begin
  if v_actor_id is null
     or not (select private.is_active_approval_admin(v_actor_id)) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  if jsonb_typeof(p_configuration) <> 'object'
     or coalesce((p_configuration ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb)) > 500
     or jsonb_array_length(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb)) > 5000 then
    raise exception using errcode = '22023', message = 'invalid workspace configuration';
  end if;

  for v_business in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb))
  loop
    if jsonb_typeof(v_business) <> 'object'
       or length(trim(coalesce(v_business ->> 'name', ''))) not between 1 and 200 then
      raise exception using errcode = '22023', message = 'invalid business unit';
    end if;

    insert into public.business_units (name, is_active, updated_at)
    values (
      trim(v_business ->> 'name'),
      coalesce((v_business ->> 'isActive')::boolean, true),
      statement_timestamp()
    )
    on conflict (name) do update
    set is_active = excluded.is_active,
        updated_at = excluded.updated_at;
    v_business_count := v_business_count + 1;
  end loop;

  for v_department in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb))
  loop
    select b.id into v_business_id
    from public.business_units b
    where b.name = trim(coalesce(v_department ->> 'businessName', ''));

    if v_business_id is null
       or length(trim(coalesce(v_department ->> 'name', ''))) not between 1 and 200 then
      raise exception using errcode = '23503', message = 'department business is unresolved';
    end if;

    insert into public.business_departments (
      business_unit_id,
      name,
      is_active,
      updated_at
    )
    values (
      v_business_id,
      trim(v_department ->> 'name'),
      coalesce((v_department ->> 'isActive')::boolean, true),
      statement_timestamp()
    )
    on conflict (business_unit_id, name) do update
    set is_active = excluded.is_active,
        updated_at = excluded.updated_at;
    v_department_count := v_department_count + 1;
  end loop;

  for v_template in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb))
  loop
    select b.id into v_business_id
    from public.business_units b
    where b.name = trim(coalesce(v_template ->> 'businessName', ''));

    select d.id into v_department_id
    from public.business_departments d
    where d.business_unit_id = v_business_id
      and d.name = trim(coalesce(v_template ->> 'departmentName', ''));

    if length(trim(coalesce(v_template ->> 'templateKey', ''))) not between 1 and 200
       or coalesce((v_template ->> 'versionNumber')::integer, 0) < 1
       or length(trim(coalesce(v_template ->> 'name', ''))) not between 1 and 300
       or v_business_id is null
       or v_department_id is null
       or jsonb_typeof(coalesce(v_template -> 'templateSnapshot', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid workflow template version';
    end if;

    insert into public.workflow_template_versions (
      template_key,
      version_number,
      name,
      business_unit_id,
      department_id,
      graph,
      document_requirements,
      supported_languages,
      template_snapshot,
      is_active,
      is_active_version,
      version_comment,
      created_by,
      updated_at
    )
    values (
      trim(v_template ->> 'templateKey'),
      (v_template ->> 'versionNumber')::integer,
      trim(v_template ->> 'name'),
      v_business_id,
      v_department_id,
      coalesce(v_template -> 'graph', '{"nodes":[],"edges":[]}'::jsonb),
      coalesce(v_template -> 'documentRequirements', '[]'::jsonb),
      coalesce(
        array(select jsonb_array_elements_text(v_template -> 'supportedLanguages')),
        array['en']::text[]
      ),
      jsonb_set(v_template -> 'templateSnapshot', '{schemaVersion}', '1'::jsonb, true),
      coalesce((v_template ->> 'isActive')::boolean, true),
      coalesce((v_template ->> 'isActiveVersion')::boolean, false),
      left(coalesce(v_template ->> 'versionComment', ''), 2000),
      v_actor_id,
      statement_timestamp()
    )
    on conflict (template_key, version_number) do update
    set name = excluded.name,
        business_unit_id = excluded.business_unit_id,
        department_id = excluded.department_id,
        graph = excluded.graph,
        document_requirements = excluded.document_requirements,
        supported_languages = excluded.supported_languages,
        template_snapshot = excluded.template_snapshot,
        is_active = excluded.is_active,
        is_active_version = excluded.is_active_version,
        version_comment = excluded.version_comment,
        updated_at = excluded.updated_at;
    v_template_count := v_template_count + 1;
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'businessUnits', v_business_count,
    'businessDepartments', v_department_count,
    'workflowTemplateVersions', v_template_count
  );
end;
$$;

revoke all on function public.save_workspace_configuration(jsonb)
from public, anon, service_role;
grant execute on function public.save_workspace_configuration(jsonb)
to authenticated;

-- The browser cannot execute this function. A server route authenticates the
-- actor and uses the service role; this function revalidates the active actor,
-- locks the request, enforces version/idempotency, and commits all rows atomically.
create or replace function public.commit_approval_request_command(
  p_request_no text,
  p_actor_id uuid,
  p_idempotency_key text,
  p_action text,
  p_payload_hash text,
  p_expected_state_version bigint,
  p_next_state jsonb,
  p_event jsonb,
  p_notifications jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_requests%rowtype;
  v_actor public.profiles%rowtype;
  v_existing public.approval_command_receipts%rowtype;
  v_result_request public.approval_requests%rowtype;
  v_command_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_target_id uuid;
  v_target public.profiles%rowtype;
  v_event_target_id uuid;
  v_event_target public.profiles%rowtype;
  v_notification jsonb;
  v_notification_id uuid;
  v_recipient public.profiles%rowtype;
  v_result jsonb;
  v_is_admin boolean := false;
  v_is_actor boolean := false;
  v_is_reassignment_candidate boolean := false;
  v_unknown_key text;
  v_pending_ids uuid[] := '{}'::uuid[];
  v_pending_id uuid;
  v_pending_email text;
  v_event_action text;
begin
  if length(trim(coalesce(p_request_no, ''))) not between 1 and 100
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_action, ''))) not between 1 and 80
     or p_expected_state_version < 0
     or jsonb_typeof(p_next_state) <> 'object'
     or jsonb_typeof(p_event) <> 'object'
     or jsonb_typeof(p_notifications) <> 'array'
     or jsonb_array_length(p_notifications) > 100 then
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  if trim(p_action) not in (
    'approve',
    'approve_with_comment',
    'reject',
    'reject_with_comment',
    'reassign',
    'accept_reassignment',
    'decline_reassignment',
    'delegate',
    'revoke_delegation',
    'amend_resubmit',
    'cancel',
    'request_contributor',
    'submit_contribution',
    'confirm_fulfillment',
    'request_correction',
    'submit_correction',
    'acknowledge_fyi',
    'escalate'
  ) then
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  v_event_action := coalesce(
    nullif(trim(p_event ->> 'action'), ''),
    case trim(p_action)
      when 'approve' then 'approved'
      when 'approve_with_comment' then 'approved'
      when 'reject' then 'rejected'
      when 'reject_with_comment' then 'rejected'
      when 'reassign' then 'reassigned'
      when 'accept_reassignment' then 'reassigned'
      when 'decline_reassignment' then 'reassigned'
      when 'delegate' then 'delegated'
      when 'revoke_delegation' then 'delegated'
      when 'amend_resubmit' then 'resubmitted'
      when 'cancel' then 'cancelled'
      when 'request_contributor' then 'contribution_requested'
      when 'submit_contribution' then 'contribution_submitted'
      when 'confirm_fulfillment' then 'shared_fulfillment_confirmed'
      when 'request_correction' then 'correction_requested'
      when 'submit_correction' then 'correction_submitted'
      when 'acknowledge_fyi' then 'assigned'
      when 'escalate' then 'escalated'
    end
  );

  select * into v_request
  from public.approval_requests r
  where r.request_no = trim(p_request_no)
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_existing
  from public.approval_command_receipts c
  where c.approval_request_id = v_request.id
    and c.actor_id = p_actor_id
    and c.idempotency_key = trim(p_idempotency_key);

  if found then
    if v_existing.payload_hash <> p_payload_hash
       or v_existing.action <> trim(p_action) then
      return jsonb_build_object(
        'outcome', 'idempotency_conflict',
        'commandId', v_existing.id,
        'currentVersion', v_request.state_version
      );
    end if;

    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_actor
  from public.profiles p
  where p.id = p_actor_id
    and p.is_active;

  if not found then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if (
    select count(*)
    from public.approval_command_receipts c
    where c.actor_id = p_actor_id
      and c.created_at >= statement_timestamp() - interval '1 minute'
  ) >= 120 then
    return jsonb_build_object('outcome', 'rate_limited', 'retryAfterSeconds', 60);
  end if;

  v_is_admin := v_actor.is_admin;
  v_is_actor := v_request.current_owner_id = p_actor_id
    or exists (
      select 1
      from public.approval_request_assignments a
      where a.approval_request_id = v_request.id
        and a.assignee_id = p_actor_id
        and a.status in ('active', 'accepted')
        and (a.expires_at is null or a.expires_at > statement_timestamp())
    );
  v_is_reassignment_candidate := exists (
    select 1
    from public.approval_request_assignments a
    where a.approval_request_id = v_request.id
      and a.assignee_id = p_actor_id
      and a.assignment_type = 'reassignment'
      and a.status = 'pending_acceptance'
      and (a.expires_at is null or a.expires_at > statement_timestamp())
  );

  if p_action in ('amend_resubmit', 'cancel') then
    if not (v_is_admin or v_request.requester_id = p_actor_id) then
      return jsonb_build_object('outcome', 'forbidden');
    end if;
  elsif p_action in (
    'approve',
    'approve_with_comment',
    'reject',
    'reject_with_comment',
    'reassign',
    'delegate',
    'acknowledge_fyi'
  ) then
    if not (v_is_admin or v_is_actor) then
      return jsonb_build_object('outcome', 'forbidden');
    end if;
  elsif p_action in ('accept_reassignment', 'decline_reassignment') then
    if not (v_is_admin or v_is_reassignment_candidate) then
      return jsonb_build_object('outcome', 'forbidden');
    end if;
  elsif not (
    v_is_admin
    or v_is_actor
    or v_request.requester_id = p_actor_id
    or exists (
      select 1
      from public.approval_request_participants rp
      where rp.approval_request_id = v_request.id
        and rp.profile_id = p_actor_id
        and rp.is_active
        and (rp.active_until is null or rp.active_until > statement_timestamp())
    )
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_request.state_version <> p_expected_state_version then
    return jsonb_build_object(
      'outcome', 'stale',
      'currentVersion', v_request.state_version,
      'request', to_jsonb(v_request)
    );
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_next_state) as key
  where key not in (
    'status',
    'currentNodeId',
    'currentOwnerId',
    'dueAt',
    'completedNodeIds',
    'notifiedNodeIds',
    'pendingNodeIds',
    'pendingOwnerEmails',
    'nodeDecisions',
    'activeBranchId',
    'extractedFields',
    'lastAction',
    'taskSnapshot',
    'completedAt'
  )
  limit 1;

  if v_unknown_key is not null then
    return jsonb_build_object(
      'outcome', 'invalid_command',
      'field', v_unknown_key
    );
  end if;

  if p_next_state ? 'currentOwnerId'
     and p_next_state -> 'currentOwnerId' <> 'null'::jsonb then
    if jsonb_typeof(p_next_state -> 'currentOwnerId') <> 'string'
       or (p_next_state ->> 'currentOwnerId') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;

    v_target_id := (p_next_state ->> 'currentOwnerId')::uuid;
    select * into v_target
    from public.profiles p
    where p.id = v_target_id
      and p.is_active;
    if not found then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;
  end if;

  if p_next_state ? 'pendingOwnerEmails' then
    if jsonb_typeof(p_next_state -> 'pendingOwnerEmails') <> 'array'
       or jsonb_array_length(p_next_state -> 'pendingOwnerEmails') > 100 then
      return jsonb_build_object('outcome', 'invalid_command', 'field', 'pendingOwnerEmails');
    end if;

    for v_pending_email in
      select distinct lower(trim(value))
      from jsonb_array_elements_text(p_next_state -> 'pendingOwnerEmails')
      where length(trim(value)) between 3 and 320
    loop
      select p.id into v_pending_id
      from public.profiles p
      where lower(p.email) = v_pending_email
        and p.is_active;
      if not found then
        return jsonb_build_object('outcome', 'invalid_target');
      end if;
      v_pending_ids := array_append(v_pending_ids, v_pending_id);
    end loop;

    if cardinality(v_pending_ids) <> jsonb_array_length(p_next_state -> 'pendingOwnerEmails') then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;
  end if;

  if p_next_state ? 'status'
     and coalesce(p_next_state ->> 'status', '') not in (
       'pending',
       'overdue',
       'escalated',
       'approved',
       'returned',
       'reassigned',
       'delegated',
       'cancelled'
     ) then
    return jsonb_build_object('outcome', 'invalid_command', 'field', 'status');
  end if;

  if v_event_action not in (
    'submitted',
    'assigned',
    'approved',
    'rejected',
    'reassigned',
    'delegated',
    'escalated',
    'amended',
    'resubmitted',
    'cancelled',
    'contribution_requested',
    'contribution_submitted',
    'shared_fulfillment_submitted',
    'shared_fulfillment_confirmed',
    'shared_fulfillment_rejected',
    'correction_requested',
    'correction_submitted'
  ) then
    return jsonb_build_object('outcome', 'invalid_command', 'field', 'event.action');
  end if;

  insert into public.approval_command_receipts (
    id,
    approval_request_id,
    actor_id,
    idempotency_key,
    action,
    payload_hash,
    expected_state_version,
    resulting_state_version,
    result
  )
  values (
    v_command_id,
    v_request.id,
    p_actor_id,
    trim(p_idempotency_key),
    trim(p_action),
    p_payload_hash,
    p_expected_state_version,
    p_expected_state_version + 1,
    '{}'::jsonb
  );

  update public.approval_requests r
  set state_version = r.state_version + 1,
      status = case
        when p_next_state ? 'status' then p_next_state ->> 'status'
        else r.status
      end,
      current_node_id = case
        when p_next_state ? 'currentNodeId'
          then nullif(p_next_state ->> 'currentNodeId', '')
        else r.current_node_id
      end,
      current_owner_id = case
        when p_next_state ? 'currentOwnerId' then v_target_id
        else r.current_owner_id
      end,
      current_owner_email = case
        when p_next_state ? 'currentOwnerId' then coalesce(v_target.email, '')
        else r.current_owner_email
      end,
      due_at = case
        when p_next_state ? 'dueAt'
          then nullif(p_next_state ->> 'dueAt', '')::timestamptz
        else r.due_at
      end,
      completed_node_ids = case
        when p_next_state ? 'completedNodeIds'
          then array(select jsonb_array_elements_text(p_next_state -> 'completedNodeIds'))
        else r.completed_node_ids
      end,
      notified_node_ids = case
        when p_next_state ? 'notifiedNodeIds'
          then array(select jsonb_array_elements_text(p_next_state -> 'notifiedNodeIds'))
        else r.notified_node_ids
      end,
      pending_node_ids = case
        when p_next_state ? 'pendingNodeIds'
          then array(select jsonb_array_elements_text(p_next_state -> 'pendingNodeIds'))
        else r.pending_node_ids
      end,
      pending_owner_emails = case
        when p_next_state ? 'pendingOwnerEmails'
          then array(select jsonb_array_elements_text(p_next_state -> 'pendingOwnerEmails'))
        else r.pending_owner_emails
      end,
      node_decisions = case
        when p_next_state ? 'nodeDecisions' then p_next_state -> 'nodeDecisions'
        else r.node_decisions
      end,
      active_branch_id = case
        when p_next_state ? 'activeBranchId'
          then nullif(p_next_state ->> 'activeBranchId', '')
        else r.active_branch_id
      end,
      extracted_fields = case
        when p_next_state ? 'extractedFields' then p_next_state -> 'extractedFields'
        else r.extracted_fields
      end,
      last_action = case
        when p_next_state ? 'lastAction' then left(p_next_state ->> 'lastAction', 500)
        else r.last_action
      end,
      task_snapshot = case
        when p_next_state ? 'taskSnapshot'
          and jsonb_typeof(p_next_state -> 'taskSnapshot') = 'object'
          then jsonb_set(p_next_state -> 'taskSnapshot', '{schemaVersion}', '1'::jsonb, true)
        else r.task_snapshot
      end,
      completed_at = case
        when p_next_state ? 'completedAt'
          then nullif(p_next_state ->> 'completedAt', '')::timestamptz
        when p_next_state ->> 'status' in ('approved', 'cancelled')
          then statement_timestamp()
        else r.completed_at
      end,
      updated_at = statement_timestamp()
  where r.id = v_request.id
  returning r.* into v_result_request;

  if p_next_state ? 'currentOwnerId' or p_next_state ? 'pendingOwnerEmails' then
    update public.approval_request_assignments a
    set status = 'completed',
        ended_at = statement_timestamp(),
        updated_at = statement_timestamp(),
        reason = left(concat('Superseded by ', trim(p_action)), 2000)
    where a.approval_request_id = v_request.id
      and a.status in ('active', 'accepted')
      and not (
        (v_target_id is not null and a.assignee_id = v_target_id)
        or a.assignee_id = any(v_pending_ids)
      );

    if v_target_id is not null then
      insert into public.approval_request_assignments (
        approval_request_id,
        workflow_node_id,
        assignee_id,
        assignment_type,
        status,
        assigned_by,
        reason
      )
      select
        v_request.id,
        coalesce(v_result_request.current_node_id, ''),
        v_target_id,
        'owner',
        'active',
        v_actor.id,
        left(concat('Current owner after ', trim(p_action)), 2000)
      where not exists (
        select 1
        from public.approval_request_assignments a
        where a.approval_request_id = v_request.id
          and a.assignee_id = v_target_id
          and a.assignment_type = 'owner'
          and a.workflow_node_id = coalesce(v_result_request.current_node_id, '')
          and a.status in ('active', 'accepted')
      );
    end if;

    foreach v_pending_id in array v_pending_ids
    loop
      insert into public.approval_request_assignments (
        approval_request_id,
        workflow_node_id,
        assignee_id,
        assignment_type,
        status,
        assigned_by,
        reason
      )
      select
        v_request.id,
        coalesce(v_result_request.current_node_id, ''),
        v_pending_id,
        case when trim(p_action) = 'delegate' then 'delegate' else 'owner' end,
        'active',
        v_actor.id,
        left(concat('Pending owner after ', trim(p_action)), 2000)
      where not exists (
        select 1
        from public.approval_request_assignments a
        where a.approval_request_id = v_request.id
          and a.assignee_id = v_pending_id
          and a.workflow_node_id = coalesce(v_result_request.current_node_id, '')
          and a.status in ('active', 'accepted')
      );
    end loop;
  end if;

  insert into public.approval_request_participants (
    approval_request_id,
    profile_id,
    participant_role,
    visibility_reason,
    workflow_node_id,
    created_by
  )
  values (
    v_request.id,
    v_actor.id,
    case when v_request.requester_id = v_actor.id then 'requester' else 'observer' end,
    left(concat('Actor of ', trim(p_action)), 200),
    coalesce(v_result_request.current_node_id, ''),
    v_actor.id
  )
  on conflict (approval_request_id, profile_id, participant_role, workflow_node_id)
  do update set
    is_active = true,
    active_until = null,
    updated_at = statement_timestamp();

  if v_target_id is not null then
    insert into public.approval_request_participants (
      approval_request_id,
      profile_id,
      participant_role,
      visibility_reason,
      workflow_node_id,
      created_by
    )
    values (
      v_request.id,
      v_target_id,
      'owner',
      left(concat('Current owner after ', trim(p_action)), 200),
      coalesce(v_result_request.current_node_id, ''),
      v_actor.id
    )
    on conflict (approval_request_id, profile_id, participant_role, workflow_node_id)
    do update set
      is_active = true,
      active_until = null,
      updated_at = statement_timestamp();
  end if;

  foreach v_pending_id in array v_pending_ids
  loop
    insert into public.approval_request_participants (
      approval_request_id,
      profile_id,
      participant_role,
      visibility_reason,
      workflow_node_id,
      created_by
    )
    values (
      v_request.id,
      v_pending_id,
      case when trim(p_action) = 'delegate' then 'delegate' else 'approver' end,
      left(concat('Pending owner after ', trim(p_action)), 200),
      coalesce(v_result_request.current_node_id, ''),
      v_actor.id
    )
    on conflict (approval_request_id, profile_id, participant_role, workflow_node_id)
    do update set
      is_active = true,
      active_until = null,
      updated_at = statement_timestamp();
  end loop;

  if p_event ? 'targetProfileId'
     and p_event -> 'targetProfileId' <> 'null'::jsonb then
    if jsonb_typeof(p_event -> 'targetProfileId') <> 'string'
       or (p_event ->> 'targetProfileId') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'invalid event target';
    end if;

    v_event_target_id := (p_event ->> 'targetProfileId')::uuid;
    select * into v_event_target
    from public.profiles p
    where p.id = v_event_target_id
      and p.is_active;
    if not found then
      raise exception using errcode = '23503', message = 'inactive event target';
    end if;
  end if;

  if trim(p_action) = 'reassign' and v_event_target.id is not null then
    insert into public.approval_request_assignments (
      approval_request_id,
      workflow_node_id,
      assignee_id,
      assignment_type,
      status,
      assigned_by,
      reason
    )
    values (
      v_request.id,
      coalesce(v_result_request.current_node_id, ''),
      v_event_target.id,
      'reassignment',
      'pending_acceptance',
      v_actor.id,
      left(coalesce(p_event ->> 'summary', 'Reassignment requested'), 2000)
    );

    insert into public.approval_request_participants (
      approval_request_id,
      profile_id,
      participant_role,
      visibility_reason,
      workflow_node_id,
      created_by
    )
    values (
      v_request.id,
      v_event_target.id,
      'reassignment_candidate',
      'Pending reassignment decision',
      coalesce(v_result_request.current_node_id, ''),
      v_actor.id
    )
    on conflict (approval_request_id, profile_id, participant_role, workflow_node_id)
    do update set
      is_active = true,
      active_until = null,
      updated_at = statement_timestamp();
  elsif trim(p_action) in ('accept_reassignment', 'decline_reassignment') then
    update public.approval_request_assignments a
    set status = case
          when trim(p_action) = 'accept_reassignment' then 'accepted'
          else 'declined'
        end,
        accepted_at = case
          when trim(p_action) = 'accept_reassignment' then statement_timestamp()
          else a.accepted_at
        end,
        ended_at = case
          when trim(p_action) = 'decline_reassignment' then statement_timestamp()
          else a.ended_at
        end,
        updated_at = statement_timestamp(),
        reason = left(coalesce(p_event ->> 'summary', trim(p_action)), 2000)
    where a.approval_request_id = v_request.id
      and a.assignee_id = v_actor.id
      and a.assignment_type = 'reassignment'
      and a.status = 'pending_acceptance';
  end if;

  insert into public.approval_request_events (
    id,
    approval_request_id,
    event_key,
    command_id,
    request_version,
    schema_version,
    action,
    event_type,
    actor_id,
    actor_name,
    actor_email,
    detail,
    details,
    target_id,
    target_email,
    created_at
  )
  values (
    v_event_id,
    v_request.id,
    v_command_id::text,
    v_command_id,
    v_result_request.state_version,
    1,
    v_event_action,
    left(coalesce(nullif(trim(p_event ->> 'type'), ''), trim(p_action)), 80),
    v_actor.id,
    v_actor.full_name,
    v_actor.email,
    left(coalesce(p_event ->> 'summary', trim(p_action)), 4000),
    case
      when jsonb_typeof(p_event -> 'details') = 'object' then p_event -> 'details'
      else '{}'::jsonb
    end,
    v_event_target.id,
    v_event_target.email,
    statement_timestamp()
  );

  for v_notification in
    select value
    from jsonb_array_elements(p_notifications)
  loop
    if jsonb_typeof(v_notification) <> 'object'
       or jsonb_typeof(v_notification -> 'recipientProfileId') <> 'string'
       or (v_notification ->> 'recipientProfileId') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'invalid notification target';
    end if;

    select * into v_recipient
    from public.profiles p
    where p.id = (v_notification ->> 'recipientProfileId')::uuid
      and p.is_active;
    if not found then
      raise exception using errcode = '23503', message = 'inactive notification target';
    end if;

    if length(trim(coalesce(v_notification ->> 'title', ''))) not between 1 and 200
       or length(trim(coalesce(v_notification ->> 'body', ''))) not between 1 and 4000
       or length(trim(coalesce(v_notification ->> 'kind', ''))) not between 1 and 80 then
      raise exception using errcode = '22023', message = 'invalid notification';
    end if;

    v_notification_id := gen_random_uuid();
    insert into public.approval_notifications (
      id,
      approval_request_id,
      recipient_id,
      source_event_id,
      kind,
      title,
      body,
      href
    )
    values (
      v_notification_id,
      v_request.id,
      v_recipient.id,
      v_event_id,
      trim(v_notification ->> 'kind'),
      trim(v_notification ->> 'title'),
      trim(v_notification ->> 'body'),
      nullif(v_notification ->> 'href', '')
    );

    if coalesce((v_notification ->> 'sendEmail')::boolean, false) then
      insert into public.approval_email_outbox (
        notification_id,
        approval_request_id,
        recipient_id,
        recipient_email,
        template_key,
        payload
      )
      values (
        v_notification_id,
        v_request.id,
        v_recipient.id,
        v_recipient.email,
        left(coalesce(nullif(v_notification ->> 'templateKey', ''), 'approval-update'), 120),
        jsonb_build_object(
          'schemaVersion', 1,
          'notificationId', v_notification_id,
          'requestNo', v_request.request_no,
          'title', trim(v_notification ->> 'title'),
          'body', trim(v_notification ->> 'body'),
          'href', nullif(v_notification ->> 'href', '')
        )
      );
    end if;
  end loop;

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'commandId', v_command_id,
    'eventId', v_event_id,
    'currentVersion', v_result_request.state_version,
    'request', to_jsonb(v_result_request)
  );

  update public.approval_command_receipts
  set result = v_result,
      completed_at = statement_timestamp()
  where id = v_command_id;

  return v_result;
end;
$$;

revoke all on function public.commit_approval_request_command(
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated;
grant execute on function public.commit_approval_request_command(
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  jsonb,
  jsonb,
  jsonb
)
to service_role;
