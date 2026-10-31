-- Durable, owner-bound handoff between an authoritative manual answer and
-- optional candidate extraction. The job references the private user-message
-- row and never duplicates the raw answer or provider exception text.

alter table public.template_copilot_messages
  add constraint template_copilot_messages_extraction_binding_unique
  unique (id, session_id, owner_id);

create table public.template_copilot_v2_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.template_copilot_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  answer_message_id uuid not null,
  answer_client_message_id text not null
    check (answer_client_message_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  answer_revision bigint not null check (answer_revision >= 1),
  status text not null default 'pending'
    check (status in ('pending','processing','retry','failed','completed','superseded')),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 32),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  candidate_payload jsonb,
  candidate_payload_hash text
    check (candidate_payload_hash is null or candidate_payload_hash ~ '^[0-9a-f]{64}$'),
  last_error_code text
    check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  completion_outcome text
    check (completion_outcome is null or completion_outcome in ('no_candidates','applied','replayed','superseded')),
  completed_revision bigint check (completed_revision is null or completed_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (session_id, answer_client_message_id),
  unique (answer_message_id),
  foreign key (answer_message_id, session_id, owner_id)
    references public.template_copilot_messages(id, session_id, owner_id)
    on delete cascade,
  check ((status = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  check ((candidate_payload is null) = (candidate_payload_hash is null)),
  check (candidate_payload is null or jsonb_typeof(candidate_payload) = 'array'),
  check ((status = 'retry') = (next_attempt_at is not null)),
  check ((status in ('completed','superseded')) = (completed_at is not null)),
  check ((status in ('completed','superseded')) = (completion_outcome is not null))
);

create index template_copilot_v2_extraction_jobs_owner_due_idx
  on public.template_copilot_v2_extraction_jobs
  (owner_id, status, next_attempt_at, lease_expires_at, created_at, id);

alter table public.template_copilot_v2_extraction_jobs enable row level security;
revoke all on table public.template_copilot_v2_extraction_jobs from public, anon, authenticated, service_role;

-- The established answer RPC writes the ledger, receipt, audit, and transcript.
-- This wrapper adds the message-bound job in the same database transaction.
-- Any invariant or insert failure rolls the complete answer transaction back.
create function public.answer_template_copilot_v2_decision_with_extraction_job(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint,
  p_idempotency_key text, p_command_hash text, p_decision_id text,
  p_ledger jsonb, p_question_id text, p_user_message text, p_assistant_message text,
  p_user_detail jsonb, p_assistant_detail jsonb, p_enqueue_extraction boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  answer_message public.template_copilot_messages%rowtype;
  job public.template_copilot_v2_extraction_jobs%rowtype;
  applied_revision bigint;
  result_outcome text;
  result_revision_text text;
  answer_kind text;
begin
  result := public.answer_template_copilot_v2_decision(
    p_actor_id, p_session_id, p_expected_revision, p_idempotency_key,
    p_command_hash, p_decision_id, p_ledger, p_question_id, p_user_message,
    p_assistant_message, p_user_detail, p_assistant_detail
  );
  if jsonb_typeof(result) is distinct from 'object'
     or jsonb_typeof(result->'outcome') is distinct from 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_answer_result_invariant';
  end if;
  result_outcome := result->>'outcome';
  if p_enqueue_extraction is distinct from true
     or result_outcome not in ('applied','replayed') then
    return result;
  end if;

  select m.*
  into answer_message
  from public.template_copilot_messages m
  where m.session_id = p_session_id
    and m.owner_id = p_actor_id
    and m.client_message_id = p_idempotency_key
    and m.role = 'user'
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_answer_message_invariant';
  end if;
  if jsonb_typeof(answer_message.structured_detail) is distinct from 'object'
     or jsonb_typeof(answer_message.structured_detail->'answerKind') is distinct from 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_answer_detail_invariant';
  end if;
  answer_kind := answer_message.structured_detail->>'answerKind';
  if answer_kind is distinct from 'text' then
    return result;
  end if;

  if result ? 'appliedRevision' then
    if jsonb_typeof(result->'appliedRevision') is distinct from 'number' then
      raise exception using
        errcode = 'P0001',
        message = 'template_copilot_v2_answer_revision_invariant';
    end if;
    result_revision_text := result->>'appliedRevision';
  elsif result ? 'revision' then
    if jsonb_typeof(result->'revision') is distinct from 'number' then
      raise exception using
        errcode = 'P0001',
        message = 'template_copilot_v2_answer_revision_invariant';
    end if;
    result_revision_text := result->>'revision';
  end if;
  if coalesce(result_revision_text !~ '^[1-9][0-9]*$', true) then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_answer_revision_invariant';
  end if;
  applied_revision := result_revision_text::bigint;

  insert into public.template_copilot_v2_extraction_jobs(
    session_id, owner_id, answer_message_id, answer_client_message_id,
    answer_revision, status
  ) values (
    p_session_id, p_actor_id, answer_message.id, p_idempotency_key,
    applied_revision, 'pending'
  )
  on conflict (session_id, answer_client_message_id) do update
  set status = 'pending',
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = null,
      last_error_code = null,
      updated_at = clock_timestamp()
  where public.template_copilot_v2_extraction_jobs.owner_id = p_actor_id
    and public.template_copilot_v2_extraction_jobs.answer_message_id = answer_message.id
    and public.template_copilot_v2_extraction_jobs.answer_revision = applied_revision
    and (
      public.template_copilot_v2_extraction_jobs.status in ('retry','failed')
      or (
        public.template_copilot_v2_extraction_jobs.status = 'processing'
        and public.template_copilot_v2_extraction_jobs.lease_expires_at <= clock_timestamp()
      )
    )
  returning * into job;

  if not found then
    select j.*
    into job
    from public.template_copilot_v2_extraction_jobs j
    where j.session_id = p_session_id
      and j.answer_client_message_id = p_idempotency_key
    for update;
  end if;
  if not found
     or job.owner_id is distinct from p_actor_id
     or job.answer_message_id is distinct from answer_message.id
     or job.answer_revision is distinct from applied_revision then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_extraction_job_binding_invariant';
  end if;
  return result;
end;
$$;

-- The scheduled service worker receives only opaque bindings and a fresh
-- lease. It never reads answer content during dequeue. SKIP LOCKED lets
-- overlapping cron invocations claim disjoint work, while an expired lease is
-- recoverable after an interrupted invocation.
create function public.dequeue_template_copilot_v2_answer_extraction_jobs(
  p_limit integer default 4, p_lease_seconds integer default 45
) returns table (
  job_id uuid, owner_id uuid, session_id uuid, lease_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_at timestamptz := clock_timestamp();
  bounded_limit integer;
  bounded_lease_seconds integer;
begin
  bounded_limit := least(greatest(coalesce(p_limit, 4), 1), 8);
  bounded_lease_seconds := least(greatest(coalesce(p_lease_seconds, 45), 15), 90);

  return query
  with due as (
    select j.id
    from public.template_copilot_v2_extraction_jobs j
    where j.status = 'pending'
       or (j.status = 'retry' and j.next_attempt_at <= claimed_at)
       or (
         j.status = 'processing'
         and j.lease_expires_at <= claimed_at
       )
    order by
      coalesce(j.next_attempt_at, j.lease_expires_at, j.created_at),
      j.created_at,
      j.id
    for update skip locked
    limit bounded_limit
  ),
  exhausted as (
    update public.template_copilot_v2_extraction_jobs j
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        next_attempt_at = null,
        last_error_code = 'attempts_exhausted',
        updated_at = claimed_at
    from due
    where j.id = due.id
      and j.attempt_count >= 32
    returning j.id
  ),
  claimable as (
    select due.id
    from due
    where not exists (
      select 1
      from exhausted
      where exhausted.id = due.id
    )
  )
  update public.template_copilot_v2_extraction_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = claimed_at
        + make_interval(secs => bounded_lease_seconds),
      next_attempt_at = null,
      last_error_code = null,
      updated_at = claimed_at
  from claimable
  where j.id = claimable.id
  returning j.id, j.owner_id, j.session_id, j.lease_token;
end;
$$;

-- Claims are owner-first and lease-idempotent. A duplicate delivery using the
-- same lease token receives the same attempt and checkpoint without increment.
create function public.claim_template_copilot_v2_answer_extraction_job(
  p_actor_id uuid, p_session_id uuid,
  p_answer_client_message_id text default null,
  p_lease_token uuid default null,
  p_job_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  j public.template_copilot_v2_extraction_jobs%rowtype;
  m public.template_copilot_messages%rowtype;
  claimed_at timestamptz := clock_timestamp();
begin
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome','not_found');
  end if;
  if p_lease_token is null
     or ((p_job_id is null) = (p_answer_client_message_id is null))
     or (
       p_answer_client_message_id is not null
       and p_answer_client_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     ) then
    return jsonb_build_object('outcome','invalid_command');
  end if;

  select *
  into j
  from public.template_copilot_v2_extraction_jobs
  where session_id = p_session_id
    and owner_id = p_actor_id
    and (
      (p_job_id is not null and id = p_job_id)
      or (
        p_job_id is null
        and answer_client_message_id = p_answer_client_message_id
      )
    )
  for update;
  if not found then
    return jsonb_build_object('outcome','missing');
  end if;
  if j.status in ('completed','superseded') then
    return jsonb_build_object(
      'outcome',j.status,'jobId',j.id::text,
      'completionOutcome',j.completion_outcome,
      'completedRevision',j.completed_revision
    );
  end if;
  if j.status = 'failed' then
    return jsonb_build_object('outcome','failed','jobId',j.id::text,'attempt',j.attempt_count);
  end if;
  if j.status = 'retry' and j.next_attempt_at > claimed_at then
    return jsonb_build_object('outcome','retry_later','jobId',j.id::text,'attempt',j.attempt_count);
  end if;

  select *
  into m
  from public.template_copilot_messages
  where id = j.answer_message_id
    and session_id = p_session_id
    and owner_id = p_actor_id
    and client_message_id = j.answer_client_message_id
    and role = 'user';
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_extraction_message_binding_invariant';
  end if;

  if j.status = 'processing' and j.lease_expires_at > claimed_at then
    if j.lease_token is distinct from p_lease_token then
      return jsonb_build_object('outcome','busy','jobId',j.id::text);
    end if;
    return jsonb_build_object(
      'outcome','claimed','jobId',j.id::text,'attempt',j.attempt_count,
      'answerRevision',j.answer_revision,'currentRevision',s.revision,
      'answerMessageId',m.client_message_id,'answerMessage',m.content,
      'candidatePayload',j.candidate_payload,
      'candidatePayloadHash',j.candidate_payload_hash
    );
  end if;
  if j.attempt_count >= 32 then
    update public.template_copilot_v2_extraction_jobs
    set status = 'failed', lease_token = null, lease_expires_at = null,
        next_attempt_at = null, last_error_code = 'attempts_exhausted',
        updated_at = claimed_at
    where id = j.id;
    return jsonb_build_object('outcome','exhausted','jobId',j.id::text,'attempt',j.attempt_count);
  end if;

  update public.template_copilot_v2_extraction_jobs
  set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_token = p_lease_token,
      lease_expires_at = claimed_at + interval '1 minute',
      next_attempt_at = null,
      last_error_code = null,
      updated_at = claimed_at
  where id = j.id
  returning * into j;
  return jsonb_build_object(
    'outcome','claimed','jobId',j.id::text,'attempt',j.attempt_count,
    'answerRevision',j.answer_revision,'currentRevision',s.revision,
    'answerMessageId',m.client_message_id,'answerMessage',m.content,
    'candidatePayload',j.candidate_payload,
    'candidatePayloadHash',j.candidate_payload_hash
  );
end;
$$;

-- A validated candidate array is privately checkpointed before ledger
-- persistence. Retrying a crashed worker reuses this exact payload and never
-- pays for or accepts a second provider result.
create function public.checkpoint_template_copilot_v2_answer_extraction_job(
  p_actor_id uuid, p_session_id uuid, p_job_id uuid, p_lease_token uuid,
  p_candidate_payload jsonb, p_candidate_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  j public.template_copilot_v2_extraction_jobs%rowtype;
begin
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome','not_found');
  end if;
  if p_job_id is null
     or p_lease_token is null
     or jsonb_typeof(p_candidate_payload) is distinct from 'array'
     or octet_length(p_candidate_payload::text) > 12582912
     or coalesce(p_candidate_payload_hash !~ '^[0-9a-f]{64}$', true) then
    return jsonb_build_object('outcome','invalid_command');
  end if;
  select *
  into j
  from public.template_copilot_v2_extraction_jobs
  where id = p_job_id
    and session_id = p_session_id
    and owner_id = p_actor_id
  for update;
  if not found then
    return jsonb_build_object('outcome','not_found');
  end if;
  if j.status <> 'processing'
     or j.lease_token is distinct from p_lease_token
     or j.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome','lost_lease');
  end if;
  if j.candidate_payload is not null then
    if j.candidate_payload is distinct from p_candidate_payload
       or j.candidate_payload_hash is distinct from p_candidate_payload_hash then
      return jsonb_build_object('outcome','payload_conflict');
    end if;
    return jsonb_build_object('outcome','checkpointed','replayed',true);
  end if;
  update public.template_copilot_v2_extraction_jobs
  set candidate_payload = p_candidate_payload,
      candidate_payload_hash = p_candidate_payload_hash,
      updated_at = clock_timestamp()
  where id = j.id;
  return jsonb_build_object('outcome','checkpointed','replayed',false);
end;
$$;

create function public.finish_template_copilot_v2_answer_extraction_job(
  p_actor_id uuid, p_session_id uuid, p_job_id uuid, p_lease_token uuid,
  p_completion_outcome text, p_completed_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  j public.template_copilot_v2_extraction_jobs%rowtype;
  terminal_status text;
begin
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome','not_found');
  end if;
  if p_job_id is null
     or p_lease_token is null
     or coalesce(p_completion_outcome not in ('no_candidates','applied','replayed','superseded'), true)
     or coalesce(p_completed_revision < 1, true) then
    return jsonb_build_object('outcome','invalid_command');
  end if;
  select *
  into j
  from public.template_copilot_v2_extraction_jobs
  where id = p_job_id
    and session_id = p_session_id
    and owner_id = p_actor_id
  for update;
  if not found then
    return jsonb_build_object('outcome','not_found');
  end if;
  if j.status in ('completed','superseded') then
    if j.completion_outcome is distinct from p_completion_outcome
       or j.completed_revision is distinct from p_completed_revision then
      return jsonb_build_object('outcome','completion_conflict');
    end if;
    return jsonb_build_object('outcome',j.status,'replayed',true);
  end if;
  if j.status <> 'processing'
     or j.lease_token is distinct from p_lease_token
     or j.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome','lost_lease');
  end if;
  if p_completion_outcome <> 'superseded' and j.candidate_payload is null then
    return jsonb_build_object('outcome','missing_checkpoint');
  end if;
  if p_completed_revision < j.answer_revision then
    return jsonb_build_object('outcome','invalid_command');
  end if;

  terminal_status := case when p_completion_outcome = 'superseded'
    then 'superseded' else 'completed' end;
  update public.template_copilot_v2_extraction_jobs
  set status = terminal_status,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = null,
      last_error_code = null,
      completion_outcome = p_completion_outcome,
      completed_revision = p_completed_revision,
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = j.id;
  return jsonb_build_object('outcome',terminal_status,'replayed',false);
end;
$$;

create function public.fail_template_copilot_v2_answer_extraction_job(
  p_actor_id uuid, p_session_id uuid, p_job_id uuid, p_lease_token uuid,
  p_retry boolean, p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  j public.template_copilot_v2_extraction_jobs%rowtype;
  next_status text;
begin
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome','not_found');
  end if;
  if p_job_id is null
     or p_lease_token is null
     or p_retry is null
     or coalesce(p_error_code !~ '^[a-z][a-z0-9_]{0,63}$', true) then
    return jsonb_build_object('outcome','invalid_command');
  end if;
  select *
  into j
  from public.template_copilot_v2_extraction_jobs
  where id = p_job_id
    and session_id = p_session_id
    and owner_id = p_actor_id
  for update;
  if not found then
    return jsonb_build_object('outcome','not_found');
  end if;
  if j.status in ('retry','failed') and j.last_error_code is not distinct from p_error_code then
    return jsonb_build_object('outcome',j.status,'replayed',true);
  end if;
  if j.status <> 'processing'
     or j.lease_token is distinct from p_lease_token
     or j.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('outcome','lost_lease');
  end if;

  next_status := case when p_retry and j.attempt_count < 32
    then 'retry' else 'failed' end;
  update public.template_copilot_v2_extraction_jobs
  set status = next_status,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = case when next_status = 'retry'
        then clock_timestamp() + interval '15 seconds' else null end,
      last_error_code = p_error_code,
      updated_at = clock_timestamp()
  where id = j.id;
  return jsonb_build_object('outcome',next_status,'replayed',false);
end;
$$;

revoke all on function public.answer_template_copilot_v2_decision_with_extraction_job(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.dequeue_template_copilot_v2_answer_extraction_jobs(integer,integer) from public, anon, authenticated;
revoke all on function public.claim_template_copilot_v2_answer_extraction_job(uuid,uuid,text,uuid,uuid) from public, anon, authenticated;
revoke all on function public.checkpoint_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.finish_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.fail_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.answer_template_copilot_v2_decision_with_extraction_job(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb,boolean) to service_role;
grant execute on function public.dequeue_template_copilot_v2_answer_extraction_jobs(integer,integer) to service_role;
grant execute on function public.claim_template_copilot_v2_answer_extraction_job(uuid,uuid,text,uuid,uuid) to service_role;
grant execute on function public.checkpoint_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.finish_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,text,bigint) to service_role;
grant execute on function public.fail_template_copilot_v2_answer_extraction_job(uuid,uuid,uuid,uuid,boolean,text) to service_role;
