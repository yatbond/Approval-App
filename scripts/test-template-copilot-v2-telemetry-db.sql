begin;

select set_config('app.telemetry_admin', gen_random_uuid()::text, true);
select set_config('app.telemetry_other', gen_random_uuid()::text, true);
select set_config('app.telemetry_event', gen_random_uuid()::text, true);
select set_config(
  'app.telemetry_occurred_at',
  (clock_timestamp() - interval '1 second')::text,
  true
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
(
  current_setting('app.telemetry_admin')::uuid,
  'authenticated',
  'authenticated',
  'template-telemetry-admin@example.com',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Template Telemetry Admin"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
),
(
  current_setting('app.telemetry_other')::uuid,
  'authenticated',
  'authenticated',
  'template-telemetry-other@example.com',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Template Telemetry Other"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update public.profiles
set is_admin = id = current_setting('app.telemetry_admin')::uuid,
    is_active = true,
    role = case
      when id = current_setting('app.telemetry_admin')::uuid then 'superuser'
      else 'participant'
    end
where id in (
  current_setting('app.telemetry_admin')::uuid,
  current_setting('app.telemetry_other')::uuid
);

set local role service_role;

do $$
declare
  first_result uuid;
  replay_result uuid;
  conflict_seen boolean := false;
begin
  first_result := public.record_template_copilot_v2_telemetry(
    current_setting('app.telemetry_event')::uuid,
    current_setting('app.telemetry_occurred_at')::timestamptz,
    'hmac-sha256:' || repeat('a', 64),
    'hmac-sha256:' || repeat('b', 64),
    'en',
    'guided',
    'question_selected',
    1,
    'identity_scope',
    'session_applied',
    null,
    null,
    '{"session_starts":1}'::jsonb
  );
  replay_result := public.record_template_copilot_v2_telemetry(
    current_setting('app.telemetry_event')::uuid,
    current_setting('app.telemetry_occurred_at')::timestamptz,
    'hmac-sha256:' || repeat('a', 64),
    'hmac-sha256:' || repeat('b', 64),
    'en',
    'guided',
    'question_selected',
    1,
    'identity_scope',
    'session_applied',
    null,
    null,
    '{"session_starts":1}'::jsonb
  );
  if first_result <> current_setting('app.telemetry_event')::uuid
     or replay_result <> first_result then
    raise exception 'identical telemetry replay did not return the stable event id';
  end if;

  begin
    perform public.record_template_copilot_v2_telemetry(
      current_setting('app.telemetry_event')::uuid,
      current_setting('app.telemetry_occurred_at')::timestamptz,
      'hmac-sha256:' || repeat('a', 64),
      'hmac-sha256:' || repeat('b', 64),
      'en',
      'guided',
      'question_selected',
      1,
      'identity_scope',
      'session_changed',
      null,
      null,
      '{"session_starts":1}'::jsonb
    );
  exception
    when unique_violation then
      if sqlerrm <> 'template_copilot_v2_telemetry_idempotency_conflict' then
        raise;
      end if;
      conflict_seen := true;
  end;
  if not conflict_seen then
    raise exception 'conflicting telemetry replay unexpectedly succeeded';
  end if;
end
$$;

do $$
begin
  if (
    select count(*)
    from public.list_template_copilot_v2_telemetry_for_admin(
      current_setting('app.telemetry_admin')::uuid,
      100,
      null
    )
    where event_id = current_setting('app.telemetry_event')::uuid
  ) <> 1 then
    raise exception 'active Admin cannot read the telemetry event';
  end if;

  begin
    perform *
    from public.list_template_copilot_v2_telemetry_for_admin(
      current_setting('app.telemetry_other')::uuid,
      100,
      null
    );
    raise exception 'non-Admin service request unexpectedly read telemetry';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  current_setting('app.telemetry_admin'),
  true
);
set local role authenticated;

do $$
begin
  begin
    perform count(*) from private.template_copilot_v2_telemetry_events;
    raise exception 'authenticated direct telemetry read unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.record_template_copilot_v2_telemetry(
      gen_random_uuid(),
      statement_timestamp(),
      'hmac-sha256:' || repeat('a', 64),
      'hmac-sha256:' || repeat('b', 64),
      'en',
      'guided',
      'question_selected',
      1,
      'identity_scope',
      'forged',
      null,
      null,
      '{}'::jsonb
    );
    raise exception 'authenticated telemetry write RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform *
    from public.list_template_copilot_v2_telemetry_for_admin(
      current_setting('app.telemetry_admin')::uuid,
      100,
      null
    );
    raise exception 'authenticated telemetry list RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.purge_expired_template_copilot_v2_telemetry(
      statement_timestamp()
    );
    raise exception 'authenticated telemetry purge RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;

update private.template_copilot_v2_telemetry_events
set recorded_at = statement_timestamp() - interval '31 days',
    expires_at = statement_timestamp() - interval '1 second'
where event_id = current_setting('app.telemetry_event')::uuid;

set local role service_role;

do $$
declare
  deleted_count bigint;
begin
  if (
    select count(*)
    from public.list_template_copilot_v2_telemetry_for_admin(
      current_setting('app.telemetry_admin')::uuid,
      100,
      null
    )
    where event_id = current_setting('app.telemetry_event')::uuid
  ) <> 0 then
    raise exception 'expired telemetry remained logically readable';
  end if;

  deleted_count := public.purge_expired_template_copilot_v2_telemetry(
    statement_timestamp()
  );
  if deleted_count <> 1 then
    raise exception 'telemetry purge deleted %, expected 1', deleted_count;
  end if;
end
$$;

reset role;
rollback;
