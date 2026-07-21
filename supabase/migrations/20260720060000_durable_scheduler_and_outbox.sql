-- Phase 6: durable, browser-independent escalation and notification delivery.

create table if not exists public.approval_scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  scheduled_for timestamptz not null,
  status text not null default 'running',
  claimed_count integer not null default 0,
  escalated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (length(run_key) between 8 and 200),
  check (status in ('running', 'completed', 'failed')),
  check (claimed_count >= 0 and escalated_count >= 0 and skipped_count >= 0 and error_count >= 0)
);

alter table public.approval_email_outbox
  add column if not exists max_attempts integer not null default 5,
  add column if not exists lease_owner text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists failure_class text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'approval_email_outbox_max_attempts_check'
      and conrelid = 'public.approval_email_outbox'::regclass
  ) then
    alter table public.approval_email_outbox
      add constraint approval_email_outbox_max_attempts_check
      check (max_attempts between 1 and 20);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'approval_email_outbox_failure_class_check'
      and conrelid = 'public.approval_email_outbox'::regclass
  ) then
    alter table public.approval_email_outbox
      add constraint approval_email_outbox_failure_class_check
      check (failure_class is null or failure_class in ('retryable', 'permanent', 'exhausted'));
  end if;
end
$$;

create index if not exists approval_scheduler_runs_started_idx
on public.approval_scheduler_runs (started_at desc, id desc);

drop index if exists public.approval_email_outbox_due_idx;
create index approval_email_outbox_due_idx
on public.approval_email_outbox (status, next_attempt_at, id)
where status in ('pending', 'retry', 'processing');

alter table public.approval_scheduler_runs enable row level security;

create policy "admins read scheduler runs"
on public.approval_scheduler_runs for select
to authenticated
using ((select private.is_active_approval_admin((select auth.uid()))));

revoke all privileges on table public.approval_scheduler_runs from public, anon, authenticated;
grant select on public.approval_scheduler_runs to authenticated;
grant select, insert, update on public.approval_scheduler_runs to service_role;

-- Each due request is locked before its transition. The event, notifications,
-- email outbox, normalized ownership, and compatibility snapshot commit together.
create or replace function public.run_approval_escalation_scheduler(
  p_run_key text,
  p_now timestamptz default statement_timestamp(),
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_run public.approval_scheduler_runs%rowtype;
  v_request public.approval_requests%rowtype;
  v_node jsonb;
  v_target public.profiles%rowtype;
  v_event_id uuid;
  v_notification_id uuid;
  v_claimed integer := 0;
  v_escalated integer := 0;
  v_skipped integer := 0;
  v_event_detail text;
  v_next_version bigint;
  v_next_pending text[];
  v_next_participants text[];
  v_next_snapshot jsonb;
  v_recipient public.profiles%rowtype;
  v_assignment public.approval_request_assignments%rowtype;
  v_delegate public.profiles%rowtype;
  v_expired_delegations integer := 0;
begin
  if length(trim(coalesce(p_run_key, ''))) not between 8 and 200
     or p_limit not between 1 and 500 then
    return jsonb_build_object('outcome', 'invalid_run');
  end if;

  insert into public.approval_scheduler_runs (run_key, scheduled_for)
  values (trim(p_run_key), p_now)
  on conflict (run_key) do nothing
  returning * into v_run;

  if not found then
    select * into v_run
    from public.approval_scheduler_runs
    where run_key = trim(p_run_key);
    return jsonb_build_object(
      'outcome', 'replayed',
      'runId', v_run.id,
      'status', v_run.status,
      'claimed', v_run.claimed_count,
      'escalated', v_run.escalated_count,
      'skipped', v_run.skipped_count
    );
  end if;

  for v_assignment in
    select a.*
    from public.approval_request_assignments a
    where a.assignment_type = 'delegate'
      and a.status in ('active', 'accepted')
      and a.expires_at is not null
      and a.expires_at <= p_now
    order by a.expires_at, a.id
    for update of a skip locked
    limit p_limit
  loop
    select * into v_request from public.approval_requests
    where id = v_assignment.approval_request_id for update;
    select * into v_delegate from public.profiles where id = v_assignment.assignee_id;
    if not found then
      update public.approval_request_assignments
      set status = 'expired', ended_at = p_now, updated_at = p_now,
          reason = 'Expired by approval scheduler'
      where id = v_assignment.id;
      continue;
    end if;

    v_next_version := v_request.state_version + 1;
    v_next_pending := array(
      select email from unnest(v_request.pending_owner_emails) email
      where lower(email) <> lower(v_delegate.email)
    );
    v_event_detail := concat('Delegation to ', v_delegate.full_name, ' expired.');
    v_next_snapshot := coalesce(v_request.task_snapshot, '{}'::jsonb);
    v_next_snapshot := jsonb_set(
      v_next_snapshot, '{status}',
      to_jsonb(case when v_request.status = 'delegated' then 'pending' else v_request.status end),
      true
    );
    v_next_snapshot := jsonb_set(v_next_snapshot, '{pendingOwners}', to_jsonb(v_next_pending), true);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{lastAction}', to_jsonb(v_event_detail), true);

    update public.approval_request_assignments
    set status = 'expired', ended_at = p_now, updated_at = p_now,
        reason = 'Expired by approval scheduler'
    where id = v_assignment.id;
    update public.approval_requests
    set state_version = v_next_version,
        status = case when status = 'delegated' then 'pending' else status end,
        pending_owner_emails = v_next_pending,
        last_action = left(v_event_detail, 500),
        task_snapshot = v_next_snapshot,
        updated_at = p_now
    where id = v_request.id;

    v_event_id := gen_random_uuid();
    insert into public.approval_request_events (
      id, approval_request_id, event_key, request_version, schema_version,
      action, event_type, actor_name, actor_email, detail, details,
      target_id, target_email, created_at
    ) values (
      v_event_id, v_request.id, concat('scheduler-delegation-expired:', v_assignment.id),
      v_next_version, 1, 'delegated', 'delegation_expired', 'Approval scheduler',
      'system@example.com', left(v_event_detail, 4000),
      jsonb_build_object('source', 'durable_scheduler', 'runId', v_run.id,
        'assignmentId', v_assignment.id, 'expiredAt', v_assignment.expires_at),
      v_delegate.id, v_delegate.email, p_now
    );

    for v_recipient in
      select p.* from public.profiles p
      where p.is_active and p.id in (v_request.current_owner_id, v_delegate.id)
    loop
      v_notification_id := gen_random_uuid();
      insert into public.approval_notifications (
        id, approval_request_id, recipient_id, source_event_id,
        kind, title, body, href, created_at
      ) values (
        v_notification_id, v_request.id, v_recipient.id, v_event_id,
        'delegation_expired', concat('Delegation expired for ', v_request.request_no),
        left(v_event_detail, 4000), concat('/?tab=tracking&request=', v_request.request_no), p_now
      );
      insert into public.approval_email_outbox (
        notification_id, approval_request_id, recipient_id, recipient_email,
        template_key, payload, next_attempt_at, created_at, updated_at
      ) values (
        v_notification_id, v_request.id, v_recipient.id, v_recipient.email,
        'delegation-expired', jsonb_build_object(
          'schemaVersion', 1, 'notificationId', v_notification_id,
          'requestNo', v_request.request_no,
          'title', concat('Delegation expired for ', v_request.request_no),
          'body', left(v_event_detail, 4000),
          'href', concat('/?tab=tracking&request=', v_request.request_no)
        ), p_now, p_now, p_now
      );
    end loop;
    v_expired_delegations := v_expired_delegations + 1;
  end loop;

  for v_request in
    select r.*
    from public.approval_requests r
    where r.due_at is not null
      and r.due_at <= p_now
      and r.status in ('pending', 'overdue', 'delegated', 'reassigned')
    order by r.due_at, r.id
    for update of r skip locked
    limit p_limit
  loop
    v_claimed := v_claimed + 1;
    v_node := null;

    select node.value into v_node
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_request.pinned_template_snapshot -> 'graph' -> 'nodes') = 'array'
          then v_request.pinned_template_snapshot -> 'graph' -> 'nodes'
        else '[]'::jsonb
      end
    ) as node(value)
    where node.value ->> 'id' = v_request.current_node_id
    limit 1;

    select p.* into v_target
    from public.profiles p
    where p.is_active
      and lower(p.email) = lower(trim(coalesce(v_node ->> 'escalationEmail', '')))
    limit 1;

    if not found then
      if v_request.status = 'pending' then
        update public.approval_requests
        set status = 'overdue',
            task_snapshot = jsonb_set(
              coalesce(v_request.task_snapshot, '{}'::jsonb),
              '{status}', '"overdue"'::jsonb, true
            ),
            updated_at = p_now
        where id = v_request.id;
      end if;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_next_version := v_request.state_version + 1;
    v_next_pending := case
      when cardinality(v_request.pending_owner_emails) = 0 then v_request.pending_owner_emails
      else array(
        select distinct case
          when lower(email) = lower(coalesce(v_request.current_owner_email, '')) then v_target.email
          else email
        end
        from unnest(v_request.pending_owner_emails) email
      )
    end;
    v_next_participants := array(
      select distinct email
      from unnest(v_request.participants || array[v_target.email]) email
      where nullif(trim(email), '') is not null
    );
    v_event_detail := concat(
      'Due time passed; routed to ',
      coalesce(nullif(trim(v_node ->> 'escalationName'), ''), v_target.full_name, v_target.email),
      '.'
    );
    v_next_snapshot := coalesce(v_request.task_snapshot, '{}'::jsonb);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{status}', '"escalated"'::jsonb, true);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{currentOwner}', to_jsonb(v_target.email), true);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{pendingOwners}', to_jsonb(v_next_pending), true);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{participants}', to_jsonb(v_next_participants), true);
    v_next_snapshot := jsonb_set(v_next_snapshot, '{lastAction}', to_jsonb(left(v_event_detail, 500)), true);

    update public.approval_requests
    set state_version = v_next_version,
        status = 'escalated',
        current_owner_id = v_target.id,
        current_owner_email = v_target.email,
        pending_owner_emails = v_next_pending,
        participants = v_next_participants,
        escalated_at = p_now,
        last_action = left(v_event_detail, 500),
        task_snapshot = v_next_snapshot,
        updated_at = p_now
    where id = v_request.id;

    update public.approval_request_assignments
    set status = 'completed', ended_at = p_now, updated_at = p_now,
        reason = 'Superseded by scheduler escalation'
    where approval_request_id = v_request.id
      and status in ('active', 'accepted')
      and assignee_id <> v_target.id;

    insert into public.approval_request_assignments (
      approval_request_id, workflow_node_id, assignee_id, assignment_type,
      status, starts_at, reason
    )
    select v_request.id, coalesce(v_request.current_node_id, ''), v_target.id,
      'owner', 'active', p_now, 'Current owner after scheduler escalation'
    where not exists (
      select 1 from public.approval_request_assignments a
      where a.approval_request_id = v_request.id
        and a.workflow_node_id = coalesce(v_request.current_node_id, '')
        and a.assignee_id = v_target.id
        and a.status in ('active', 'accepted')
    );

    insert into public.approval_request_participants (
      approval_request_id, profile_id, participant_role, visibility_reason,
      workflow_node_id, active_from
    ) values (
      v_request.id, v_target.id, 'owner', 'Scheduler escalation target',
      coalesce(v_request.current_node_id, ''), p_now
    )
    on conflict (approval_request_id, profile_id, participant_role, workflow_node_id)
    do update set is_active = true, active_until = null, updated_at = p_now;

    v_event_id := gen_random_uuid();
    insert into public.approval_request_events (
      id, approval_request_id, event_key, request_version, schema_version,
      action, event_type, actor_name, actor_email, detail, details,
      target_id, target_email, created_at
    ) values (
      v_event_id, v_request.id, concat('scheduler-escalation:', v_request.id),
      v_next_version, 1, 'escalated', 'escalate', 'Approval scheduler',
      'system@example.com', left(v_event_detail, 4000),
      jsonb_build_object(
        'source', 'durable_scheduler',
        'runId', v_run.id,
        'scheduledFor', p_now,
        'previousVersion', v_request.state_version,
        'resultingVersion', v_next_version,
        'previousStatus', v_request.status,
        'resultingStatus', 'escalated'
      ),
      v_target.id, v_target.email, p_now
    );

    for v_recipient in
      select p.* from public.profiles p
      where p.is_active and p.id in (v_target.id, v_request.requester_id)
    loop
      v_notification_id := gen_random_uuid();
      insert into public.approval_notifications (
        id, approval_request_id, recipient_id, source_event_id,
        kind, title, body, href, created_at
      ) values (
        v_notification_id, v_request.id, v_recipient.id, v_event_id,
        'escalation', concat('Approval request ', v_request.request_no, ' escalated'),
        left(v_event_detail, 4000),
        concat('/?tab=tracking&request=', v_request.request_no), p_now
      );
      insert into public.approval_email_outbox (
        notification_id, approval_request_id, recipient_id, recipient_email,
        template_key, payload, next_attempt_at, created_at, updated_at
      ) values (
        v_notification_id, v_request.id, v_recipient.id, v_recipient.email,
        'approval-escalation',
        jsonb_build_object(
          'schemaVersion', 1,
          'notificationId', v_notification_id,
          'requestNo', v_request.request_no,
          'title', concat('Approval request ', v_request.request_no, ' escalated'),
          'body', left(v_event_detail, 4000),
          'href', concat('/?tab=tracking&request=', v_request.request_no)
        ),
        p_now, p_now, p_now
      );
    end loop;

    v_escalated := v_escalated + 1;
  end loop;

  update public.approval_scheduler_runs
  set status = 'completed', claimed_count = v_claimed,
      escalated_count = v_escalated, skipped_count = v_skipped,
      completed_at = statement_timestamp(),
      details = jsonb_build_object('limit', p_limit, 'expiredDelegations', v_expired_delegations)
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'outcome', 'completed', 'runId', v_run.id,
    'claimed', v_claimed, 'escalated', v_escalated, 'skipped', v_skipped,
    'expiredDelegations', v_expired_delegations
  );
end;
$$;

create or replace function public.claim_approval_email_outbox(
  p_worker_id text,
  p_now timestamptz default statement_timestamp(),
  p_limit integer default 25,
  p_lease_seconds integer default 60
)
returns setof public.approval_email_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_worker_id, ''))) not between 8 and 200
     or p_limit not between 1 and 100
     or p_lease_seconds not between 15 and 600 then
    raise exception using errcode = '22023', message = 'invalid outbox claim';
  end if;

  update public.approval_email_outbox
  set status = 'retry', lease_token = null, lease_expires_at = null,
      lease_owner = null,
      failure_class = 'retryable', last_error_code = 'lease_expired',
      last_error_message = 'Previous worker lease expired.',
      next_attempt_at = p_now, updated_at = p_now
  where status = 'processing' and lease_expires_at <= p_now;

  return query
  with candidates as (
    select o.id
    from public.approval_email_outbox o
    where o.status in ('pending', 'retry')
      and o.next_attempt_at <= p_now
      and o.attempt_count < o.max_attempts
    order by o.next_attempt_at, o.id
    for update skip locked
    limit p_limit
  )
  update public.approval_email_outbox o
  set status = 'processing', attempt_count = o.attempt_count + 1,
      processing_started_at = p_now, lease_owner = left(trim(p_worker_id), 200),
      lease_token = gen_random_uuid(),
      lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
      failure_class = null, updated_at = p_now
  from candidates c
  where o.id = c.id
  returning o.*;
end;
$$;

create or replace function public.complete_approval_email_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_provider_message_id text,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed boolean;
begin
  update public.approval_email_outbox
  set status = 'sent', sent_at = p_now,
      provider_message_id = left(coalesce(p_provider_message_id, ''), 500),
      lease_owner = null, lease_token = null, lease_expires_at = null,
      last_error_code = null, last_error_message = null,
      failure_class = null, updated_at = p_now
  where id = p_outbox_id
    and status = 'processing'
    and lease_token = p_lease_token;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function public.fail_approval_email_outbox(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_message text,
  p_now timestamptz default statement_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.approval_email_outbox%rowtype;
declare v_status text;
begin
  select * into v_row from public.approval_email_outbox
  where id = p_outbox_id and status = 'processing' and lease_token = p_lease_token
  for update;
  if not found then return 'lease_lost'; end if;

  v_status := case
    when not p_retryable then 'failed'
    when v_row.attempt_count >= v_row.max_attempts then 'failed'
    else 'retry'
  end;
  update public.approval_email_outbox
  set status = v_status,
      next_attempt_at = case when v_status = 'retry'
        then p_now + make_interval(secs => least(3600, 30 * power(2, greatest(0, v_row.attempt_count - 1)))::integer)
        else next_attempt_at end,
      lease_owner = null, lease_token = null, lease_expires_at = null,
      failure_class = case
        when not p_retryable then 'permanent'
        when v_status = 'failed' then 'exhausted'
        else 'retryable' end,
      last_error_code = left(coalesce(p_error_code, 'provider_error'), 120),
      last_error_message = left(coalesce(p_error_message, 'Email provider failed.'), 4000),
      updated_at = p_now
  where id = p_outbox_id;
  return v_status;
end;
$$;

create or replace function public.retry_approval_email_outbox(
  p_outbox_id uuid,
  p_actor_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_changed boolean;
begin
  if not private.is_active_approval_admin(p_actor_id) then return false; end if;
  update public.approval_email_outbox
  set status = 'retry', attempt_count = 0, next_attempt_at = p_now,
      processing_started_at = null, lease_owner = null, lease_token = null, lease_expires_at = null,
      failure_class = null, last_error_code = null, last_error_message = null,
      updated_at = p_now
  where id = p_outbox_id and status in ('retry', 'failed');
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.run_approval_escalation_scheduler(text, timestamptz, integer)
from public, anon, authenticated;
revoke all on function public.claim_approval_email_outbox(text, timestamptz, integer, integer)
from public, anon, authenticated;
revoke all on function public.complete_approval_email_outbox(uuid, uuid, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.fail_approval_email_outbox(uuid, uuid, boolean, text, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.retry_approval_email_outbox(uuid, uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.run_approval_escalation_scheduler(text, timestamptz, integer) to service_role;
grant execute on function public.claim_approval_email_outbox(text, timestamptz, integer, integer) to service_role;
grant execute on function public.complete_approval_email_outbox(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.fail_approval_email_outbox(uuid, uuid, boolean, text, text, timestamptz) to service_role;
grant execute on function public.retry_approval_email_outbox(uuid, uuid, timestamptz) to service_role;
