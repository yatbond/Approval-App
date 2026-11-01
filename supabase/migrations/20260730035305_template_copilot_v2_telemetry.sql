-- Privacy-minimized Template Copilot v2 operational telemetry.
--
-- The event store lives in the unexposed private schema and contains no raw
-- answer, prompt, transcript, document, name, email, or authoritative workflow
-- state. Browser roles receive no table or function access. Server writes and
-- active-Admin reads pass through narrow, validated service-role RPCs.

create table private.template_copilot_v2_telemetry_events (
  event_id uuid primary key,
  schema_version smallint not null default 1 check (schema_version = 1),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  session_pseudonym text not null
    check (session_pseudonym ~ '^hmac-sha256:[0-9a-f]{64}$'),
  actor_pseudonym text not null
    check (actor_pseudonym ~ '^hmac-sha256:[0-9a-f]{64}$'),
  locale text not null check (locale in ('en','zh-Hant','zh-Hans')),
  mode text not null
    check (mode in ('guided','describe_everything','similar_template')),
  event_type text not null check (event_type in (
    'question_selected',
    'candidate_recorded',
    'conflict_recorded',
    'readiness_changed',
    'compile_completed',
    'validation_completed',
    'provider_call_completed',
    'accessibility_checkpoint',
    'pilot_observation_recorded'
  )),
  revision bigint not null check (revision >= 1),
  question_id text
    check (question_id is null or question_id ~ '^[a-z0-9_.:-]{1,96}$'),
  outcome_code text not null
    check (outcome_code ~ '^[a-z0-9_.:-]{1,96}$'),
  readiness text check (readiness is null or readiness in (
    'incomplete','draft_ready','publication_ready','activation_ready'
  )),
  provider jsonb,
  counts jsonb not null,
  check (expires_at > recorded_at),
  check (jsonb_typeof(counts) = 'object'),
  check (provider is null or jsonb_typeof(provider) = 'object')
);

create index template_copilot_v2_telemetry_occurred_idx
  on private.template_copilot_v2_telemetry_events
  (occurred_at desc, event_id desc);

create index template_copilot_v2_telemetry_expiry_idx
  on private.template_copilot_v2_telemetry_events
  (expires_at, event_id);

alter table private.template_copilot_v2_telemetry_events enable row level security;
alter table private.template_copilot_v2_telemetry_events force row level security;
revoke all on table private.template_copilot_v2_telemetry_events
  from public, anon, authenticated, service_role;

create function public.record_template_copilot_v2_telemetry(
  p_event_id uuid,
  p_occurred_at timestamptz,
  p_session_pseudonym text,
  p_actor_pseudonym text,
  p_locale text,
  p_mode text,
  p_event_type text,
  p_revision bigint,
  p_question_id text,
  p_outcome_code text,
  p_readiness text,
  p_provider jsonb,
  p_counts jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_key text;
  metric_value jsonb;
  provider_key text;
  inserted_count bigint;
begin
  if p_event_id is null
     or p_occurred_at is null
     or p_occurred_at < clock_timestamp() - interval '1 day'
     or p_occurred_at > clock_timestamp() + interval '10 minutes'
     or p_session_pseudonym is null
     or p_session_pseudonym !~ '^hmac-sha256:[0-9a-f]{64}$'
     or p_actor_pseudonym is null
     or p_actor_pseudonym !~ '^hmac-sha256:[0-9a-f]{64}$'
     or p_locale is null
     or p_locale not in ('en','zh-Hant','zh-Hans')
     or p_mode is null
     or p_mode not in ('guided','describe_everything','similar_template')
     or p_event_type is null
     or p_event_type not in (
       'question_selected',
       'candidate_recorded',
       'conflict_recorded',
       'readiness_changed',
       'compile_completed',
       'validation_completed',
       'provider_call_completed',
       'accessibility_checkpoint',
       'pilot_observation_recorded'
     )
     or p_revision is null
     or p_revision < 1
     or (p_question_id is not null and p_question_id !~ '^[a-z0-9_.:-]{1,96}$')
     or p_outcome_code is null
     or p_outcome_code !~ '^[a-z0-9_.:-]{1,96}$'
     or (p_readiness is not null and p_readiness not in (
       'incomplete','draft_ready','publication_ready','activation_ready'
     ))
     or jsonb_typeof(p_counts) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'template_copilot_v2_telemetry_invalid';
  end if;

  for metric_key, metric_value in
    select key, value from jsonb_each(p_counts)
  loop
    if metric_key !~ '^[a-z0-9_.:-]{1,96}$'
       or jsonb_typeof(metric_value) <> 'number' then
      raise exception using
        errcode = '22023',
        message = 'template_copilot_v2_telemetry_counts_invalid';
    end if;
    if (metric_value #>> '{}')::numeric < 0
       or (metric_value #>> '{}')::numeric > 1000000
       or trunc((metric_value #>> '{}')::numeric) <> (metric_value #>> '{}')::numeric then
      raise exception using
        errcode = '22023',
        message = 'template_copilot_v2_telemetry_counts_invalid';
    end if;
  end loop;

  if p_provider is not null then
    if jsonb_typeof(p_provider) <> 'object'
       or not (p_provider ?& array[
         'providerCode','modelCode','privacyMode','outcome','latencyMs'
       ])
       or (select count(*) from jsonb_object_keys(p_provider)) not between 5 and 8 then
      raise exception using
        errcode = '22023',
        message = 'template_copilot_v2_telemetry_provider_invalid';
    end if;
    for provider_key in select jsonb_object_keys(p_provider)
    loop
      if provider_key not in (
        'providerCode','modelCode','privacyMode','outcome','latencyMs',
        'inputTokens','outputTokens','estimatedCostUsd'
      ) then
        raise exception using
          errcode = '22023',
          message = 'template_copilot_v2_telemetry_provider_invalid';
      end if;
    end loop;
    if jsonb_typeof(p_provider->'providerCode') <> 'string'
       or (p_provider->>'providerCode') !~ '^[a-z0-9_.:-]{1,96}$'
       or jsonb_typeof(p_provider->'modelCode') <> 'string'
       or (p_provider->>'modelCode') !~ '^[a-z0-9_.:-]{1,96}$'
       or jsonb_typeof(p_provider->'privacyMode') <> 'string'
       or (p_provider->>'privacyMode') not in ('zdr','standard')
       or jsonb_typeof(p_provider->'outcome') <> 'string'
       or (p_provider->>'outcome') not in (
         'success','outage','timeout','malformed_output','privacy_route_rejected'
       )
       or jsonb_typeof(p_provider->'latencyMs') <> 'number'
       or (
         p_provider ? 'inputTokens'
         and jsonb_typeof(p_provider->'inputTokens') <> 'number'
       )
       or (
         p_provider ? 'outputTokens'
         and jsonb_typeof(p_provider->'outputTokens') <> 'number'
       )
       or (
         p_provider ? 'estimatedCostUsd'
         and jsonb_typeof(p_provider->'estimatedCostUsd') <> 'number'
       ) then
      raise exception using
        errcode = '22023',
        message = 'template_copilot_v2_telemetry_provider_invalid';
    end if;
    if (p_provider->>'latencyMs')::numeric not between 0 and 300000
       or trunc((p_provider->>'latencyMs')::numeric) <> (p_provider->>'latencyMs')::numeric then
      raise exception using
        errcode = '22023',
        message = 'template_copilot_v2_telemetry_provider_invalid';
    end if;
    if p_provider ? 'inputTokens' then
      if (p_provider->>'inputTokens')::numeric not between 0 and 1000000
         or trunc((p_provider->>'inputTokens')::numeric) <> (p_provider->>'inputTokens')::numeric then
        raise exception using
          errcode = '22023',
          message = 'template_copilot_v2_telemetry_provider_invalid';
      end if;
    end if;
    if p_provider ? 'outputTokens' then
      if (p_provider->>'outputTokens')::numeric not between 0 and 1000000
         or trunc((p_provider->>'outputTokens')::numeric) <> (p_provider->>'outputTokens')::numeric then
        raise exception using
          errcode = '22023',
          message = 'template_copilot_v2_telemetry_provider_invalid';
      end if;
    end if;
    if p_provider ? 'estimatedCostUsd' then
      if (p_provider->>'estimatedCostUsd')::numeric not between 0 and 10000 then
        raise exception using
          errcode = '22023',
          message = 'template_copilot_v2_telemetry_provider_invalid';
      end if;
    end if;
  end if;

  insert into private.template_copilot_v2_telemetry_events (
    event_id,
    occurred_at,
    session_pseudonym,
    actor_pseudonym,
    locale,
    mode,
    event_type,
    revision,
    question_id,
    outcome_code,
    readiness,
    provider,
    counts
  ) values (
    p_event_id,
    p_occurred_at,
    p_session_pseudonym,
    p_actor_pseudonym,
    p_locale,
    p_mode,
    p_event_type,
    p_revision,
    p_question_id,
    p_outcome_code,
    p_readiness,
    p_provider,
    p_counts
  )
  on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 and not exists (
    select 1
    from private.template_copilot_v2_telemetry_events event
    where event.event_id = p_event_id
      and event.session_pseudonym = p_session_pseudonym
      and event.actor_pseudonym = p_actor_pseudonym
      and event.locale = p_locale
      and event.mode = p_mode
      and event.event_type = p_event_type
      and event.revision = p_revision
      and event.question_id is not distinct from p_question_id
      and event.outcome_code = p_outcome_code
      and event.readiness is not distinct from p_readiness
      and event.provider is not distinct from p_provider
      and event.counts = p_counts
  ) then
    raise exception using
      errcode = '23505',
      message = 'template_copilot_v2_telemetry_idempotency_conflict';
  end if;

  return p_event_id;
end;
$$;

create function public.list_template_copilot_v2_telemetry_for_admin(
  p_actor_id uuid,
  p_limit integer default 100,
  p_before timestamptz default null
) returns table (
  event_id uuid,
  occurred_at timestamptz,
  expires_at timestamptz,
  session_pseudonym text,
  actor_pseudonym text,
  locale text,
  mode text,
  event_type text,
  revision bigint,
  question_id text,
  outcome_code text,
  readiness text,
  provider jsonb,
  counts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not private.is_active_approval_admin(p_actor_id) then
    raise exception using
      errcode = '42501',
      message = 'template_copilot_v2_telemetry_forbidden';
  end if;
  return query
  select
    event.event_id,
    event.occurred_at,
    event.expires_at,
    event.session_pseudonym,
    event.actor_pseudonym,
    event.locale,
    event.mode,
    event.event_type,
    event.revision,
    event.question_id,
    event.outcome_code,
    event.readiness,
    event.provider,
    event.counts
  from private.template_copilot_v2_telemetry_events event
  where event.occurred_at < coalesce(p_before, statement_timestamp())
    and event.expires_at > statement_timestamp()
  order by event.occurred_at desc, event.event_id desc
  limit bounded_limit;
end;
$$;

create function public.purge_expired_template_copilot_v2_telemetry(
  p_before timestamptz default statement_timestamp()
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from private.template_copilot_v2_telemetry_events
  where expires_at <= coalesce(p_before, statement_timestamp());
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.record_template_copilot_v2_telemetry(
  uuid,timestamptz,text,text,text,text,text,bigint,text,text,text,jsonb,jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.list_template_copilot_v2_telemetry_for_admin(
  uuid,integer,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_template_copilot_v2_telemetry(
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.record_template_copilot_v2_telemetry(
  uuid,timestamptz,text,text,text,text,text,bigint,text,text,text,jsonb,jsonb
) to service_role;
grant execute on function public.list_template_copilot_v2_telemetry_for_admin(
  uuid,integer,timestamptz
) to service_role;
grant execute on function public.purge_expired_template_copilot_v2_telemetry(
  timestamptz
) to service_role;
