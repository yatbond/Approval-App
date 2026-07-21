-- Phase 7: minimize Data API privileges, harden function configuration,
-- establish the private attachment bucket, and cover advisor-reported FKs.

alter function private.handle_new_user() set search_path = '';
alter function private.is_admin() set search_path = '';

revoke all privileges on table
  public.approval_actions,
  public.approval_tasks,
  public.delegations,
  public.notifications,
  public.parsed_documents,
  public.submission_files,
  public.submissions,
  public.departments,
  public.workflow_templates,
  public.workflow_fields,
  public.workflow_steps,
  public.business_units,
  public.business_departments,
  public.profiles,
  public.workflow_template_versions,
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_attachments,
  public.approval_request_participants,
  public.approval_request_assignments,
  public.approval_scoped_role_assignments,
  public.approval_command_receipts,
  public.approval_migration_issues,
  public.approval_notifications,
  public.approval_email_outbox,
  public.approval_scheduler_runs,
  public.workspace_snapshots,
  public.upload_request_drafts,
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events,
  public.workflow_operation_events,
  public.external_form_submissions
from anon, authenticated;

-- Only immutable, active legacy template metadata is public before sign-in.
grant select on table
  public.departments,
  public.workflow_templates,
  public.workflow_fields,
  public.workflow_steps
to anon;

grant select on table
  public.departments,
  public.workflow_templates,
  public.workflow_fields,
  public.workflow_steps,
  public.profiles,
  public.business_units,
  public.business_departments,
  public.workflow_template_versions,
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_attachments,
  public.approval_request_participants,
  public.approval_request_assignments,
  public.approval_scoped_role_assignments,
  public.approval_command_receipts,
  public.approval_migration_issues,
  public.approval_notifications,
  public.approval_email_outbox,
  public.approval_scheduler_runs,
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events,
  public.workflow_operation_events,
  public.workspace_snapshots,
  public.upload_request_drafts
to authenticated;

grant insert, update on public.business_units to authenticated;
grant insert, update on public.business_departments to authenticated;
grant insert, update on public.workflow_template_versions to authenticated;
grant insert, update on public.approval_request_attachments to authenticated;
grant insert on public.workflow_operation_events to authenticated;
grant insert, update on public.workspace_snapshots to authenticated;
grant insert, update, delete on public.upload_request_drafts to authenticated;

create index if not exists approval_scoped_roles_business_unit_idx
on public.approval_scoped_role_assignments (business_unit_id)
where business_unit_id is not null;

create index if not exists approval_scoped_roles_created_by_idx
on public.approval_scoped_role_assignments (created_by)
where created_by is not null;

create index if not exists approval_scoped_roles_department_idx
on public.approval_scoped_role_assignments (department_id)
where department_id is not null;

create index if not exists approval_scoped_roles_workflow_template_idx
on public.approval_scoped_role_assignments (workflow_template_id)
where workflow_template_id is not null;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'approval-documents',
  'approval-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/octet-stream',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "approval document owners insert" on storage.objects;
drop policy if exists "approval document owners update" on storage.objects;
drop policy if exists "approval document owners delete" on storage.objects;
drop policy if exists "approval document owners read" on storage.objects;
drop policy if exists "approval document owners and request participants read" on storage.objects;

create policy "approval document owners insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'approval-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "approval document owners update"
on storage.objects for update to authenticated
using (
  bucket_id = 'approval-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'approval-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "approval document owners delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'approval-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "approval document owners and request participants read"
on storage.objects for select to authenticated
using (
  bucket_id = 'approval-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.approval_request_attachments a
      where a.storage_path = storage.objects.name
        and private.can_read_approval_request(a.approval_request_id, (select auth.uid()))
    )
  )
);

create or replace function public.get_approval_operational_metrics()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'databaseConnections', (
      select count(*) from pg_catalog.pg_stat_activity
      where datname = current_database()
    ),
    'databaseConnectionLimit', (
      select setting::integer from pg_catalog.pg_settings where name = 'max_connections'
    ),
    'lockWaits', (
      select count(*) from pg_catalog.pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    ),
    'outboxPending', (
      select count(*) from public.approval_email_outbox
      where status in ('pending', 'retry', 'processing')
    ),
    'outboxFailed', (
      select count(*) from public.approval_email_outbox where status = 'failed'
    ),
    'oldestPendingSeconds', (
      select coalesce(extract(epoch from (clock_timestamp() - min(created_at))), 0)::integer
      from public.approval_email_outbox
      where status in ('pending', 'retry', 'processing')
    ),
    'schedulerLastCompletedAt', (
      select completed_at from public.approval_scheduler_runs
      where status = 'completed' order by completed_at desc nulls last limit 1
    ),
    'schedulerLastFailedAt', (
      select completed_at from public.approval_scheduler_runs
      where status = 'failed' order by completed_at desc nulls last limit 1
    )
  );
$$;

revoke all on function public.get_approval_operational_metrics() from public, anon, authenticated;
grant execute on function public.get_approval_operational_metrics() to service_role;
