-- Phase 8: server-owned rollout controls, deterministic reconciliation,
-- read-comparison evidence, and an irreversible browser/service freeze on
-- obsolete shared runtime tables. Rollback is read-only and never restores
-- legacy writes.

create table if not exists public.approval_rollout_settings (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'authoritative'
    check (mode in ('read_compare', 'cohort', 'authoritative', 'rollback_read_only')),
  cohort_percentage integer not null default 100
    check (cohort_percentage between 0 and 100),
  legacy_read_fallback_until timestamptz,
  legacy_writes_frozen boolean not null default true check (legacy_writes_frozen),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  reason text not null default '' check (length(reason) <= 1000)
);

create table if not exists public.approval_rollout_events (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  cohort_percentage integer not null,
  legacy_read_fallback_until timestamptz,
  actor_id uuid references public.profiles(id),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.approval_read_comparison_mismatches (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_key text not null,
  canonical_hash text not null,
  legacy_hash text not null,
  canonical_projection jsonb not null default '{}'::jsonb,
  legacy_projection jsonb not null default '{}'::jsonb,
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (entity_type, entity_key)
);

insert into public.approval_rollout_settings (
  singleton, mode, cohort_percentage, legacy_read_fallback_until,
  legacy_writes_frozen, reason
)
values (
  true, 'authoritative', 100, now() + interval '7 days', true,
  'Phase 8 authoritative cutover with a time-bounded read-only cache fallback.'
)
on conflict (singleton) do nothing;

create index if not exists approval_rollout_events_created_idx
on public.approval_rollout_events (created_at desc, id desc);

create index if not exists approval_rollout_events_actor_idx
on public.approval_rollout_events (actor_id)
where actor_id is not null;

create index if not exists approval_rollout_settings_updated_by_idx
on public.approval_rollout_settings (updated_by)
where updated_by is not null;

create index if not exists approval_read_mismatches_unresolved_idx
on public.approval_read_comparison_mismatches (last_seen_at desc, id)
where resolved_at is null;

alter table public.approval_rollout_settings enable row level security;
alter table public.approval_rollout_events enable row level security;
alter table public.approval_read_comparison_mismatches enable row level security;

create policy "admins read rollout settings"
on public.approval_rollout_settings for select to authenticated
using ((select private.is_admin()));

create policy "admins read rollout events"
on public.approval_rollout_events for select to authenticated
using ((select private.is_admin()));

create policy "admins read read comparison mismatches"
on public.approval_read_comparison_mismatches for select to authenticated
using ((select private.is_admin()));

revoke all privileges on table
  public.approval_rollout_settings,
  public.approval_rollout_events,
  public.approval_read_comparison_mismatches
from public, anon, authenticated;

grant select on table
  public.approval_rollout_settings,
  public.approval_rollout_events,
  public.approval_read_comparison_mismatches
to authenticated;

grant select, insert, update on table public.approval_rollout_settings to service_role;
grant select, insert on table public.approval_rollout_events to service_role;
grant select, insert, update on table public.approval_read_comparison_mismatches to service_role;

create trigger approval_rollout_events_append_only
before update or delete on public.approval_rollout_events
for each row execute function private.prevent_approval_event_mutation();

create or replace function public.get_approval_rollout_decision(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_setting public.approval_rollout_settings%rowtype;
  v_bucket integer;
  v_enabled boolean;
begin
  select * into v_setting
  from public.approval_rollout_settings
  where singleton;

  if not found then
    return jsonb_build_object(
      'mode', 'rollback_read_only',
      'commandEnabled', false,
      'cohortBucket', null,
      'legacyReadFallbackAllowed', false,
      'legacyReadFallbackUntil', null,
      'legacyWritesFrozen', true
    );
  end if;

  v_bucket := mod((('x' || substr(md5(p_actor_id::text), 1, 8))::bit(32)::bigint), 100)::integer;
  v_enabled := case v_setting.mode
    when 'authoritative' then true
    when 'cohort' then v_bucket < v_setting.cohort_percentage
    else false
  end;

  return jsonb_build_object(
    'mode', v_setting.mode,
    'commandEnabled', v_enabled,
    'cohortBucket', v_bucket,
    'cohortPercentage', v_setting.cohort_percentage,
    'legacyReadFallbackAllowed',
      v_setting.legacy_read_fallback_until is not null
      and v_setting.legacy_read_fallback_until > statement_timestamp(),
    'legacyReadFallbackUntil', v_setting.legacy_read_fallback_until,
    'legacyWritesFrozen', true
  );
end;
$$;

create or replace function public.set_approval_rollout_state(
  p_mode text,
  p_cohort_percentage integer,
  p_legacy_read_fallback_until timestamptz,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_setting public.approval_rollout_settings%rowtype;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_mode not in ('read_compare', 'cohort', 'authoritative', 'rollback_read_only')
     or p_cohort_percentage < 0 or p_cohort_percentage > 100
     or length(trim(coalesce(p_reason, ''))) < 8
     or length(trim(p_reason)) > 1000 then
    raise exception using errcode = '22023', message = 'invalid rollout state';
  end if;
  if p_mode = 'authoritative' and p_cohort_percentage <> 100 then
    raise exception using errcode = '22023', message = 'authoritative rollout requires 100 percent';
  end if;
  if p_legacy_read_fallback_until > statement_timestamp() + interval '30 days' then
    raise exception using errcode = '22023', message = 'legacy read fallback cannot exceed 30 days';
  end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and is_active) then
    raise exception using errcode = '22023', message = 'active rollout actor required';
  end if;

  update public.approval_rollout_settings
  set mode = p_mode,
      cohort_percentage = p_cohort_percentage,
      legacy_read_fallback_until = p_legacy_read_fallback_until,
      legacy_writes_frozen = true,
      updated_by = p_actor_id,
      updated_at = statement_timestamp(),
      reason = left(trim(p_reason), 1000)
  where singleton
  returning * into v_setting;

  insert into public.approval_rollout_events (
    mode, cohort_percentage, legacy_read_fallback_until, actor_id, reason
  ) values (
    v_setting.mode, v_setting.cohort_percentage,
    v_setting.legacy_read_fallback_until, p_actor_id, v_setting.reason
  );

  return jsonb_build_object(
    'mode', v_setting.mode,
    'cohortPercentage', v_setting.cohort_percentage,
    'legacyReadFallbackUntil', v_setting.legacy_read_fallback_until,
    'legacyWritesFrozen', true,
    'updatedAt', v_setting.updated_at
  );
end;
$$;

create or replace function public.reconcile_approval_legacy_runtime(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}'::uuid[];
  v_requesters integer := 0;
  v_owners integer := 0;
  v_snapshots integer := 0;
  v_templates integer := 0;
  v_participants integer := 0;
  v_assignments integer := 0;
  v_issues integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid reconciliation limit';
  end if;

  select coalesce(array_agg(candidate.id), '{}'::uuid[]) into v_ids
  from (
    select r.id
    from public.approval_requests r
    where
      not (r.task_snapshot ? 'schemaVersion')
      or r.task_snapshot ->> 'id' is distinct from r.request_no
      or r.task_snapshot ->> 'status' is distinct from r.status
      or r.task_snapshot ->> 'currentOwner' is distinct from coalesce(r.current_owner_email, '')
      or r.task_snapshot ->> 'currentStep' is distinct from coalesce(r.current_step, '')
      or r.task_snapshot ->> 'lastAction' is distinct from coalesce(r.last_action, '')
      or r.task_snapshot -> 'participants' is distinct from to_jsonb(r.participants)
      or (
        (
          r.pinned_template_snapshot = '{}'::jsonb
          or not (r.pinned_template_snapshot ? 'schemaVersion')
          or (
            not (r.pinned_template_snapshot ? 'graph')
            and not (r.pinned_template_snapshot ? 'steps')
          )
        )
        and (
          exists (
            select 1 from public.workflow_template_versions template_version
            where template_version.id = r.workflow_template_version_id
          )
          or not exists (
            select 1 from public.approval_migration_issues issue
            where issue.entity_type = 'approval_request'
              and issue.entity_id = r.id::text
              and issue.field_name = 'pinned_template_snapshot'
              and issue.resolved_at is null
          )
        )
      )
      or (
        r.requester_id is null
        and not exists (
          select 1 from public.approval_migration_issues issue
          where issue.entity_type = 'approval_request'
            and issue.entity_id = r.id::text
            and issue.field_name = 'requester_email'
            and issue.resolved_at is null
        )
      )
      or (
        r.current_owner_id is null
        and nullif(trim(r.current_owner_email), '') is not null
        and not exists (
          select 1 from public.approval_migration_issues issue
          where issue.entity_type = 'approval_request'
            and issue.entity_id = r.id::text
            and issue.field_name = 'current_owner_email'
            and issue.resolved_at is null
        )
      )
      or exists (
        select 1
        from unnest(r.participants) legacy(email)
        left join public.profiles p
          on lower(p.email) = lower(legacy.email) and p.is_active
        where (
          p.id is not null and not exists (
            select 1 from public.approval_request_participants participant
            where participant.approval_request_id = r.id
              and participant.profile_id = p.id
          )
        ) or (
          p.id is null and not exists (
            select 1 from public.approval_migration_issues issue
            where issue.entity_type = 'approval_request'
              and issue.entity_id = r.id::text
              and issue.field_name = 'participants'
              and lower(issue.legacy_value) = lower(legacy.email)
              and issue.resolved_at is null
          )
        )
      )
      or (
        r.current_owner_id is not null
        and not exists (
          select 1 from public.approval_request_participants participant
          where participant.approval_request_id = r.id
            and participant.profile_id = r.current_owner_id
        )
      )
      or (
        r.current_owner_id is not null
        and r.status in ('pending', 'overdue', 'escalated', 'reassigned', 'delegated')
        and not exists (
          select 1 from public.approval_request_assignments assignment
          where assignment.approval_request_id = r.id
            and assignment.workflow_node_id = coalesce(r.current_node_id, '')
            and assignment.assignee_id = r.current_owner_id
            and assignment.assignment_type = 'owner'
            and assignment.status = 'active'
        )
      )
    order by r.submitted_at, r.id
    limit p_limit
  ) candidate;

  update public.approval_requests r
  set requester_id = p.id
  from public.profiles p
  where r.id = any(v_ids) and r.requester_id is null
    and lower(p.email) = lower(r.requester_email) and p.is_active;
  get diagnostics v_requesters = row_count;

  update public.approval_requests r
  set current_owner_id = p.id
  from public.profiles p
  where r.id = any(v_ids) and r.current_owner_id is null
    and nullif(trim(r.current_owner_email), '') is not null
    and lower(p.email) = lower(r.current_owner_email) and p.is_active;
  get diagnostics v_owners = row_count;

  update public.approval_requests r
  set task_snapshot = r.task_snapshot || jsonb_build_object(
    'schemaVersion', 1,
    'id', r.request_no,
    'status', r.status,
    'currentOwner', coalesce(r.current_owner_email, ''),
    'currentStep', coalesce(r.current_step, ''),
    'lastAction', coalesce(r.last_action, ''),
    'participants', to_jsonb(r.participants)
  )
  where r.id = any(v_ids)
    and (
      not (r.task_snapshot ? 'schemaVersion')
      or r.task_snapshot ->> 'id' is distinct from r.request_no
      or r.task_snapshot ->> 'status' is distinct from r.status
      or r.task_snapshot ->> 'currentOwner' is distinct from coalesce(r.current_owner_email, '')
      or r.task_snapshot ->> 'currentStep' is distinct from coalesce(r.current_step, '')
      or r.task_snapshot ->> 'lastAction' is distinct from coalesce(r.last_action, '')
      or r.task_snapshot -> 'participants' is distinct from to_jsonb(r.participants)
    );
  get diagnostics v_snapshots = row_count;

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
  where r.id = any(v_ids)
    and v.id = r.workflow_template_version_id
    and (
      r.pinned_template_snapshot = '{}'::jsonb
      or not (r.pinned_template_snapshot ? 'schemaVersion')
      or (
        not (r.pinned_template_snapshot ? 'graph')
        and not (r.pinned_template_snapshot ? 'steps')
      )
    );
  get diagnostics v_templates = row_count;

  insert into public.approval_migration_issues (
    entity_type, entity_id, field_name, legacy_value, reason
  )
  select 'approval_request', r.id::text, 'pinned_template_snapshot',
    left(r.pinned_template_snapshot::text, 1000),
    'The pinned template snapshot is incomplete and no matching template version is available.'
  from public.approval_requests r
  where r.id = any(v_ids)
    and (
      r.pinned_template_snapshot = '{}'::jsonb
      or not (r.pinned_template_snapshot ? 'schemaVersion')
      or (
        not (r.pinned_template_snapshot ? 'graph')
        and not (r.pinned_template_snapshot ? 'steps')
      )
    )
    and not exists (
      select 1 from public.workflow_template_versions template_version
      where template_version.id = r.workflow_template_version_id
    )
  on conflict do nothing;

  insert into public.approval_migration_issues (
    entity_type, entity_id, field_name, legacy_value, reason
  )
  select 'approval_request', r.id::text, 'requester_email', coalesce(r.requester_email, ''),
    'No active profile matched the legacy requester email.'
  from public.approval_requests r
  where r.id = any(v_ids) and r.requester_id is null
  on conflict do nothing;

  insert into public.approval_migration_issues (
    entity_type, entity_id, field_name, legacy_value, reason
  )
  select 'approval_request', r.id::text, 'current_owner_email', coalesce(r.current_owner_email, ''),
    'No active profile matched the legacy current owner email.'
  from public.approval_requests r
  where r.id = any(v_ids) and r.current_owner_id is null
    and nullif(trim(r.current_owner_email), '') is not null
  on conflict do nothing;

  insert into public.approval_migration_issues (
    entity_type, entity_id, field_name, legacy_value, reason
  )
  select 'approval_request', r.id::text, 'participants', legacy.email,
    'No active profile matched the legacy participant email.'
  from public.approval_requests r
  cross join lateral unnest(r.participants) legacy(email)
  left join public.profiles p on lower(p.email) = lower(legacy.email) and p.is_active
  where r.id = any(v_ids) and p.id is null
  on conflict do nothing;

  update public.approval_migration_issues issue
  set resolved_at = statement_timestamp()
  from public.approval_requests r
  where issue.entity_type = 'approval_request'
    and issue.entity_id = r.id::text and r.id = any(v_ids)
    and issue.resolved_at is null
    and (
      (issue.field_name = 'requester_email' and r.requester_id is not null)
      or (issue.field_name = 'current_owner_email' and r.current_owner_id is not null)
      or (
        issue.field_name = 'pinned_template_snapshot'
        and r.pinned_template_snapshot ? 'schemaVersion'
        and (
          r.pinned_template_snapshot ? 'graph'
          or r.pinned_template_snapshot ? 'steps'
        )
      )
      or (issue.field_name = 'participants' and exists (
        select 1 from public.profiles p
        where lower(p.email) = lower(issue.legacy_value) and p.is_active
      ))
    );

  insert into public.approval_request_participants (
    approval_request_id, profile_id, participant_role, visibility_reason, created_by
  )
  select r.id, r.requester_id, 'requester', 'Phase 8 legacy requester reconciliation', r.requester_id
  from public.approval_requests r
  where r.id = any(v_ids) and r.requester_id is not null
  on conflict do nothing;
  get diagnostics v_participants = row_count;

  insert into public.approval_request_participants (
    approval_request_id, profile_id, participant_role, visibility_reason, created_by
  )
  select distinct r.id, p.id,
    case when p.id = r.current_owner_id then 'owner' else 'observer' end,
    'Phase 8 legacy participant reconciliation', r.requester_id
  from public.approval_requests r
  cross join lateral unnest(r.participants) legacy(email)
  join public.profiles p on lower(p.email) = lower(legacy.email) and p.is_active
  where r.id = any(v_ids)
  on conflict do nothing;
  get diagnostics v_issues = row_count;
  v_participants := v_participants + v_issues;

  insert into public.approval_request_participants (
    approval_request_id, profile_id, participant_role, visibility_reason,
    workflow_node_id, created_by
  )
  select r.id, r.current_owner_id, 'owner', 'Phase 8 current owner reconciliation',
    coalesce(r.current_node_id, ''), r.requester_id
  from public.approval_requests r
  where r.id = any(v_ids) and r.current_owner_id is not null
  on conflict do nothing;
  get diagnostics v_issues = row_count;
  v_participants := v_participants + v_issues;

  insert into public.approval_request_assignments (
    approval_request_id, workflow_node_id, assignee_id, assignment_type,
    status, assigned_by, starts_at, reason
  )
  select r.id, coalesce(r.current_node_id, ''), r.current_owner_id,
    'owner', 'active', r.requester_id, r.submitted_at,
    'Phase 8 current owner reconciliation'
  from public.approval_requests r
  join public.profiles p on p.id = r.current_owner_id and p.is_active
  where r.id = any(v_ids)
    and r.status in ('pending', 'overdue', 'escalated', 'reassigned', 'delegated')
    and not exists (
      select 1 from public.approval_request_assignments a
      where a.approval_request_id = r.id
        and a.workflow_node_id = coalesce(r.current_node_id, '')
        and a.assignee_id = r.current_owner_id
        and a.assignment_type = 'owner' and a.status = 'active'
    );
  get diagnostics v_assignments = row_count;

  select count(*) into v_issues
  from public.approval_migration_issues
  where resolved_at is null and entity_type = 'approval_request'
    and entity_id = any(v_ids::text[]);

  return jsonb_build_object(
    'scanned', cardinality(v_ids),
    'requestersResolved', v_requesters,
    'ownersResolved', v_owners,
    'snapshotsReconciled', v_snapshots,
    'templatesReconciled', v_templates,
    'participantsAdded', v_participants,
    'assignmentsAdded', v_assignments,
    'unresolvedIssues', v_issues
  );
end;
$$;

create or replace function public.audit_approval_runtime_projections(
  p_request_no text default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_canonical jsonb;
  v_legacy jsonb;
  v_scanned integer := 0;
  v_mismatches integer := 0;
  v_resolved integer := 0;
  v_rows integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_limit < 1 or p_limit > 5000 or length(coalesce(p_request_no, '')) > 100 then
    raise exception using errcode = '22023', message = 'invalid comparison request';
  end if;

  for v_row in
    select r.* from public.approval_requests r
    where p_request_no is null or r.request_no = p_request_no
    order by exists (
      select 1 from public.approval_read_comparison_mismatches mismatch
      where mismatch.entity_type = 'approval_request'
        and mismatch.entity_key = r.request_no
        and mismatch.resolved_at is null
    ) desc, r.updated_at desc, r.id desc
    limit p_limit
  loop
    v_scanned := v_scanned + 1;
    v_canonical := jsonb_build_object(
      'id', v_row.request_no,
      'status', v_row.status,
      'currentOwner', coalesce(v_row.current_owner_email, ''),
      'currentStep', coalesce(v_row.current_step, ''),
      'lastAction', coalesce(v_row.last_action, ''),
      'participants', to_jsonb(v_row.participants)
    );
    v_legacy := jsonb_build_object(
      'id', coalesce(v_row.task_snapshot ->> 'id', ''),
      'status', coalesce(v_row.task_snapshot ->> 'status', ''),
      'currentOwner', coalesce(v_row.task_snapshot ->> 'currentOwner', ''),
      'currentStep', coalesce(v_row.task_snapshot ->> 'currentStep', ''),
      'lastAction', coalesce(v_row.task_snapshot ->> 'lastAction', ''),
      'participants', coalesce(v_row.task_snapshot -> 'participants', '[]'::jsonb)
    );

    if v_canonical is distinct from v_legacy then
      v_mismatches := v_mismatches + 1;
      insert into public.approval_read_comparison_mismatches (
        entity_type, entity_key, canonical_hash, legacy_hash,
        canonical_projection, legacy_projection
      ) values (
        'approval_request', v_row.request_no, md5(v_canonical::text), md5(v_legacy::text),
        v_canonical, v_legacy
      )
      on conflict (entity_type, entity_key) do update set
        canonical_hash = excluded.canonical_hash,
        legacy_hash = excluded.legacy_hash,
        canonical_projection = excluded.canonical_projection,
        legacy_projection = excluded.legacy_projection,
        occurrences = public.approval_read_comparison_mismatches.occurrences + 1,
        last_seen_at = statement_timestamp(),
        resolved_at = null;
    else
      update public.approval_read_comparison_mismatches
      set resolved_at = statement_timestamp(), last_seen_at = statement_timestamp()
      where entity_type = 'approval_request' and entity_key = v_row.request_no
        and resolved_at is null;
      get diagnostics v_rows = row_count;
      v_resolved := v_resolved + v_rows;
    end if;
  end loop;

  return jsonb_build_object(
    'scanned', v_scanned,
    'mismatches', v_mismatches,
    'resolved', v_resolved
  );
end;
$$;

revoke all on function public.get_approval_rollout_decision(uuid) from public, anon, authenticated;
revoke all on function public.set_approval_rollout_state(text, integer, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.reconcile_approval_legacy_runtime(integer) from public, anon, authenticated;
revoke all on function public.audit_approval_runtime_projections(text, integer) from public, anon, authenticated;
grant execute on function public.get_approval_rollout_decision(uuid) to service_role;
grant execute on function public.set_approval_rollout_state(text, integer, timestamptz, uuid, text) to service_role;
grant execute on function public.reconcile_approval_legacy_runtime(integer) to service_role;
grant execute on function public.audit_approval_runtime_projections(text, integer) to service_role;

create or replace function private.reject_legacy_runtime_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('legacy runtime writes are frozen: %I.%I', tg_table_schema, tg_table_name);
end;
$$;

revoke all on function private.reject_legacy_runtime_write() from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'approval_actions', 'approval_tasks', 'delegations', 'notifications',
    'parsed_documents', 'submission_files', 'submissions'
  ] loop
    execute format('drop trigger if exists legacy_runtime_write_frozen on public.%I', v_table);
    execute format(
      'create trigger legacy_runtime_write_frozen before insert or update or delete on public.%I for each row execute function private.reject_legacy_runtime_write()',
      v_table
    );
  end loop;
end
$$;

-- The incremental migration reconciles production-shaped rows in bounded
-- batches; operators repeat the service-only function until scanned/issue
-- counts are accepted before cohort enablement.
select public.reconcile_approval_legacy_runtime(10000);
select public.audit_approval_runtime_projections(null, 5000);
