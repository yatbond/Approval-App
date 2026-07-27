-- Server-created atomic decision ledger updates. Browser roles receive no table
-- write rights. A successful answer writes the ledger, receipt, audit record,
-- and canonical two-message transcript in one locked transaction.
--
-- JSON validation is deliberately staged. PostgreSQL may evaluate boolean
-- operands in any order, so every object, array, number, and string is checked
-- in its own statement before any extraction, length, regex, array, object, or
-- cast operation can observe it.
alter table public.template_copilot_v2_audit_events
  drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events
  add constraint template_copilot_v2_audit_events_operation_check
  check (operation in ('create_session', 'record_candidate', 'human_commit', 'mark_unknown', 'mark_not_applicable', 'resolve_conflict', 'legacy_upgrade', 'atomic_answer'));

drop function if exists public.answer_template_copilot_v2_decision(uuid,uuid,bigint,text,text,text,jsonb);
drop function if exists public.answer_template_copilot_v2_decision(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb);
create function public.answer_template_copilot_v2_decision(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_command_hash text,
  p_decision_id text,
  p_ledger jsonb,
  p_question_id text,
  p_user_message text,
  p_assistant_message text,
  p_user_detail jsonb,
  p_assistant_detail jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  r public.template_copilot_v2_operation_receipts%rowtype;
  response jsonb;
  before_revision bigint;
  decision jsonb;
  provenance_item jsonb;
  answered_at timestamptz;
  user_created_at timestamptz;
  assistant_created_at timestamptz;

  decision_kind text;
  decision_answer text;
  decision_display text;
  decision_option_id text;
  decision_answered_at_text text;
  provenance_kind text;
  provenance_source_id text;

  user_schema_version jsonb;
  user_question_id text;
  user_decision_id text;
  user_answer_kind text;
  user_idempotency_key text;
  user_provenance text;
  user_option_id text;

  assistant_schema_version jsonb;
  assistant_decision_id text;
  assistant_status text;
  assistant_next_question_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;

  -- Do not audit before owner verification. A missing or other-owner session
  -- is deliberately indistinguishable and leaves no owner-visible evidence.
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- These identifiers must already satisfy the evidence-table constraints.
  if p_actor_id is null
     or p_session_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or coalesce(p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$', true) then
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  -- Exact replay is resolved before mutable-payload validation. The immutable
  -- receipt binds the validated key to the original command hash.
  select *
  into r
  from public.template_copilot_v2_operation_receipts
  where session_id = p_session_id
    and idempotency_key = p_idempotency_key;
  if found then
    if r.command_hash is distinct from p_command_hash then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'idempotency_conflict',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'idempotency_conflict')
      );
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return r.response || jsonb_build_object(
      'outcome', 'replayed',
      'sessionId', s.id,
      'revision', s.revision,
      'status', s.status,
      'ledger', s.ledger
    );
  end if;

  if coalesce(p_decision_id !~ '^decision\.[a-z][a-z0-9_.-]{2,95}$', true)
     or coalesce(p_question_id !~ '^v2\.[a-z][a-z0-9_.-]{2,95}$', true)
     or length(coalesce(p_user_message, '')) not between 1 and 8000
     or length(coalesce(p_assistant_message, '')) not between 1 and 16000 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  -- Top-level JSON shapes are checked before size or child access.
  if jsonb_typeof(p_ledger) is distinct from 'object'
     or jsonb_typeof(p_user_detail) is distinct from 'object'
     or jsonb_typeof(p_assistant_detail) is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if octet_length(p_ledger::text) > 12582912
     or octet_length(p_user_detail::text) > 2048
     or octet_length(p_assistant_detail::text) > 2048 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  -- Schema version is a JSON number, exactly matching z.literal(2). A string
  -- "2", boolean, null, array, or object is never coerced through ->>.
  if jsonb_typeof(p_ledger->'schemaVersion') is distinct from 'number' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if p_ledger->'schemaVersion' is distinct from '2'::jsonb then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if jsonb_typeof(p_ledger->'atomicDecisions') is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_command',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_command')
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  if s.revision is distinct from p_expected_revision then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'stale_revision',
      jsonb_build_object(
        'schemaVersion', 2,
        'attempt','stale_revision',
        'expectedRevision', p_expected_revision,
        'currentRevision', s.revision
      )
    );
    return jsonb_build_object('outcome', 'stale_revision', 'currentRevision', s.revision);
  end if;

  if jsonb_typeof(s.ledger) is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(s.ledger->'schemaVersion') is distinct from 'number' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if s.ledger->'schemaVersion' is distinct from '2'::jsonb
     or s.status is distinct from 'interviewing' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(s.ledger->'atomicDecisions') is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  -- An answer may append exactly one decision and change nothing else.
  if (p_ledger - 'atomicDecisions') is distinct from (s.ledger - 'atomicDecisions')
     or (s.ledger->'atomicDecisions') ? p_decision_id
     or not (p_ledger->'atomicDecisions' ? p_decision_id)
     or (p_ledger->'atomicDecisions' - p_decision_id) is distinct from (s.ledger->'atomicDecisions') then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if (select count(*) from jsonb_object_keys(p_ledger->'atomicDecisions'))
       is distinct from
       (select count(*) from jsonb_object_keys(s.ledger->'atomicDecisions')) + 1 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  decision := p_ledger->'atomicDecisions'->p_decision_id;
  if jsonb_typeof(decision) is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  -- Gate every decision scalar before extracting it as text.
  if jsonb_typeof(decision->'kind') is distinct from 'string'
     or jsonb_typeof(decision->'answer') is distinct from 'string'
     or jsonb_typeof(decision->'display') is distinct from 'string'
     or jsonb_typeof(decision->'answeredAt') is distinct from 'string'
     or jsonb_typeof(decision->'provenance') is distinct from 'array' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  decision_kind := decision->>'kind';
  decision_answer := decision->>'answer';
  decision_display := decision->>'display';
  decision_answered_at_text := decision->>'answeredAt';

  if jsonb_array_length(decision->'provenance') is distinct from 1 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  provenance_item := decision->'provenance'->0;
  if jsonb_typeof(provenance_item) is distinct from 'object' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(provenance_item->'kind') is distinct from 'string'
     or jsonb_typeof(provenance_item->'sourceId') is distinct from 'string'
     or jsonb_typeof(provenance_item->'sourceMessageIds') is distinct from 'array' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  provenance_kind := provenance_item->>'kind';
  provenance_source_id := provenance_item->>'sourceId';
  if jsonb_array_length(provenance_item->'sourceMessageIds') is distinct from 0
     or provenance_kind is distinct from 'human_editor'
     or provenance_source_id is distinct from ('answer:' || p_idempotency_key)
     or (provenance_item - array['kind', 'sourceId', 'sourceMessageIds']) is distinct from '{}'::jsonb
     or (select count(*) from jsonb_object_keys(provenance_item)) is distinct from 3 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if decision_answered_at_text !~
     '^(([0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|([02468][48]|[2468]0)00|[13579][26]00)-02-29|([0-9]{3}[1-9]|[0-9]{2}[1-9][0-9]|[0-9][1-9][0-9]{2}|[1-9][0-9]{3})-((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|(02)-(0[1-9]|1[0-9]|2[0-8])))T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  begin
    if right(decision_answered_at_text, 1) = 'Z' then
      answered_at := decision_answered_at_text::timestamptz;
    else
      -- PostgreSQL's native numeric time-zone parser stops at 15:59 even
      -- though RFC3339 and the canonical Zod contract allow 23:59. Parse
      -- the already-validated local timestamp natively, then apply the
      -- bounded numeric offset relative to UTC without depending on the
      -- database session's TimeZone.
      answered_at := (
        left(
          decision_answered_at_text,
          length(decision_answered_at_text) - 6
        )::timestamp at time zone 'UTC'
      ) - make_interval(
        hours => (
          case
            when substring(
              decision_answered_at_text
              from length(decision_answered_at_text) - 5
              for 1
            ) = '+' then 1
            else -1
          end
        ) * substring(
          decision_answered_at_text
          from length(decision_answered_at_text) - 4
          for 2
        )::integer,
        mins => (
          case
            when substring(
              decision_answered_at_text
              from length(decision_answered_at_text) - 5
              for 1
            ) = '+' then 1
            else -1
          end
        ) * right(decision_answered_at_text, 2)::integer
      );
    end if;
  exception when others then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end;

  if decision_kind = 'choice' then
    if jsonb_typeof(decision->'optionId') is distinct from 'string' then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    decision_option_id := decision->>'optionId';
    if decision_option_id !~ '^[a-z][a-z0-9_-]{1,63}$'
       or decision_answer is distinct from decision_option_id
       or (decision - array['answer', 'kind', 'optionId', 'display', 'provenance', 'answeredAt']) is distinct from '{}'::jsonb
       or (select count(*) from jsonb_object_keys(decision)) is distinct from 6 then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  elsif decision_kind = 'text' then
    if decision ? 'optionId'
       or (decision - array['answer', 'kind', 'display', 'provenance', 'answeredAt']) is distinct from '{}'::jsonb
       or (select count(*) from jsonb_object_keys(decision)) is distinct from 5 then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  else
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if length(decision_answer) not between 1 and 8000
     or length(decision_display) not between 1 and 500 then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  -- Transcript detail objects have their own strict numeric/string contracts.
  if (p_user_detail - array['schemaVersion', 'questionId', 'decisionId', 'answerKind', 'idempotencyKey', 'provenance', 'optionId']) is distinct from '{}'::jsonb
     or (p_assistant_detail - array['schemaVersion', 'decisionId', 'status', 'nextQuestionId']) is distinct from '{}'::jsonb then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(p_user_detail->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p_user_detail->'questionId') is distinct from 'string'
     or jsonb_typeof(p_user_detail->'decisionId') is distinct from 'string'
     or jsonb_typeof(p_user_detail->'answerKind') is distinct from 'string'
     or jsonb_typeof(p_user_detail->'idempotencyKey') is distinct from 'string'
     or jsonb_typeof(p_user_detail->'provenance') is distinct from 'string'
     or jsonb_typeof(p_assistant_detail->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p_assistant_detail->'decisionId') is distinct from 'string'
     or jsonb_typeof(p_assistant_detail->'status') is distinct from 'string' then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  user_schema_version := p_user_detail->'schemaVersion';
  user_question_id := p_user_detail->>'questionId';
  user_decision_id := p_user_detail->>'decisionId';
  user_answer_kind := p_user_detail->>'answerKind';
  user_idempotency_key := p_user_detail->>'idempotencyKey';
  user_provenance := p_user_detail->>'provenance';
  assistant_schema_version := p_assistant_detail->'schemaVersion';
  assistant_decision_id := p_assistant_detail->>'decisionId';
  assistant_status := p_assistant_detail->>'status';

  if user_schema_version is distinct from '2'::jsonb
     or assistant_schema_version is distinct from '2'::jsonb
     or user_question_id is distinct from p_question_id
     or user_decision_id is distinct from p_decision_id
     or user_answer_kind is distinct from decision_kind
     or user_idempotency_key is distinct from p_idempotency_key
     or user_provenance is distinct from 'human_editor'
     or assistant_decision_id is distinct from p_decision_id
     or coalesce(assistant_status = any(array['question', 'blocked', 'complete']), false) = false then
    insert into public.template_copilot_v2_audit_events(
      session_id, owner_id, idempotency_key, command_hash, operation,
      before_revision, after_revision, outcome, detail
    ) values (
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      'atomic_answer', s.revision, s.revision, 'invalid_transition',
      jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if decision_kind = 'choice' then
    if jsonb_typeof(p_user_detail->'optionId') is distinct from 'string' then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    user_option_id := p_user_detail->>'optionId';
    if user_option_id is distinct from decision_option_id
       or (select count(*) from jsonb_object_keys(p_user_detail)) is distinct from 7
       or p_user_message is distinct from decision_display then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  else
    if p_user_detail ? 'optionId'
       or (select count(*) from jsonb_object_keys(p_user_detail)) is distinct from 6
       or p_user_message is distinct from decision_answer then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  end if;

  if assistant_status = 'question' then
    if jsonb_typeof(p_assistant_detail->'nextQuestionId') is distinct from 'string' then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    assistant_next_question_id := p_assistant_detail->>'nextQuestionId';
    if assistant_next_question_id !~ '^v2\.[a-z][a-z0-9_.-]{2,95}$'
       or (select count(*) from jsonb_object_keys(p_assistant_detail)) is distinct from 4 then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  else
    if p_assistant_detail ? 'nextQuestionId'
       or (select count(*) from jsonb_object_keys(p_assistant_detail)) is distinct from 3 then
      insert into public.template_copilot_v2_audit_events(
        session_id, owner_id, idempotency_key, command_hash, operation,
        before_revision, after_revision, outcome, detail
      ) values (
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        'atomic_answer', s.revision, s.revision, 'invalid_transition',
        jsonb_build_object('schemaVersion', 2, 'attempt', 'invalid_transition')
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  end if;

  before_revision := s.revision;
  update public.template_copilot_sessions
  set ledger = p_ledger,
      revision = revision + 1,
      updated_at = now()
  where id = p_session_id
  returning * into s;

  -- Stable per-command IDs make exact retry a pure receipt read. Explicit
  -- timestamps guarantee canonical user-before-assistant ordering.
  user_created_at := clock_timestamp();
  assistant_created_at := clock_timestamp();
  if assistant_created_at <= user_created_at then
    assistant_created_at := user_created_at + interval '1 microsecond';
  end if;
  insert into public.template_copilot_messages(
    session_id, owner_id, client_message_id, role, content,
    structured_detail, created_at
  ) values (
    p_session_id, p_actor_id, p_idempotency_key, 'user',
    p_user_message, p_user_detail, user_created_at
  );
  insert into public.template_copilot_messages(
    session_id, owner_id, client_message_id, role, content,
    structured_detail, created_at
  ) values (
    p_session_id, p_actor_id, p_idempotency_key, 'assistant',
    p_assistant_message, p_assistant_detail, assistant_created_at
  );

  response := jsonb_build_object(
    'outcome', 'applied',
    'sessionId', s.id,
    'revision', s.revision,
    'status', s.status,
    'ledger', s.ledger,
    'assistantMessage', p_assistant_message
  );
  insert into public.template_copilot_v2_operation_receipts(
    session_id, idempotency_key, command_hash, response
  ) values (
    p_session_id,
    p_idempotency_key,
    p_command_hash,
    jsonb_build_object(
      'appliedRevision', s.revision,
      'questionId', p_question_id,
      'decisionId', p_decision_id,
      'userMessageId', p_idempotency_key,
      'assistantMessageId', p_idempotency_key
    )
  );
  insert into public.template_copilot_v2_audit_events(
    session_id, owner_id, idempotency_key, command_hash, operation,
    before_revision, after_revision, outcome, detail
  ) values (
    p_session_id,
    p_actor_id,
    p_idempotency_key,
    p_command_hash,
    'atomic_answer',
    before_revision,
    s.revision,
    'applied',
    jsonb_build_object(
      'schemaVersion', 2,
      'questionId', p_question_id,
      'decisionId', p_decision_id,
      'answerKind', decision_kind,
      'optionId', user_option_id,
      'answerLength', length(p_user_message),
      'idempotencyKey', p_idempotency_key,
      'provenance', 'human_editor',
      'nextStatus', assistant_status,
      'nextQuestionId', assistant_next_question_id
    )
  );
  return response;
end;
$$;

revoke all on function public.answer_template_copilot_v2_decision(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb)
from public, anon, authenticated;
grant execute on function public.answer_template_copilot_v2_decision(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb)
to service_role;
