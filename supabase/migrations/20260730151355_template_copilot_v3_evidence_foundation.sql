-- Template Copilot v3 evidence foundation.
--
-- Evidence is stored outside the mutable v2 ledger so every existing workflow
-- command remains backward compatible and cannot rewrite source claims. This
-- migration is intentionally unapplied until the governed database gate.

alter table public.template_copilot_v2_audit_events
  drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events
  add constraint template_copilot_v2_audit_events_operation_check
  check (operation in (
    'create_session',
    'record_candidate',
    'human_commit',
    'human_replace',
    'mark_unknown',
    'mark_not_applicable',
    'resolve_conflict',
    'legacy_upgrade',
    'atomic_answer',
    'special_decision',
    'candidate_extraction',
    'candidate_confirmation',
    'resolve_extraction_conflict',
    'mode_switch',
    'evidence_fragment_append'
  ));

create function private.template_copilot_v3_stable_json(
  p_value jsonb
) returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select
        '{' ||
        coalesce(
          string_agg(
            to_jsonb(entry.key)::text || ':' ||
              private.template_copilot_v3_stable_json(entry.value),
            ',' order by entry.key collate "C"
          ),
          ''
        ) ||
        '}'
      into result
      from jsonb_each(p_value) as entry;
      return result;
    when 'array' then
      select
        '[' ||
        coalesce(
          string_agg(
            private.template_copilot_v3_stable_json(entry.value),
            ',' order by entry.ordinality
          ),
          ''
        ) ||
        ']'
      into result
      from jsonb_array_elements(p_value) with ordinality as entry(value, ordinality);
      return result;
    else
      return p_value::text;
  end case;
end;
$$;

create function private.template_copilot_v3_json_node_count(
  p_value jsonb,
  p_depth integer,
  p_max_depth integer,
  p_remaining integer
) returns integer
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  child jsonb;
  child_count integer;
  node_count integer := 1;
begin
  if p_depth < 0
     or p_max_depth < 0
     or p_max_depth > 32
     or p_depth > p_max_depth
     or p_remaining < 1 then
    return p_remaining + 1;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    if jsonb_array_length(p_value) > 200 then
      return p_remaining + 1;
    end if;
    for child in select value from jsonb_array_elements(p_value) loop
      child_count := private.template_copilot_v3_json_node_count(
        child,
        p_depth + 1,
        p_max_depth,
        p_remaining - node_count
      );
      node_count := node_count + child_count;
      if node_count > p_remaining then
        return node_count;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'object' then
    if (select count(*) from jsonb_object_keys(p_value)) > 200 then
      return p_remaining + 1;
    end if;
    for child in select value from jsonb_each(p_value) loop
      child_count := private.template_copilot_v3_json_node_count(
        child,
        p_depth + 1,
        p_max_depth,
        p_remaining - node_count
      );
      node_count := node_count + child_count;
      if node_count > p_remaining then
        return node_count;
      end if;
    end loop;
  end if;

  return node_count;
end;
$$;

create function private.template_copilot_v3_number_is_canonical(
  p_value jsonb
) returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  canonical text;
  magnitude numeric;
  significant_digits text;
begin
  if jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;

  canonical := p_value #>> '{}';
  if canonical !~ '^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$' then
    return false;
  end if;

  magnitude := abs(canonical::numeric);
  if magnitude <> 0
     and (
       magnitude < 0.000001
       or magnitude >= 1000000000000000000000
     ) then
    return false;
  end if;

  significant_digits := regexp_replace(canonical, '^-', '');
  significant_digits := replace(significant_digits, '.', '');
  significant_digits := regexp_replace(significant_digits, '^0+', '');
  significant_digits := regexp_replace(significant_digits, '0+$', '');
  return char_length(significant_digits) <= 15;
end;
$$;

create function private.template_copilot_v3_json_value_is_bounded(
  p_value jsonb,
  p_depth integer
) returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  child jsonb;
  object_key text;
  value_type text;
begin
  if p_depth < 0
     or p_depth > 16 then
    return false;
  end if;

  if p_depth = 0
     and private.template_copilot_v3_json_node_count(
       p_value,
       0,
       16,
       2000
     ) > 2000 then
    return false;
  end if;

  if p_depth = 0
     and octet_length(convert_to(
       private.template_copilot_v3_stable_json(p_value),
       'UTF8'
     )) > 262144 then
    return false;
  end if;

  value_type := jsonb_typeof(p_value);
  if value_type = 'object' then
    if (select count(*) from jsonb_object_keys(p_value)) > 200 then
      return false;
    end if;
    for object_key, child in select key, value from jsonb_each(p_value) loop
      if object_key !~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'
         or not private.template_copilot_v3_json_value_is_bounded(
           child,
           p_depth + 1
         ) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if value_type = 'array' then
    if jsonb_array_length(p_value) > 200 then
      return false;
    end if;
    for child in select value from jsonb_array_elements(p_value) loop
      if not private.template_copilot_v3_json_value_is_bounded(
        child,
        p_depth + 1
      ) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if value_type = 'string' then
    return char_length(p_value #>> '{}') <= 8000;
  end if;

  if value_type = 'number' then
    return private.template_copilot_v3_number_is_canonical(p_value);
  end if;

  -- PostgreSQL jsonb rejects U+0000 and invalid surrogate sequences before a
  -- function receives the value. Null is excluded everywhere in a fragment.
  return value_type = 'boolean';
end;
$$;

create function private.template_copilot_v3_reject_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'template_copilot_v3_evidence_is_append_only';
end;
$$;

create table private.template_copilot_v3_source_spans (
  session_id uuid not null
    references public.template_copilot_sessions(id) on delete restrict,
  owner_id uuid not null
    references public.profiles(id) on delete restrict,
  span_id text not null
    check (span_id ~ '^[0-9a-f]{64}$'),
  source_message_id uuid not null,
  message_id text not null
    check (message_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  start_code_point integer not null
    check (start_code_point between 0 and 79999),
  end_code_point integer not null
    check (end_code_point between 1 and 80000),
  exact_text text not null
    check (
      char_length(exact_text) between 1 and 8000
    ),
  created_revision bigint not null check (created_revision >= 2),
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id, span_id),
  unique (session_id, message_id, start_code_point, end_code_point),
  foreign key (source_message_id, session_id, owner_id)
    references public.template_copilot_messages(id, session_id, owner_id)
    on delete restrict,
  check (end_code_point > start_code_point),
  check (char_length(exact_text) = end_code_point - start_code_point)
);

create table private.template_copilot_v3_fragments (
  session_id uuid not null
    references public.template_copilot_sessions(id) on delete restrict,
  owner_id uuid not null
    references public.profiles(id) on delete restrict,
  fragment_id text not null
    check (fragment_id ~ '^[0-9a-f]{64}$'),
  evidence_version smallint not null default 3
    check (evidence_version = 3),
  compiler_version text not null
    check (compiler_version = 'template-copilot-v3.0'),
  fact_id text not null check (fact_id in (
    'request.fields',
    'attachments.requirements',
    'workflow.stages',
    'workflow.conditions',
    'notifications.rules'
  )),
  fragment_kind text not null
    check (fragment_kind = 'array_item'),
  state text not null default 'open' check (state = 'open'),
  value jsonb not null
    check (jsonb_typeof(value) in ('string','number','boolean','array','object')),
  bindings jsonb not null check (jsonb_typeof(bindings) = 'array'),
  missing_paths jsonb not null check (jsonb_typeof(missing_paths) = 'array'),
  confidence text not null check (confidence in ('low','medium','high')),
  ambiguity text not null check (ambiguity in ('none','possible','ambiguous')),
  ambiguity_note text
    constraint template_copilot_v3_fragments_ambiguity_note_length_check
    check (
      ambiguity_note is null or char_length(ambiguity_note) <= 500
    ),
  created_revision bigint not null check (created_revision >= 2),
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id, fragment_id)
);

create index template_copilot_v3_source_spans_owner_session_idx
  on private.template_copilot_v3_source_spans
  (owner_id, session_id, created_revision, span_id);
create index template_copilot_v3_fragments_owner_session_idx
  on private.template_copilot_v3_fragments
  (owner_id, session_id, created_revision, fragment_id);

alter table private.template_copilot_v3_source_spans enable row level security;
alter table private.template_copilot_v3_source_spans force row level security;
alter table private.template_copilot_v3_fragments enable row level security;
alter table private.template_copilot_v3_fragments force row level security;

revoke all on table
  private.template_copilot_v3_source_spans,
  private.template_copilot_v3_fragments
from public, anon, authenticated, service_role;

create trigger template_copilot_v3_source_spans_immutable
before update or delete on private.template_copilot_v3_source_spans
for each row execute function
  private.template_copilot_v3_reject_evidence_mutation();
create trigger template_copilot_v3_fragments_immutable
before update or delete on private.template_copilot_v3_fragments
for each row execute function
  private.template_copilot_v3_reject_evidence_mutation();

create function private.audit_template_copilot_v3_evidence_attempt(
  p_session_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_command_hash text,
  p_before_revision bigint,
  p_after_revision bigint,
  p_outcome text,
  p_span_count integer,
  p_fragment_count integer,
  p_evidence_hash text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_key text;
  safe_hash text;
  safe_outcome text;
  safe_reason text;
begin
  safe_key := case
    when coalesce(
      p_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$',
      false
    ) then p_idempotency_key
    else 'reject:' || md5(coalesce(p_idempotency_key, '<null>'))
  end;
  safe_hash := case
    when coalesce(p_command_hash ~ '^[0-9a-f]{64}$', false)
      then p_command_hash
    else md5('v3-command-1:' || coalesce(p_command_hash, '<null>')) ||
      md5('v3-command-2:' || coalesce(p_command_hash, '<null>'))
  end;
  safe_outcome := case
    when p_outcome in (
      'invalid_command',
      'idempotency_conflict',
      'replayed_exact',
      'stale_revision',
      'invalid_transition',
      'applied'
    ) then p_outcome
    else 'invalid_transition'
  end;
  safe_reason := case
    when p_reason in (
      'shape',
      'state',
      'source_span',
      'overlap',
      'fragment',
      'binding',
      'unused_span',
      'evidence_hash'
    ) then p_reason
    else null
  end;

  insert into public.template_copilot_v2_audit_events(
    session_id,
    owner_id,
    idempotency_key,
    command_hash,
    operation,
    before_revision,
    after_revision,
    outcome,
    detail
  ) values (
    p_session_id,
    p_owner_id,
    safe_key,
    safe_hash,
    'evidence_fragment_append',
    p_before_revision,
    p_after_revision,
    safe_outcome,
    jsonb_strip_nulls(jsonb_build_object(
      'evidenceVersion', 3,
      'compilerVersion', 'template-copilot-v3.0',
      'spanCount', greatest(coalesce(p_span_count, 0), 0),
      'fragmentCount', greatest(coalesce(p_fragment_count, 0), 0),
      'evidenceHash', case
        when p_evidence_hash ~ '^[0-9a-f]{64}$' then p_evidence_hash
        else null
      end,
      'reason', safe_reason
    ))
  );
end;
$$;

revoke all on function
  private.template_copilot_v3_stable_json(jsonb),
  private.template_copilot_v3_json_node_count(jsonb,integer,integer,integer),
  private.template_copilot_v3_number_is_canonical(jsonb),
  private.template_copilot_v3_json_value_is_bounded(jsonb,integer),
  private.template_copilot_v3_reject_evidence_mutation(),
  private.audit_template_copilot_v3_evidence_attempt(
    uuid,uuid,text,text,bigint,bigint,text,integer,integer,text,text
  )
from public, anon, authenticated, service_role;

create function private.template_copilot_v3_text_has_non_whitespace(
  p_value text
) returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select translate(
    p_value,
    E' \t\n\v\f\r' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000',
    ''
  ) <> '';
$$;

create function private.template_copilot_v3_primitive_leaves(
  p_value jsonb,
  p_path text
) returns table(path text, leaf_value jsonb, leaf_type text)
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare item record; next_path text;
begin
  if jsonb_typeof(p_value) = 'array' then
    if jsonb_array_length(p_value) = 0 then
      return query select coalesce(nullif(p_path, ''), '/'), p_value, 'array'; return;
    end if;
    for item in select value, ordinality from jsonb_array_elements(p_value) with ordinality loop
      next_path := p_path || '/' || (item.ordinality - 1)::text;
      return query select * from private.template_copilot_v3_primitive_leaves(item.value, next_path);
    end loop;
    return;
  end if;
  if jsonb_typeof(p_value) = 'object' then
    if p_value = '{}'::jsonb then
      return query select coalesce(nullif(p_path, ''), '/'), p_value, 'object'; return;
    end if;
    for item in select key, value from jsonb_each(p_value) order by key collate "C" loop
      next_path := p_path || '/' || replace(replace(item.key, '~', '~0'), '/', '~1');
      return query select * from private.template_copilot_v3_primitive_leaves(item.value, next_path);
    end loop;
    return;
  end if;
  return query select coalesce(nullif(p_path, ''), '/'), p_value, jsonb_typeof(p_value);
end;
$$;

create function private.template_copilot_v3_required_fragment_paths(p_fact_id text, p_value jsonb)
returns setof text
language plpgsql immutable strict security invoker set search_path = ''
as $$
begin
  if p_fact_id = 'request.fields' then
    return query select unnest(array['/label','/type','/required','/options']);
  elsif p_fact_id = 'attachments.requirements' then
    return query select unnest(array['/id','/label','/kind','/required','/formats','/minimumQuantity','/maximumQuantity','/stage','/contributorPolicy','/confirmationPolicy']);
    if p_value->>'kind' = 'attachment' then return next '/maximumFileSizeMb'; end if;
  elsif p_fact_id = 'workflow.stages' then
    return query select unnest(array['/label','/kind','/participant/mode','/sequence']);
    if p_value->'participant'->>'mode' in ('fixed_email','directory_position','request_field') then return next '/participant/value'; end if;
  elsif p_fact_id = 'workflow.conditions' then
    return query select unnest(array['/id','/sequence','/field','/operator','/value','/matchingRoute','/otherwiseRoute']);
  elsif p_fact_id = 'notifications.rules' then
    return query select unnest(array['/id','/event','/recipients','/timing/mode','/channel','/visibility']);
    if p_value->'timing'->>'mode' in ('before_due','after_due') then return next '/timing/offsetHours'; end if;
    if p_value->>'event' in ('stage_assigned','stage_completed','due_soon','overdue') or exists (
      select 1 from jsonb_array_elements_text(coalesce(p_value->'recipients', '[]'::jsonb)) as recipient(value)
      where recipient.value in ('current_stage_participants','previous_stage_participants')
    ) then return next '/stage'; end if;
  end if;
end;
$$;

create function private.template_copilot_v3_missing_path_is_allowed(p_fact_id text, p_path text)
returns boolean language sql immutable strict security invoker set search_path = ''
as $$
  select case p_fact_id
    when 'request.fields' then p_path in ('/label','/type','/required','/options')
    when 'attachments.requirements' then p_path in ('/id','/label','/kind','/required','/formats','/minimumQuantity','/maximumQuantity','/maximumFileSizeMb','/stage','/contributorPolicy','/confirmationPolicy')
    when 'workflow.stages' then p_path in ('/label','/kind','/participant','/participant/mode','/participant/value','/sequence')
    when 'workflow.conditions' then p_path in ('/id','/sequence','/field','/operator','/value','/currency','/unit','/matchingRoute','/otherwiseRoute')
    when 'notifications.rules' then p_path in ('/id','/event','/recipients','/timing','/timing/mode','/timing/offsetHours','/channel','/visibility','/stage')
    else false
  end;
$$;

create function private.template_copilot_v3_binding_rule_is_compatible(p_fact_id text, p_path text, p_leaf_value jsonb, p_rule text)
returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare leaf_type text := jsonb_typeof(p_leaf_value); enum_path boolean;
begin
  if leaf_type in ('array','object') then return p_leaf_value in ('[]'::jsonb, '{}'::jsonb) and p_rule = 'explicit_empty_collection'; end if;
  if leaf_type = 'boolean' then return p_rule = 'boolean_lexical'; end if;
  if leaf_type = 'number' then return p_rule = 'numeric_lexical'; end if;
  if leaf_type <> 'string' then return false; end if;
  enum_path := (p_fact_id = 'request.fields' and p_path = '/type')
    or (p_fact_id = 'attachments.requirements' and (p_path in ('/kind','/stage','/contributorPolicy','/confirmationPolicy') or p_path ~ '^/formats/(?:0|[1-9][0-9]*)$'))
    or (p_fact_id = 'workflow.stages' and p_path in ('/kind','/participant/mode'))
    or (p_fact_id = 'workflow.conditions' and p_path in ('/operator','/matchingRoute','/otherwiseRoute'))
    or (p_fact_id = 'notifications.rules' and (p_path in ('/event','/timing/mode','/channel','/visibility','/stage') or p_path ~ '^/recipients/(?:0|[1-9][0-9]*)$'));
  if enum_path then return p_rule = 'enum_lexical'; end if;
  return p_rule in ('exact','nfkc_trim_collapse');
end;
$$;

create function private.template_copilot_v3_fragment_leaf_is_canonical(
  p_fact_id text, p_path text, p_value jsonb
) returns boolean
language plpgsql immutable strict security invoker set search_path = ''
as $$
declare t text := p_value #>> '{}'; n numeric;
begin
  if jsonb_typeof(p_value) = 'string' then
    if not private.template_copilot_v3_text_has_non_whitespace(t)
       or not private.template_copilot_v3_fragment_text_has_canonical_edges(t) then return false; end if;
  end if;
  if p_fact_id = 'request.fields' then
    if p_path = '/label' then return jsonb_typeof(p_value) = 'string' and char_length(t) <= 200; end if;
    if p_path = '/type' then return jsonb_typeof(p_value) = 'string' and t in ('text','long_text','number','date','currency','email','select','radio','checkbox','table'); end if;
    if p_path = '/required' then return jsonb_typeof(p_value) = 'boolean'; end if;
    if p_path = '/options' then return p_value = '[]'::jsonb; end if;
    if p_path ~ '^/options/(?:0|[1-9][0-9]*)$' then return jsonb_typeof(p_value) = 'string' and char_length(t) <= 200 and substring(p_path from 10)::integer < 100; end if;
    return false;
  end if;
  if p_fact_id = 'attachments.requirements' then
    if p_path = '/id' then return jsonb_typeof(p_value) = 'string' and t ~ '^[a-z][a-z0-9_-]{1,79}$'; end if;
    if p_path = '/label' then return jsonb_typeof(p_value) = 'string' and char_length(t) <= 200; end if;
    if p_path = '/kind' then return jsonb_typeof(p_value) = 'string' and t in ('attachment','form'); end if;
    if p_path = '/required' then return jsonb_typeof(p_value) = 'boolean'; end if;
    if p_path = '/formats' then return p_value = '[]'::jsonb; end if;
    if p_path ~ '^/formats/(?:0|[1-9][0-9]*)$' then return jsonb_typeof(p_value) = 'string' and t in ('text','pdf','image','excel_csv') and substring(p_path from 10)::integer < 4; end if;
    if p_path in ('/minimumQuantity','/maximumQuantity','/maximumFileSizeMb') then
      if jsonb_typeof(p_value) <> 'number' or t !~ '^(?:0|[1-9][0-9]*)$' then return false; end if; n:=t::numeric;
      return case p_path when '/minimumQuantity' then n between 0 and 20 when '/maximumQuantity' then n between 1 and 20 else n between 1 and 25 end;
    end if;
    if p_path = '/stage' then return jsonb_typeof(p_value) = 'string' and (t='request_submission' or private.template_copilot_v3_dynamic_stage_reference_is_canonical(t)); end if;
    if p_path = '/contributorPolicy' then return jsonb_typeof(p_value)='string' and t in ('requester_only','allow_invited_contributors'); end if;
    if p_path = '/confirmationPolicy' then return jsonb_typeof(p_value)='string' and t in ('none','requester_confirms','stage_owner_confirms'); end if;
    return false;
  end if;
  if p_fact_id = 'workflow.stages' then
    if p_path = '/label' or p_path = '/participant/value' then return jsonb_typeof(p_value)='string' and char_length(t)<=200; end if;
    if p_path = '/kind' then return jsonb_typeof(p_value)='string' and t in ('approval','review','for_information','submission'); end if;
    if p_path = '/participant/mode' then return jsonb_typeof(p_value)='string' and t in ('fixed_email','directory_position','request_field','requester','unassigned_at_template'); end if;
    if p_path = '/participant' then return p_value='{}'::jsonb; end if;
    if p_path = '/sequence' then return jsonb_typeof(p_value)='number' and t ~ '^[1-9][0-9]*$' and t::numeric between 1 and 100; end if;
    return false;
  end if;
  if p_fact_id = 'workflow.conditions' then
    if p_path = '/id' then return jsonb_typeof(p_value)='string' and t ~ '^[a-z][a-z0-9_-]{1,79}$'; end if;
    if p_path = '/sequence' then return jsonb_typeof(p_value)='number' and t ~ '^[1-9][0-9]*$' and t::numeric between 1 and 50; end if;
    if p_path in ('/field','/unit') then return jsonb_typeof(p_value)='string' and char_length(t)<=200; end if;
    if p_path = '/operator' then return jsonb_typeof(p_value)='string' and t in ('=','!=','>','>=','<','<=','contains'); end if;
    if p_path = '/value' then return (jsonb_typeof(p_value)='string' and char_length(t)<=8000) or (jsonb_typeof(p_value)='number' and private.template_copilot_v3_json_value_is_bounded(p_value,0)); end if;
    if p_path = '/currency' then return jsonb_typeof(p_value)='string' and t ~ '^[A-Z]{3}$'; end if;
    if p_path in ('/matchingRoute','/otherwiseRoute') then return jsonb_typeof(p_value)='string' and (t in ('complete','return_for_correction') or private.template_copilot_v3_dynamic_stage_reference_is_canonical(t) or (char_length(t)<=90 and t ~ '^condition:[a-z][a-z0-9_-]+$')); end if;
    return false;
  end if;
  if p_fact_id = 'notifications.rules' then
    if p_path = '/id' then return jsonb_typeof(p_value)='string' and t ~ '^[a-z][a-z0-9_-]{1,79}$'; end if;
    if p_path = '/event' then return jsonb_typeof(p_value)='string' and t in ('request_submitted','stage_assigned','stage_completed','request_rejected','correction_requested','request_completed','due_soon','overdue'); end if;
    if p_path ~ '^/recipients/(?:0|[1-9][0-9]*)$' then return jsonb_typeof(p_value)='string' and t in ('requester','current_stage_participants','previous_stage_participants','all_participants','workflow_owner') and substring(p_path from 13)::integer < 5; end if;
    if p_path = '/timing' then return p_value='{}'::jsonb; end if;
    if p_path = '/timing/mode' then return jsonb_typeof(p_value)='string' and t in ('immediate','before_due','after_due'); end if;
    if p_path = '/timing/offsetHours' then return jsonb_typeof(p_value)='number' and t ~ '^[1-9][0-9]*$' and t::numeric between 1 and 8760; end if;
    if p_path = '/channel' then return jsonb_typeof(p_value)='string' and t in ('default','in_app','email','in_app_and_email'); end if;
    if p_path = '/visibility' then return jsonb_typeof(p_value)='string' and t in ('recipients_only','all_participants'); end if;
    if p_path = '/stage' then return jsonb_typeof(p_value)='string' and private.template_copilot_v3_dynamic_stage_reference_is_canonical(t); end if;
    return false;
  end if;
  return false;
end;
$$;

create function private.template_copilot_v3_fragment_text_has_canonical_edges(p_value text)
returns boolean language sql immutable strict security invoker set search_path = ''
as $$
  select translate(
    left(p_value,1),
    E' \t\n\v\f\r' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',
    ''
  ) <> '' and translate(
    right(p_value,1),
    E' \t\n\v\f\r' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',
    ''
  ) <> '';
$$;

create function private.template_copilot_v3_pointer_contains(p_parent text, p_child text)
returns boolean language sql immutable strict security invoker set search_path = ''
as $$ select p_child=p_parent or left(p_child,char_length(p_parent)+1)=p_parent||'/' $$;

create function private.template_copilot_v3_reject_append(
 p_session_id uuid,p_owner_id uuid,p_idempotency_key text,p_command_hash text,p_revision bigint,p_outcome text,
 p_new_span_count integer,p_known_span_count integer,p_fragment_count integer,p_evidence_hash text,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 perform private.audit_template_copilot_v3_evidence_attempt(p_session_id,p_owner_id,p_idempotency_key,p_command_hash,p_revision,p_revision,p_outcome,greatest(coalesce(p_new_span_count,0),0)+greatest(coalesce(p_known_span_count,0),0),greatest(coalesce(p_fragment_count,0),0),p_evidence_hash,p_reason);
 if p_outcome='stale_revision' then return jsonb_build_object('outcome','stale_revision','currentRevision',p_revision); end if;
 return jsonb_build_object('outcome',p_outcome);
end;
$$;
create function private.template_copilot_v3_normalize_trim_collapse_text(p_value text)
returns text language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  normalized text := normalize(p_value,NFKC);
  whitespace text := E' \t\n\v\f\r' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  result text := '';
  character text;
  pending_space boolean := false;
  position integer;
begin
  for position in 1..char_length(normalized) loop
    character := substr(normalized,position,1);
    if strpos(whitespace,character)>0 then pending_space:=true;
    else
      if pending_space and result<>'' then result:=result||' '; end if;
      pending_space:=false;
      result:=result||character;
    end if;
  end loop;
  return result;
end;
$$;

create function private.template_copilot_v3_normalize_lexical_text(p_value text)
returns text language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  normalized text := private.template_copilot_v3_normalize_trim_collapse_text(p_value);
begin
  return translate(
    normalized,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz'
  );
end;
$$;

create function private.template_copilot_v3_dynamic_stage_reference_is_canonical(
  p_value text
) returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  suffix text;
begin
  if left(p_value,6)<>'stage:' then return false; end if;
  suffix:=substr(p_value,7);
  return char_length(suffix) between 1 and 200
    and private.template_copilot_v3_text_has_non_whitespace(suffix)
    and private.template_copilot_v3_fragment_text_has_canonical_edges(suffix)
    and private.template_copilot_v3_normalize_trim_collapse_text(suffix)=suffix;
end;
$$;

create function private.template_copilot_v3_enum_leaf_is_allowed(
  p_fact_id text,p_path text,p_leaf_value text
) returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
begin
  if p_fact_id='request.fields' and p_path='/type' then
    return p_leaf_value in ('text','long_text','number','date','currency','email','select','radio','checkbox','table');
  end if;
  if p_fact_id='attachments.requirements' then
    if p_path='/kind' then return p_leaf_value in ('attachment','form'); end if;
    if p_path='/stage' then return p_leaf_value='request_submission' or private.template_copilot_v3_dynamic_stage_reference_is_canonical(p_leaf_value); end if;
    if p_path='/contributorPolicy' then return p_leaf_value in ('requester_only','allow_invited_contributors'); end if;
    if p_path='/confirmationPolicy' then return p_leaf_value in ('none','requester_confirms','stage_owner_confirms'); end if;
    if p_path~'^/formats/(?:0|[1-9][0-9]*)$' then return p_leaf_value in ('text','pdf','image','excel_csv'); end if;
    return false;
  end if;
  if p_fact_id='workflow.stages' then
    if p_path='/kind' then return p_leaf_value in ('approval','review','for_information','submission'); end if;
    if p_path='/participant/mode' then return p_leaf_value in ('fixed_email','directory_position','request_field','requester','unassigned_at_template'); end if;
    return false;
  end if;
  if p_fact_id='workflow.conditions' then
    if p_path='/operator' then return p_leaf_value in ('=','!=','>','>=','<','<=','contains'); end if;
    if p_path in ('/matchingRoute','/otherwiseRoute') then
      return p_leaf_value in ('complete','return_for_correction')
        or private.template_copilot_v3_dynamic_stage_reference_is_canonical(p_leaf_value)
        or (char_length(p_leaf_value)<=90 and p_leaf_value~'^condition:[a-z][a-z0-9_-]+$');
    end if;
    return false;
  end if;
  if p_fact_id='notifications.rules' then
    if p_path='/event' then return p_leaf_value in ('request_submitted','stage_assigned','stage_completed','request_rejected','correction_requested','request_completed','due_soon','overdue'); end if;
    if p_path='/timing/mode' then return p_leaf_value in ('immediate','before_due','after_due'); end if;
    if p_path='/channel' then return p_leaf_value in ('default','in_app','email','in_app_and_email'); end if;
    if p_path='/visibility' then return p_leaf_value in ('recipients_only','all_participants'); end if;
    if p_path='/stage' then return private.template_copilot_v3_dynamic_stage_reference_is_canonical(p_leaf_value); end if;
    if p_path~'^/recipients/(?:0|[1-9][0-9]*)$' then return p_leaf_value in ('requester','current_stage_participants','previous_stage_participants','all_participants','workflow_owner'); end if;
    return false;
  end if;
  return false;
end;
$$;

create function private.template_copilot_v3_enum_alias_matches(
  p_fact_id text,p_path text,p_leaf_value text,p_wording text,p_aliases jsonb
) returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  scope_key text;
  alias text;
begin
  if not private.template_copilot_v3_enum_leaf_is_allowed(p_fact_id,p_path,p_leaf_value) then return false; end if;
  scope_key:=p_fact_id||':'||case
    when p_fact_id='attachments.requirements' and p_path~'^/formats/(?:0|[1-9][0-9]*)$' then '/formats/*'
    when p_fact_id='notifications.rules' and p_path~'^/recipients/(?:0|[1-9][0-9]*)$' then '/recipients/*'
    else p_path
  end;
  for alias in select value from jsonb_array_elements_text(coalesce(p_aliases->'enumByScope'->scope_key->p_leaf_value,'[]'::jsonb)) loop
    if p_wording=private.template_copilot_v3_normalize_lexical_text(alias) then return true; end if;
  end loop;
  return false;
end;
$$;

create function private.template_copilot_v3_ordinal_alias_matches(
  p_sequence integer,p_wording text
) returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  small_ordinals text[]:=array[
    'first','second','third','fourth','fifth','sixth','seventh','eighth','ninth',
    'tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth',
    'sixteenth','seventeenth','eighteenth','nineteenth'
  ];
  chinese_digits text[]:=array['一','二','三','四','五','六','七','八','九'];
  suffix text;
  english_ordinal text;
  english_spaced text;
  tens_cardinal text;
  unit_ordinal text;
  chinese_numeral text;
  tens integer;
  units integer;
begin
  if p_sequence not between 1 and 100 then return false; end if;
  suffix:=case
    when mod(p_sequence,100) between 11 and 13 then 'th'
    when mod(p_sequence,10)=1 then 'st'
    when mod(p_sequence,10)=2 then 'nd'
    when mod(p_sequence,10)=3 then 'rd'
    else 'th'
  end;
  if p_wording=p_sequence::text||suffix then return true; end if;

  if p_sequence<=19 then
    english_ordinal:=small_ordinals[p_sequence];
  elsif p_sequence=100 then
    english_ordinal:='one hundredth';
  else
    tens:=p_sequence/10;
    units:=mod(p_sequence,10);
    tens_cardinal:=case tens
      when 2 then 'twenty' when 3 then 'thirty' when 4 then 'forty'
      when 5 then 'fifty' when 6 then 'sixty' when 7 then 'seventy'
      when 8 then 'eighty' when 9 then 'ninety'
    end;
    if units=0 then
      english_ordinal:=case tens
        when 2 then 'twentieth' when 3 then 'thirtieth' when 4 then 'fortieth'
        when 5 then 'fiftieth' when 6 then 'sixtieth' when 7 then 'seventieth'
        when 8 then 'eightieth' when 9 then 'ninetieth'
      end;
    else
      unit_ordinal:=small_ordinals[units];
      english_ordinal:=tens_cardinal||'-'||unit_ordinal;
      english_spaced:=tens_cardinal||' '||unit_ordinal;
    end if;
  end if;
  if p_wording=english_ordinal or (english_spaced is not null and p_wording=english_spaced) then return true; end if;

  if p_sequence<10 then
    chinese_numeral:=chinese_digits[p_sequence];
  elsif p_sequence=10 then
    chinese_numeral:='十';
  elsif p_sequence<20 then
    chinese_numeral:='十'||chinese_digits[mod(p_sequence,10)];
  elsif p_sequence<100 then
    tens:=p_sequence/10;
    units:=mod(p_sequence,10);
    chinese_numeral:=chinese_digits[tens]||'十'||case when units=0 then '' else chinese_digits[units] end;
  else
    chinese_numeral:='一百';
  end if;
  return p_wording in (
    chinese_numeral,
    '第'||chinese_numeral,
    '第'||chinese_numeral||'個',
    '第'||chinese_numeral||'个',
    '第'||p_sequence::text,
    '第'||p_sequence::text||'個',
    '第'||p_sequence::text||'个'
  );
end;
$$;

create function private.template_copilot_v3_direct_evidence_derives_leaf(
  p_fact_id text,p_path text,p_rule text,p_leaf_value jsonb,p_source_text text
) returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $$
declare
  aliases jsonb := $aliases${"enumByScope":{"request.fields:/type":{"text":["文字","文本"],"long_text":["long text","長文字","长文本"],"number":["數字","数字"],"date":["日期"],"currency":["貨幣","货币"],"email":["電郵","电子邮件","邮箱","email field","電郵欄位","电子邮件字段"],"select":["select","dropdown","select list","下拉選單","下拉菜单","下拉列表"],"radio":["radio","single choice","單選","单选"],"checkbox":["checkbox","多選","多选","核取方塊","复选框"],"table":["表格"]},"attachments.requirements:/kind":{"attachment":["uploaded file","pdf","上載檔案","上传文件"],"form":["in-app form","in app form","complete a form in the app","原生","應用程式內表格","在應用程式填寫表格","应用内表单","在应用内填写表单"]},"attachments.requirements:/formats/*":{"text":["文字","文本"],"pdf":["pdf"],"image":["圖片","图片"],"excel_csv":["excel csv","excel/csv","excel","csv","spreadsheet or csv","spreadsheet / csv","試算表或 csv","試算表/csv","电子表格或 csv","电子表格/csv"]},"attachments.requirements:/stage":{"request_submission":["when the request is submitted","提交申請時","提交申请时"]},"attachments.requirements:/contributorPolicy":{"requester_only":["requester only","只限申請人","仅限申请人"],"allow_invited_contributors":["invited colleagues may contribute","可邀請其他同事提供","可邀请其他同事提供","可邀請其他同事","可邀请其他同事"]},"attachments.requirements:/confirmationPolicy":{"none":["no separate confirmation","毋須另行確認","无需另行确认"],"requester_confirms":["requester confirms","由申請人確認","由申请人确认","申請人確認","申请人确认"],"stage_owner_confirms":["step owner confirms","由步驟負責人確認","由步骤负责人确认","該步驟負責人確認","该步骤负责人确认"]},"workflow.stages:/kind":{"approval":["approve","審批","审批","核准","批准"],"review":["審核","审核","覆核","复核","審查","审查","評審","评审"],"for_information":["for information","informational","知會","知会","供參考","供参考","供知悉"],"submission":["submit","提交","呈交"]},"workflow.stages:/participant/mode":{"fixed_email":["fixed email","固定電郵","固定电子邮件","固定電子郵件","固定邮箱"],"directory_position":["directory position","目錄職位","目录职位"],"request_field":["request field","申請欄位","申请字段"],"requester":["申請人","申请人","發起人","发起人"],"unassigned_at_template":["unassigned","resolve later","範本未指派","模板未分配","稍後指定","稍后指定"]},"workflow.conditions:/operator":{"=":["equals","equal","等於","等于","为是"],"!=":["not equal","不等於","不等于"],">":["greater than","大於","大于","超過","超过"],">=":["at least","大於或等於","大于或等于"],"<":["less than","小於","小于"],"<=":["at most","小於或等於","小于或等于"],"contains":["包含"]},"workflow.conditions:/matchingRoute":{"complete":["complete the workflow","完成流程"],"return_for_correction":["return for correction","退回更正"]},"workflow.conditions:/otherwiseRoute":{"complete":["complete the workflow","完成流程"],"return_for_correction":["return for correction","退回更正"]},"notifications.rules:/event":{"request_submitted":["request submitted","申請已提交","申请已提交"],"stage_assigned":["work assigned","assignment","獲指派","分配","工作已分派","工作已分配"],"stage_completed":["step completed","步驟已完成","步骤已完成"],"request_rejected":["request rejected","rejection","拒絕","拒绝","申請被拒絕","申请被拒绝"],"correction_requested":["correction requested","correction","補正","补正","要求更正"],"request_completed":["workflow completed","completion","完成","流程已完成"],"due_soon":["due soon","即將到期","即将到期"],"overdue":["逾期","已逾期"]},"notifications.rules:/recipients/*":{"requester":["申請人","申请人","發起人","发起人"],"current_stage_participants":["current step participants","目前步驟處理人","当前步骤处理人"],"previous_stage_participants":["previous step participants","上一個步驟處理人","上一步骤处理人"],"all_participants":["all workflow participants","所有流程參與者","所有流程参与者"],"workflow_owner":["workflow owner","流程負責部門","流程负责部门"]},"notifications.rules:/timing/mode":{"immediate":["immediately","立即"],"before_due":["before the due time","到期前"],"after_due":["after it becomes overdue","逾期後","逾期后"]},"notifications.rules:/channel":{"default":["company default","公司預設","公司默认"],"in_app":["in app","in-app","in the app","應用程式內","应用内"],"email":["電郵","电子邮件","邮箱","by email","via email","以電郵發送","通过电子邮件发送"],"in_app_and_email":["in the app and by email","in the app and email","應用程式內及電郵","应用内及电子邮件"]},"notifications.rules:/visibility":{"recipients_only":["recipients only","只限收件人","仅限收件人"],"all_participants":["all workflow participants","所有流程參與者","所有流程参与者"]},"notifications.rules:/stage":{}},"boolean":{"true":["true","yes","required","是","需要","必填","必須","必须","必須提供","必须提供"],"false":["false","no","not required","optional","否","不需要","非必須","非必须","選填","选填"]},"ordinal":{"1":["1","first","1st","第一","一","第一個","第一个"],"2":["2","second","2nd","第二","二","第二個","第二个"],"3":["3","third","3rd","第三","三","第三個","第三个"],"4":["4","fourth","4th","第四","四","第四個","第四个"],"5":["5","fifth","5th","第五","五","第五個","第五个"]},"emptyCollection":["none","no options","no formats","not applicable","無","无","沒有","没有","沒有選項","没有选项","沒有格式","没有格式","不適用","不适用"]}$aliases$::jsonb;
  wording text := private.template_copilot_v3_normalize_lexical_text(p_source_text);
  leaf_text text := p_leaf_value #>> '{}';
  canonical text;
  alias text;
  canonical_decimal text;
  canonical_integer text;
  canonical_fraction text;
  negative boolean;
  ordinal_limit integer;
begin
  if p_rule='exact' then return jsonb_typeof(p_leaf_value)='string' and p_source_text=leaf_text; end if;
  if p_rule='nfkc_trim_collapse' then return jsonb_typeof(p_leaf_value)='string' and private.template_copilot_v3_normalize_trim_collapse_text(p_source_text)=leaf_text; end if;
  if p_rule='enum_lexical' then
    if jsonb_typeof(p_leaf_value)<>'string'
       or not private.template_copilot_v3_enum_leaf_is_allowed(p_fact_id,p_path,leaf_text) then return false; end if;
    canonical:=private.template_copilot_v3_normalize_lexical_text(leaf_text);
    if wording=canonical then return true; end if;
    if left(leaf_text,6)='stage:' or left(leaf_text,10)='condition:' then
      if wording=private.template_copilot_v3_normalize_lexical_text(substr(leaf_text,strpos(leaf_text,':')+1)) then return true; end if;
    end if;
    if private.template_copilot_v3_enum_alias_matches(p_fact_id,p_path,leaf_text,wording,aliases) then return true; end if;
    return false;
  end if;
  if p_rule='boolean_lexical' then
    if jsonb_typeof(p_leaf_value)<>'boolean' then return false; end if;
    for alias in select value from jsonb_array_elements_text(aliases->'boolean'->(case when p_leaf_value='true'::jsonb then 'true' else 'false' end)) loop
      if wording=private.template_copilot_v3_normalize_lexical_text(alias) then return true; end if;
    end loop;
    return false;
  end if;
  if p_rule='numeric_lexical' then
    if jsonb_typeof(p_leaf_value)<>'number'
       or not private.template_copilot_v3_number_is_canonical(p_leaf_value) then return false; end if;
    ordinal_limit:=case
      when p_fact_id='workflow.stages' and p_path='/sequence' then 100
      when p_fact_id='workflow.conditions' and p_path='/sequence' then 50
      else null
    end;
    if ordinal_limit is not null and leaf_text~'^[1-9][0-9]*$'
       and leaf_text::integer between 1 and ordinal_limit
       and private.template_copilot_v3_ordinal_alias_matches(leaf_text::integer,wording) then return true; end if;
    if wording!~'^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$' and wording!~'^[+-]?[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?$' then return false; end if;
    canonical_decimal:=replace(wording,',','');
    negative:=false;
    if left(canonical_decimal,1)='+' then
      canonical_decimal:=substr(canonical_decimal,2);
    elsif left(canonical_decimal,1)='-' then
      negative:=true;
      canonical_decimal:=substr(canonical_decimal,2);
    end if;
    canonical_integer:=split_part(canonical_decimal,'.',1);
    if strpos(canonical_decimal,'.')>0 then
      canonical_fraction:=regexp_replace(split_part(canonical_decimal,'.',2),'0+$','');
    else
      canonical_fraction:='';
    end if;
    canonical_decimal:=case
      when canonical_fraction<>'' then canonical_integer||'.'||canonical_fraction
      else canonical_integer
    end;
    if canonical_decimal='0' then negative:=false; end if;
    if negative then canonical_decimal:='-'||canonical_decimal; end if;
    return canonical_decimal=leaf_text;
  end if;
  if p_rule='explicit_empty_collection' then
    if p_leaf_value not in ('[]'::jsonb,'{}'::jsonb) then return false; end if;
    for alias in select value from jsonb_array_elements_text(aliases->'emptyCollection') loop
      if wording=private.template_copilot_v3_normalize_lexical_text(alias) then return true; end if;
    end loop;
    return false;
  end if;
  return false;
end;
$$;
create function public.apply_template_copilot_v3_evidence_fragments(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_command_hash text,
  p_source_spans jsonb,
  p_known_span_ids jsonb,
  p_fragments jsonb,
  p_evidence_hash text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  receipt public.template_copilot_v2_operation_receipts%rowtype;
  span jsonb; fragment jsonb; binding jsonb; leaf record; required_path text;
  source_message_row_id uuid; source_text text; span_reference text; binding_source_text text;
  start_code_point integer; end_code_point integer;
  canonical_span_material text; canonical_span_id text;
  canonical_bindings jsonb; canonical_missing_paths jsonb;
  canonical_fragment jsonb; canonical_fragment_id text;
  computed_evidence_hash text; before_revision bigint; response jsonb;
  span_count integer; known_count integer; fragment_count integer;
  stored_span_count integer; stored_fragment_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into s from public.template_copilot_sessions
  where id=p_session_id and owner_id=p_actor_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;

  if coalesce(p_expected_revision < 1,true)
     or coalesce(p_idempotency_key !~ '^v3frag:[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$',true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$',true)
     or coalesce(p_evidence_hash !~ '^[0-9a-f]{64}$',true)
     or jsonb_typeof(p_source_spans) is distinct from 'array'
     or jsonb_typeof(p_known_span_ids) is distinct from 'array'
     or jsonb_typeof(p_fragments) is distinct from 'array' then
    return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'shape');
  end if;
  span_count:=jsonb_array_length(p_source_spans); known_count:=jsonb_array_length(p_known_span_ids); fragment_count:=jsonb_array_length(p_fragments);
  if span_count>500 or known_count>2000 or fragment_count not between 1 and 200 then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'shape'); end if;
  if exists(select 1 from jsonb_array_elements(p_source_spans) x(value)
       where private.template_copilot_v3_json_node_count(x.value,0,2,16)>16)
     or exists(select 1 from jsonb_array_elements(p_known_span_ids) x(value)
       where private.template_copilot_v3_json_node_count(x.value,0,0,1)>1)
     or exists(select 1 from jsonb_array_elements(p_fragments) x(value)
       where private.template_copilot_v3_json_node_count(x.value,0,17,10000)>10000)
     or pg_column_size(p_source_spans)::bigint
       +pg_column_size(p_known_span_ids)::bigint
       +pg_column_size(p_fragments)::bigint>16777216 then
    return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'shape');
  end if;
  if octet_length(convert_to(private.template_copilot_v3_stable_json(p_source_spans),'UTF8'))
     +octet_length(convert_to(private.template_copilot_v3_stable_json(p_known_span_ids),'UTF8'))
     +octet_length(convert_to(private.template_copilot_v3_stable_json(p_fragments),'UTF8'))>3145728 then
    return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'shape');
  end if;

  select * into receipt from public.template_copilot_v2_operation_receipts
  where session_id=p_session_id and idempotency_key=p_idempotency_key;
  if found then
    if receipt.command_hash is distinct from p_command_hash then
      perform private.audit_template_copilot_v3_evidence_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,s.revision,'idempotency_conflict',0,0,null,null);
      return jsonb_build_object('outcome','idempotency_conflict');
    end if;
    perform private.audit_template_copilot_v3_evidence_attempt(
      p_session_id,p_actor_id,p_idempotency_key,receipt.command_hash,s.revision,s.revision,'replayed_exact',
      coalesce((receipt.response->>'newSourceSpanCount')::integer,0)+coalesce((receipt.response->>'knownSourceSpanCount')::integer,0),
      coalesce((receipt.response->>'fragmentDeltaCount')::integer,0),receipt.response->>'evidenceHash',null
    );
    return receipt.response || jsonb_build_object('outcome','replayed','currentRevision',s.revision);
  end if;
  if s.revision is distinct from p_expected_revision then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'stale_revision',span_count,known_count,fragment_count,p_evidence_hash,null); end if;
  if s.status is distinct from 'interviewing' or jsonb_typeof(s.ledger) is distinct from 'object' or s.ledger->'schemaVersion' is distinct from '2'::jsonb then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_transition',span_count,known_count,fragment_count,p_evidence_hash,'state'); end if;

  select count(*) into stored_span_count from private.template_copilot_v3_source_spans where session_id=p_session_id and owner_id=p_actor_id;
  select count(*) into stored_fragment_count from private.template_copilot_v3_fragments where session_id=p_session_id and owner_id=p_actor_id;
  if stored_span_count+span_count>2000 or stored_fragment_count+fragment_count>1000 then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_transition',span_count,known_count,fragment_count,p_evidence_hash,'state'); end if;

  if exists(select 1 from jsonb_array_elements(p_known_span_ids) k(value) where jsonb_typeof(k.value) is distinct from 'string' or k.value#>>'{}' !~ '^[0-9a-f]{64}$')
     or exists(select k.value#>>'{}' from jsonb_array_elements(p_known_span_ids) k(value) group by k.value#>>'{}' having count(*)<>1)
     or exists(select 1 from jsonb_array_elements_text(p_known_span_ids) k(value) where not exists(select 1 from private.template_copilot_v3_source_spans x where x.session_id=p_session_id and x.owner_id=p_actor_id and x.span_id=k.value)) then
    return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span');
  end if;

  for span in select value from jsonb_array_elements(p_source_spans) loop
    if jsonb_typeof(span) is distinct from 'object' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    if jsonb_typeof(span->'spanId') is distinct from 'string' or jsonb_typeof(span->'messageId') is distinct from 'string' or jsonb_typeof(span->'startCodePoint') is distinct from 'number' or jsonb_typeof(span->'endCodePoint') is distinct from 'number' or jsonb_typeof(span->'exactText') is distinct from 'string' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    if jsonb_typeof(span) is distinct from 'object' or not(span?&array['spanId','messageId','startCodePoint','endCodePoint','exactText'])
       or (span-array['spanId','messageId','startCodePoint','endCodePoint','exactText'])<>'{}'::jsonb
       or jsonb_typeof(span->'spanId') is distinct from 'string' or jsonb_typeof(span->'messageId') is distinct from 'string'
       or jsonb_typeof(span->'startCodePoint') is distinct from 'number' or jsonb_typeof(span->'endCodePoint') is distinct from 'number'
       or jsonb_typeof(span->'exactText') is distinct from 'string' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    if span->>'spanId' !~ '^[0-9a-f]{64}$' or span->>'messageId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
       or span->>'startCodePoint' !~ '^[0-9]{1,5}$' or span->>'endCodePoint' !~ '^[0-9]{1,5}$' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    start_code_point:=(span->>'startCodePoint')::integer; end_code_point:=(span->>'endCodePoint')::integer;
    if start_code_point<0 or end_code_point<=start_code_point or end_code_point>80000
       or char_length(span->>'exactText') not between 1 and 8000
       or not private.template_copilot_v3_text_has_non_whitespace(span->>'exactText')
       or char_length(span->>'exactText')<>end_code_point-start_code_point then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    select message.id,message.content into source_message_row_id,source_text from public.template_copilot_messages message
    where message.session_id=p_session_id and message.owner_id=p_actor_id and message.client_message_id=span->>'messageId' and message.role='user';
    if not found or char_length(source_text)>80000 or substring(source_text from start_code_point+1 for end_code_point-start_code_point) is distinct from span->>'exactText' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
    canonical_span_material:=octet_length(convert_to((span->>'messageId'),'UTF8'))::text||':'||(span->>'messageId')||'|'||octet_length(convert_to(start_code_point::text,'UTF8'))::text||':'||start_code_point::text||'|'||octet_length(convert_to(end_code_point::text,'UTF8'))::text||':'||end_code_point::text||'|'||octet_length(convert_to((span->>'exactText'),'UTF8'))::text||':'||(span->>'exactText');
    canonical_span_id:=encode(sha256(convert_to(canonical_span_material,'UTF8')),'hex');
    if span->>'spanId' is distinct from canonical_span_id or exists(select 1 from private.template_copilot_v3_source_spans x where x.session_id=p_session_id and x.span_id=canonical_span_id) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;
  end loop;
  if exists(select x.value->>'spanId' from jsonb_array_elements(p_source_spans)x(value) group by x.value->>'spanId' having count(*)<>1)
     or exists(select 1 from jsonb_array_elements(p_source_spans)x(value) join jsonb_array_elements_text(p_known_span_ids)k(value) on k.value=x.value->>'spanId') then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'source_span'); end if;

  -- Containment is legitimate quotation reuse; only a < b < A < B crossing is rejected.
  if exists(select 1 from jsonb_array_elements(p_source_spans) with ordinality a(value,n),jsonb_array_elements(p_source_spans) with ordinality b(value,n)
    where a.n<b.n and a.value->>'messageId'=b.value->>'messageId' and (((a.value->>'startCodePoint')::int<(b.value->>'startCodePoint')::int and (b.value->>'startCodePoint')::int<(a.value->>'endCodePoint')::int and (a.value->>'endCodePoint')::int<(b.value->>'endCodePoint')::int) or ((b.value->>'startCodePoint')::int<(a.value->>'startCodePoint')::int and (a.value->>'startCodePoint')::int<(b.value->>'endCodePoint')::int and (b.value->>'endCodePoint')::int<(a.value->>'endCodePoint')::int)))
    or exists(select 1 from jsonb_array_elements(p_source_spans)a(value) join private.template_copilot_v3_source_spans b on b.session_id=p_session_id and b.message_id=a.value->>'messageId'
      where (((a.value->>'startCodePoint')::int<b.start_code_point and b.start_code_point<(a.value->>'endCodePoint')::int and (a.value->>'endCodePoint')::int<b.end_code_point) or (b.start_code_point<(a.value->>'startCodePoint')::int and (a.value->>'startCodePoint')::int<b.end_code_point and b.end_code_point<(a.value->>'endCodePoint')::int))) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'overlap'); end if;

  for fragment in select value from jsonb_array_elements(p_fragments) loop
    if jsonb_typeof(fragment) is distinct from 'object' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    if jsonb_typeof(fragment->'value') is distinct from 'object' or jsonb_typeof(fragment->'bindings') is distinct from 'array' or jsonb_typeof(fragment->'missingPaths') is distinct from 'array' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    if jsonb_typeof(fragment) is distinct from 'object' or not(fragment?&array['evidenceVersion','compilerVersion','fragmentId','factId','fragmentKind','state','value','bindings','missingPaths','confidence','ambiguity'])
       or (fragment-array['evidenceVersion','compilerVersion','fragmentId','factId','fragmentKind','state','value','bindings','missingPaths','confidence','ambiguity','ambiguityNote'])<>'{}'::jsonb
       or fragment->'evidenceVersion' is distinct from '3'::jsonb
       or jsonb_typeof(fragment->'compilerVersion') is distinct from 'string' or fragment->>'compilerVersion' is distinct from 'template-copilot-v3.0'
       or jsonb_typeof(fragment->'fragmentId') is distinct from 'string' or fragment->>'fragmentId' !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(fragment->'factId') is distinct from 'string' or fragment->>'factId' not in ('request.fields','attachments.requirements','workflow.stages','workflow.conditions','notifications.rules')
       or jsonb_typeof(fragment->'fragmentKind') is distinct from 'string' or fragment->>'fragmentKind' is distinct from 'array_item'
       or jsonb_typeof(fragment->'state') is distinct from 'string' or fragment->>'state' is distinct from 'open'
       or jsonb_typeof(fragment->'value') is distinct from 'object' or not private.template_copilot_v3_json_value_is_bounded(fragment->'value',0)
       or jsonb_typeof(fragment->'bindings') is distinct from 'array' or jsonb_typeof(fragment->'missingPaths') is distinct from 'array'
       or jsonb_typeof(fragment->'confidence') is distinct from 'string' or fragment->>'confidence' not in ('low','medium','high')
       or jsonb_typeof(fragment->'ambiguity') is distinct from 'string' or fragment->>'ambiguity' not in ('none','possible','ambiguous')
       or (fragment?'ambiguityNote' and (jsonb_typeof(fragment->'ambiguityNote') is distinct from 'string' or char_length(fragment->>'ambiguityNote')>500))
       or jsonb_array_length(fragment->'bindings') not between 1 and 200 or jsonb_array_length(fragment->'missingPaths') not between 1 and 200 then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    if (fragment->>'ambiguity'='none' and fragment?'ambiguityNote')
       or (fragment->>'ambiguity' in ('possible','ambiguous') and not(fragment?'ambiguityNote'))
       or (fragment?'ambiguityNote' and (not private.template_copilot_v3_text_has_non_whitespace(fragment->>'ambiguityNote')
         or not private.template_copilot_v3_fragment_text_has_canonical_edges(fragment->>'ambiguityNote'))) then
      return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment');
    end if;

    for leaf in select * from private.template_copilot_v3_primitive_leaves(fragment->'value','') loop
      if not private.template_copilot_v3_fragment_leaf_is_canonical(fragment->>'factId',leaf.path,leaf.leaf_value) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    end loop;
    if fragment->>'factId'='attachments.requirements' then
      if fragment->'value'?'formats' and exists(select f.value from jsonb_array_elements_text(fragment->'value'->'formats')f(value)
        group by f.value having count(*)<>1) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment');
      end if;
      if fragment->'value'->>'kind'='attachment' and fragment->'value'?'formats' and jsonb_array_length(fragment->'value'->'formats')=0 then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'kind'='form' and ((fragment->'value'?'formats' and jsonb_array_length(fragment->'value'->'formats')>0) or fragment->'value'?'maximumFileSizeMb' or fragment->'missingPaths' @> '["/maximumFileSizeMb"]'::jsonb) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->'required'='true'::jsonb and fragment->'value'?'minimumQuantity' and (fragment->'value'->>'minimumQuantity')::numeric<1 then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'?&array['minimumQuantity','maximumQuantity'] and (fragment->'value'->>'maximumQuantity')::numeric<(fragment->'value'->>'minimumQuantity')::numeric then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'stage'='request_submission' and fragment->'value'->>'confirmationPolicy'='stage_owner_confirms' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    end if;
    if fragment->>'factId'='workflow.stages' then
      if fragment->'value'->'participant'->>'mode' in ('requester','unassigned_at_template') and (fragment->'value'->'participant'?'value' or fragment->'missingPaths' @> '["/participant/value"]'::jsonb) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->'participant'->>'mode'='fixed_email' and fragment->'value'->'participant'?'value' and (left(fragment->'value'->'participant'->>'value',1)='.' or fragment->'value'->'participant'->>'value' like '%.@%' or fragment->'value'->'participant'->>'value' like '%..%' or fragment->'value'->'participant'->>'value' !~ '^[A-Za-z0-9_+''.-]+@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$') then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    end if;
    if fragment->>'factId'='workflow.conditions' then
      if fragment->'value'?&array['currency','unit'] then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'?&array['matchingRoute','otherwiseRoute'] and fragment->'value'->>'matchingRoute'=fragment->'value'->>'otherwiseRoute' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'operator' in ('>','>=','<','<=') and fragment->'value'?'value' and jsonb_typeof(fragment->'value'->'value')<>'number' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'operator'='contains' and fragment->'value'?'value' and jsonb_typeof(fragment->'value'->'value')<>'string' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    end if;
    if fragment->>'factId'='notifications.rules' then
      if fragment->'value'?'recipients' and exists(select r.value from jsonb_array_elements_text(fragment->'value'->'recipients')r(value) group by r.value having count(*)<>1) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->'timing'->>'mode'='immediate' and (fragment->'value'->'timing'?'offsetHours' or fragment->'missingPaths' @> '["/timing/offsetHours"]'::jsonb) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'event'='due_soon' and fragment->'value'->'timing'?'mode' and fragment->'value'->'timing'->>'mode'<>'before_due' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'->>'event'='overdue' and fragment->'value'->'timing'?'mode' and fragment->'value'->'timing'->>'mode'<>'after_due' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
      if fragment->'value'?'event' and fragment->'value'->>'event' not in ('due_soon','overdue') and fragment->'value'->'timing'?'mode' and fragment->'value'->'timing'->>'mode'<>'immediate' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
    end if;
    for binding in select value from jsonb_array_elements(fragment->'bindings') loop
      if jsonb_typeof(binding) is distinct from 'object' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
      if jsonb_typeof(binding->'path') is distinct from 'string' or jsonb_typeof(binding->'spanIds') is distinct from 'array' or jsonb_typeof(binding->'rule') is distinct from 'string' then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
      if jsonb_typeof(binding) is distinct from 'object' or not(binding?&array['path','spanIds','rule']) or (binding-array['path','spanIds','rule'])<>'{}'::jsonb
         or jsonb_typeof(binding->'path') is distinct from 'string' or jsonb_typeof(binding->'spanIds') is distinct from 'array' or jsonb_typeof(binding->'rule') is distinct from 'string'
         or char_length(binding->>'path')>256 or binding->>'path' !~ '^(?:/$|/(?:[A-Za-z0-9_.-]|~[01])+(?:/(?:[A-Za-z0-9_.-]|~[01])+)*$)'
         or jsonb_array_length(binding->'spanIds') not between 1 and 16
         or exists(select 1 from jsonb_array_elements(binding->'spanIds')i(value) where jsonb_typeof(i.value) is distinct from 'string' or i.value#>>'{}' !~ '^[0-9a-f]{64}$')
         or exists(select i.value#>>'{}' from jsonb_array_elements(binding->'spanIds')i(value) group by i.value#>>'{}' having count(*)<>1) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
      select * into leaf from private.template_copilot_v3_primitive_leaves(fragment->'value','') l where l.path=binding->>'path';
      if not found or not private.template_copilot_v3_binding_rule_is_compatible(fragment->>'factId',leaf.path,leaf.leaf_value,binding->>'rule') then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
      for span_reference in select value from jsonb_array_elements_text(binding->'spanIds') loop
        if not exists(select 1 from jsonb_array_elements(p_source_spans)x(value) where x.value->>'spanId'=span_reference)
           and not exists(select 1 from jsonb_array_elements_text(p_known_span_ids)k(value) where k.value=span_reference) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
        select coalesce(
          (select x.value->>'exactText' from jsonb_array_elements(p_source_spans)x(value) where x.value->>'spanId'=span_reference),
          (select stored.exact_text from private.template_copilot_v3_source_spans stored where stored.session_id=p_session_id and stored.owner_id=p_actor_id and stored.span_id=span_reference)
        ) into binding_source_text;
        if binding_source_text is null or not private.template_copilot_v3_direct_evidence_derives_leaf(fragment->>'factId',binding->>'path',binding->>'rule',leaf.leaf_value,binding_source_text) then
          return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding');
        end if;      end loop;
    end loop;
    if exists(select b.value->>'path' from jsonb_array_elements(fragment->'bindings')b(value)
      group by b.value->>'path' having count(*)<>1) then
      return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding');
    end if;
    if exists(select path from private.template_copilot_v3_primitive_leaves(fragment->'value','') except select value->>'path' from jsonb_array_elements(fragment->'bindings'))
       or exists(select value->>'path' from jsonb_array_elements(fragment->'bindings') except select path from private.template_copilot_v3_primitive_leaves(fragment->'value','')) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
    if exists(select 1 from jsonb_array_elements(fragment->'missingPaths')m(value) where jsonb_typeof(m.value) is distinct from 'string' or not private.template_copilot_v3_missing_path_is_allowed(fragment->>'factId',m.value#>>'{}'))
       or exists(select m.value#>>'{}' from jsonb_array_elements(fragment->'missingPaths')m(value) group by m.value#>>'{}' having count(*)<>1)
       or exists(select 1 from jsonb_array_elements_text(fragment->'missingPaths')a(value),jsonb_array_elements_text(fragment->'missingPaths')b(value) where a.value<b.value and (a.value=b.value or private.template_copilot_v3_pointer_contains(b.value,a.value) or private.template_copilot_v3_pointer_contains(a.value,b.value)))
       or exists(select 1 from jsonb_array_elements_text(fragment->'missingPaths')m(value) join jsonb_array_elements(fragment->'bindings')b(value) on b.value->>'path'=m.value or private.template_copilot_v3_pointer_contains(m.value,b.value->>'path') or private.template_copilot_v3_pointer_contains(b.value->>'path',m.value)) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
    for required_path in select * from private.template_copilot_v3_required_fragment_paths(fragment->>'factId',fragment->'value') loop
      if not exists(select 1 from jsonb_array_elements(fragment->'bindings')b(value) where b.value->>'path'=required_path or private.template_copilot_v3_pointer_contains(required_path,b.value->>'path'))
         and not exists(select 1 from jsonb_array_elements_text(fragment->'missingPaths')m(value) where (required_path in ('/participant/value','/timing/offsetHours','/stage') and m.value=required_path) or (required_path not in ('/participant/value','/timing/offsetHours','/stage') and private.template_copilot_v3_pointer_contains(m.value,required_path))) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'binding'); end if;
    end loop;
    select jsonb_agg(jsonb_build_object('path',b.value->>'path','spanIds',(select jsonb_agg(to_jsonb(i.value) order by i.value collate "C") from jsonb_array_elements_text(b.value->'spanIds')i(value)),'rule',b.value->>'rule') order by private.template_copilot_v3_stable_json(b.value) collate "C") into canonical_bindings from jsonb_array_elements(fragment->'bindings')b(value);
    select coalesce(jsonb_agg(to_jsonb(m.value) order by m.value collate "C"),'[]'::jsonb) into canonical_missing_paths from jsonb_array_elements_text(fragment->'missingPaths')m(value);
    canonical_fragment:=jsonb_build_object('evidenceVersion',3,'compilerVersion','template-copilot-v3.0','factId',fragment->>'factId','fragmentKind','array_item','value',fragment->'value','bindings',canonical_bindings,'missingPaths',canonical_missing_paths,'confidence',fragment->'confidence','ambiguity',fragment->'ambiguity','ambiguityNote',coalesce(fragment->'ambiguityNote','null'::jsonb));
    canonical_fragment_id:=encode(sha256(convert_to(private.template_copilot_v3_stable_json(canonical_fragment),'UTF8')),'hex');
    if fragment->>'fragmentId' is distinct from canonical_fragment_id or exists(select 1 from private.template_copilot_v3_fragments x where x.session_id=p_session_id and x.fragment_id=canonical_fragment_id) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'fragment'); end if;
  end loop;

  if exists(select x.value->>'fragmentId' from jsonb_array_elements(p_fragments)x(value) group by x.value->>'fragmentId' having count(*)<>1)
     or exists(select id from (select x.value->>'spanId' id from jsonb_array_elements(p_source_spans)x(value) union all select value from jsonb_array_elements_text(p_known_span_ids)) supplied where not exists(select 1 from jsonb_array_elements(p_fragments)f(value) cross join lateral jsonb_array_elements(f.value->'bindings')b(value) cross join lateral jsonb_array_elements_text(b.value->'spanIds')i(value) where i.value=supplied.id)) then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'unused_span'); end if;
  computed_evidence_hash:=encode(sha256(convert_to('v3frag|new:'||coalesce((select string_agg(x.value->>'spanId',',' order by x.value->>'spanId' collate "C") from jsonb_array_elements(p_source_spans)x(value)),'')||'|known:'||coalesce((select string_agg(k.value,',' order by k.value collate "C") from jsonb_array_elements_text(p_known_span_ids)k(value)),'')||'|fragments:'||coalesce((select string_agg(f.value->>'fragmentId',',' order by f.value->>'fragmentId' collate "C") from jsonb_array_elements(p_fragments)f(value)),''),'UTF8')),'hex');
  if p_evidence_hash is distinct from computed_evidence_hash then return private.template_copilot_v3_reject_append(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,s.revision,'invalid_command',span_count,known_count,fragment_count,p_evidence_hash,'evidence_hash'); end if;

  before_revision:=s.revision;
  for span in select value from jsonb_array_elements(p_source_spans) loop
    select message.id into source_message_row_id from public.template_copilot_messages message where message.session_id=p_session_id and message.owner_id=p_actor_id and message.client_message_id=span->>'messageId' and message.role='user';
    insert into private.template_copilot_v3_source_spans(session_id,owner_id,span_id,source_message_id,message_id,start_code_point,end_code_point,exact_text,created_revision)
    values(p_session_id,p_actor_id,span->>'spanId',source_message_row_id,span->>'messageId',(span->>'startCodePoint')::int,(span->>'endCodePoint')::int,span->>'exactText',before_revision+1);
  end loop;
  for fragment in select value from jsonb_array_elements(p_fragments) loop
    select jsonb_agg(jsonb_build_object('path',b.value->>'path','spanIds',(select jsonb_agg(to_jsonb(i.value) order by i.value collate "C") from jsonb_array_elements_text(b.value->'spanIds')i(value)),'rule',b.value->>'rule') order by private.template_copilot_v3_stable_json(b.value) collate "C") into canonical_bindings from jsonb_array_elements(fragment->'bindings')b(value);
    select coalesce(jsonb_agg(to_jsonb(m.value) order by m.value collate "C"),'[]'::jsonb) into canonical_missing_paths from jsonb_array_elements_text(fragment->'missingPaths')m(value);
    insert into private.template_copilot_v3_fragments(session_id,owner_id,fragment_id,evidence_version,compiler_version,fact_id,fragment_kind,value,bindings,missing_paths,confidence,ambiguity,ambiguity_note,created_revision)
    values(p_session_id,p_actor_id,fragment->>'fragmentId',3,'template-copilot-v3.0',fragment->>'factId','array_item',fragment->'value',canonical_bindings,canonical_missing_paths,fragment->>'confidence',fragment->>'ambiguity',fragment->>'ambiguityNote',before_revision+1);
  end loop;
  update public.template_copilot_sessions set revision=revision+1,updated_at=clock_timestamp() where id=p_session_id and owner_id=p_actor_id and revision=before_revision returning * into s;
  if not found then raise exception using errcode='40001',message='template_copilot_v3_revision_lost'; end if;
  response:=jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'evidenceVersion',3,'compilerVersion','template-copilot-v3.0','newSourceSpanCount',span_count,'knownSourceSpanCount',known_count,'sourceSpanCount',stored_span_count+span_count,'fragmentDeltaCount',fragment_count,'fragmentCount',stored_fragment_count+fragment_count,'evidenceHash',computed_evidence_hash);
  insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response) values(p_session_id,p_idempotency_key,p_command_hash,response);
  perform private.audit_template_copilot_v3_evidence_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,before_revision,s.revision,'applied',span_count+known_count,fragment_count,computed_evidence_hash,null);
  return response;
end;
$$;

revoke all on function
  private.template_copilot_v3_text_has_non_whitespace(text),
  private.template_copilot_v3_primitive_leaves(jsonb,text),
  private.template_copilot_v3_required_fragment_paths(text,jsonb),
  private.template_copilot_v3_missing_path_is_allowed(text,text),
  private.template_copilot_v3_binding_rule_is_compatible(text,text,jsonb,text),
  private.template_copilot_v3_fragment_leaf_is_canonical(text,text,jsonb)
from public,anon,authenticated,service_role;
alter table private.template_copilot_v3_source_spans
  add constraint template_copilot_v3_source_spans_unicode_text_check
  check (private.template_copilot_v3_text_has_non_whitespace(exact_text));
alter table private.template_copilot_v3_fragments
  add constraint template_copilot_v3_fragments_ambiguity_note_check
  check (
    (ambiguity='none' and ambiguity_note is null)
    or (
      ambiguity in ('possible','ambiguous')
      and ambiguity_note is not null
      and private.template_copilot_v3_text_has_non_whitespace(ambiguity_note)
      and private.template_copilot_v3_fragment_text_has_canonical_edges(ambiguity_note)
    )
  );

revoke all on function private.template_copilot_v3_dynamic_stage_reference_is_canonical(text), private.template_copilot_v3_enum_leaf_is_allowed(text,text,text), private.template_copilot_v3_enum_alias_matches(text,text,text,text,jsonb), private.template_copilot_v3_ordinal_alias_matches(integer,text), private.template_copilot_v3_normalize_trim_collapse_text(text), private.template_copilot_v3_normalize_lexical_text(text), private.template_copilot_v3_direct_evidence_derives_leaf(text,text,text,jsonb,text), private.template_copilot_v3_fragment_text_has_canonical_edges(text), private.template_copilot_v3_pointer_contains(text,text), private.template_copilot_v3_reject_append(uuid,uuid,text,text,bigint,text,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.apply_template_copilot_v3_evidence_fragments(uuid,uuid,bigint,text,text,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_template_copilot_v3_evidence_fragments(uuid,uuid,bigint,text,text,jsonb,jsonb,jsonb,text) to service_role;
