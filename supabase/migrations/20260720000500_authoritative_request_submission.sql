create table if not exists public.approval_submission_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  payload_hash text not null,
  approval_request_id uuid not null references public.approval_requests(id),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key),
  check (length(idempotency_key) between 8 and 128),
  check (payload_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists approval_submission_receipts_request_idx
on public.approval_submission_receipts (approval_request_id);

create index if not exists approval_submission_receipts_actor_created_idx
on public.approval_submission_receipts (actor_id, created_at desc);

alter table public.approval_submission_receipts enable row level security;
revoke all privileges on table public.approval_submission_receipts
from public, anon, authenticated;
grant select on table public.approval_submission_receipts to service_role;

create or replace function public.submit_approval_request(
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_request jsonb,
  p_notifications jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_template public.workflow_template_versions%rowtype;
  v_department_name text := '';
  v_existing public.approval_submission_receipts%rowtype;
  v_request public.approval_requests%rowtype;
  v_owner public.profiles%rowtype;
  v_profile_id uuid;
  v_unknown_key text;
  v_notification jsonb;
  v_recipient public.profiles%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_notification_id uuid;
begin
  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_request) <> 'object'
     or jsonb_typeof(p_notifications) <> 'array'
     or jsonb_array_length(p_notifications) > 100 then
    return jsonb_build_object('outcome', 'invalid_submission');
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_request) as key
  where key not in (
    'requestNo',
    'templateVersionId',
    'title',
    'status',
    'dueLabel',
    'dueAt',
    'valueLabel',
    'currentStep',
    'currentNodeId',
    'currentOwnerId',
    'pendingNodeIds',
    'pendingOwnerProfileIds',
    'pendingOwnerEmails',
    'completedNodeIds',
    'notifiedNodeIds',
    'nodeDecisions',
    'activeBranchId',
    'extractedFields',
    'participants',
    'participantProfileIds',
    'lastAction',
    'taskSnapshot'
  )
  limit 1;
  if v_unknown_key is not null then
    return jsonb_build_object(
      'outcome', 'invalid_submission', 'field', v_unknown_key
    );
  end if;

  select * into v_actor
  from public.profiles p
  where p.id = p_actor_id
    and p.is_active;
  if not found then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select * into v_existing
  from public.approval_submission_receipts r
  where r.actor_id = p_actor_id
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object(
        'outcome', 'idempotency_conflict',
        'requestId', v_existing.approval_request_id
      );
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  if (
    select count(*)
    from public.approval_submission_receipts r
    where r.actor_id = p_actor_id
      and r.created_at >= statement_timestamp() - interval '1 minute'
  ) >= 30 then
    return jsonb_build_object('outcome', 'rate_limited', 'retryAfterSeconds', 60);
  end if;

  if length(trim(coalesce(p_request ->> 'requestNo', ''))) not between 8 and 100
     or length(trim(coalesce(p_request ->> 'title', ''))) not between 1 and 300
     or coalesce(p_request ->> 'status', '') not in (
       'pending', 'overdue', 'escalated', 'approved', 'returned',
       'reassigned', 'delegated', 'cancelled'
     )
     or jsonb_typeof(p_request -> 'taskSnapshot') <> 'object'
     or jsonb_typeof(p_request -> 'extractedFields') <> 'object'
     or jsonb_typeof(p_request -> 'nodeDecisions') <> 'object'
     or jsonb_typeof(p_request -> 'pendingNodeIds') <> 'array'
     or jsonb_typeof(p_request -> 'pendingOwnerEmails') <> 'array'
     or jsonb_typeof(p_request -> 'pendingOwnerProfileIds') <> 'array'
     or jsonb_typeof(p_request -> 'participantProfileIds') <> 'array'
     or jsonb_typeof(p_request -> 'participants') <> 'array'
     or jsonb_typeof(p_request -> 'completedNodeIds') <> 'array'
     or jsonb_typeof(p_request -> 'notifiedNodeIds') <> 'array'
     or jsonb_array_length(p_request -> 'pendingOwnerProfileIds') > 100
     or jsonb_array_length(p_request -> 'participantProfileIds') > 200 then
    return jsonb_build_object('outcome', 'invalid_submission');
  end if;

  select * into v_template
  from public.workflow_template_versions t
  where t.id = (p_request ->> 'templateVersionId')::uuid
    and t.is_active;
  if not found then
    return jsonb_build_object('outcome', 'invalid_template');
  end if;

  if v_template.department_id is not null then
    select d.name into v_department_name
    from public.business_departments d
    where d.id = v_template.department_id
      and d.is_active;
    if not found then
      return jsonb_build_object('outcome', 'invalid_template');
    end if;
  end if;

  if p_request -> 'currentOwnerId' <> 'null'::jsonb then
    select * into v_owner
    from public.profiles p
    where p.id = (p_request ->> 'currentOwnerId')::uuid
      and p.is_active;
    if not found then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;
  end if;

  for v_profile_id in
    select value::uuid
    from jsonb_array_elements_text(p_request -> 'pendingOwnerProfileIds')
  loop
    perform 1 from public.profiles p where p.id = v_profile_id and p.is_active;
    if not found then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;
  end loop;

  for v_profile_id in
    select value::uuid
    from jsonb_array_elements_text(p_request -> 'participantProfileIds')
  loop
    perform 1 from public.profiles p where p.id = v_profile_id and p.is_active;
    if not found then
      return jsonb_build_object('outcome', 'invalid_target');
    end if;
  end loop;

  insert into public.approval_requests (
    request_no,
    workflow_template_version_id,
    requester_id,
    requester_name,
    requester_email,
    title,
    workflow_name,
    department_name,
    status,
    due_label,
    due_at,
    value_label,
    current_step,
    current_node_id,
    current_owner_id,
    current_owner_email,
    pending_node_ids,
    pending_owner_emails,
    completed_node_ids,
    notified_node_ids,
    node_decisions,
    active_branch_id,
    extracted_fields,
    participants,
    last_action,
    task_snapshot,
    pinned_template_snapshot,
    completed_at
  )
  values (
    trim(p_request ->> 'requestNo'),
    v_template.id,
    v_actor.id,
    v_actor.full_name,
    v_actor.email,
    trim(p_request ->> 'title'),
    v_template.name,
    v_department_name,
    p_request ->> 'status',
    left(coalesce(p_request ->> 'dueLabel', ''), 200),
    nullif(p_request ->> 'dueAt', '')::timestamptz,
    left(coalesce(p_request ->> 'valueLabel', ''), 200),
    left(coalesce(p_request ->> 'currentStep', ''), 300),
    nullif(p_request ->> 'currentNodeId', ''),
    v_owner.id,
    coalesce(v_owner.email, ''),
    array(select jsonb_array_elements_text(p_request -> 'pendingNodeIds')),
    array(select jsonb_array_elements_text(p_request -> 'pendingOwnerEmails')),
    array(select jsonb_array_elements_text(p_request -> 'completedNodeIds')),
    array(select jsonb_array_elements_text(p_request -> 'notifiedNodeIds')),
    p_request -> 'nodeDecisions',
    nullif(p_request ->> 'activeBranchId', ''),
    p_request -> 'extractedFields',
    array(select jsonb_array_elements_text(p_request -> 'participants')),
    left(coalesce(p_request ->> 'lastAction', 'Submitted'), 500),
    jsonb_set(p_request -> 'taskSnapshot', '{schemaVersion}', '1'::jsonb, true),
    jsonb_set(v_template.template_snapshot, '{schemaVersion}', '1'::jsonb, true),
    case
      when p_request ->> 'status' in ('approved', 'cancelled')
        then statement_timestamp()
      else null
    end
  )
  returning * into v_request;

  insert into public.approval_submission_receipts (
    actor_id, idempotency_key, payload_hash, approval_request_id, result
  )
  values (
    v_actor.id,
    trim(p_idempotency_key),
    p_payload_hash,
    v_request.id,
    jsonb_build_object(
      'outcome', 'applied',
      'requestId', v_request.id,
      'requestNo', v_request.request_no,
      'currentVersion', v_request.state_version
    )
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
    v_actor.id,
    'requester',
    'Request originator',
    '',
    v_actor.id
  );

  for v_profile_id in
    select distinct value::uuid
    from jsonb_array_elements_text(p_request -> 'participantProfileIds')
    where value::uuid <> v_actor.id
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
      v_profile_id,
      case when v_profile_id = v_owner.id then 'owner' else 'observer' end,
      'Initial workflow participant',
      coalesce(v_request.current_node_id, ''),
      v_actor.id
    );
  end loop;

  if v_owner.id is not null then
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
      coalesce(v_request.current_node_id, ''),
      v_owner.id,
      'owner',
      'active',
      v_actor.id,
      'Initial current owner'
    );
  end if;

  for v_profile_id in
    select distinct value::uuid
    from jsonb_array_elements_text(p_request -> 'pendingOwnerProfileIds')
    where v_owner.id is null or value::uuid <> v_owner.id
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
    values (
      v_request.id,
      coalesce(v_request.current_node_id, ''),
      v_profile_id,
      'owner',
      'active',
      v_actor.id,
      'Initial pending owner'
    );
  end loop;

  insert into public.approval_request_events (
    id,
    approval_request_id,
    event_key,
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
    v_event_id::text,
    v_request.state_version,
    1,
    'submitted',
    'submit',
    v_actor.id,
    v_actor.full_name,
    v_actor.email,
    left(concat('Request submitted using ', v_template.name, '.'), 4000),
    jsonb_build_object('templateVersionId', v_template.id),
    v_owner.id,
    v_owner.email,
    statement_timestamp()
  );

  for v_notification in
    select value from jsonb_array_elements(p_notifications)
  loop
    if jsonb_typeof(v_notification) <> 'object'
       or jsonb_typeof(v_notification -> 'recipientProfileId') <> 'string' then
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
      left(coalesce(v_notification ->> 'href', ''), 2000)
    );

    if coalesce((v_notification ->> 'sendEmail')::boolean, false) then
      insert into public.approval_email_outbox (
        approval_request_id,
        notification_id,
        recipient_id,
        recipient_email,
        template_key,
        payload
      )
      values (
        v_request.id,
        v_notification_id,
        v_recipient.id,
        v_recipient.email,
        left(coalesce(v_notification ->> 'templateKey', 'approval-update'), 120),
        jsonb_build_object(
          'requestNo', v_request.request_no,
          'title', trim(v_notification ->> 'title'),
          'body', trim(v_notification ->> 'body'),
          'href', left(coalesce(v_notification ->> 'href', ''), 2000)
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'outcome', 'applied',
    'requestId', v_request.id,
    'requestNo', v_request.request_no,
    'currentVersion', v_request.state_version
  );
exception
  when unique_violation then
    select * into v_existing
    from public.approval_submission_receipts r
    where r.actor_id = p_actor_id
      and r.idempotency_key = trim(p_idempotency_key);
    if found and v_existing.payload_hash = p_payload_hash then
      return v_existing.result || jsonb_build_object('outcome', 'replayed');
    end if;
    return jsonb_build_object('outcome', 'idempotency_conflict');
end;
$$;

revoke all on function public.submit_approval_request(
  uuid,
  text,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated;
grant execute on function public.submit_approval_request(
  uuid,
  text,
  text,
  jsonb,
  jsonb
) to service_role;
