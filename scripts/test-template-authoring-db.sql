begin;

do $$
declare
  v_actor uuid;
  v_business uuid;
  v_department uuid;
  v_family_key text := 'e2e.' || replace(gen_random_uuid()::text, '-', '');
  v_dossier jsonb := '{"schemaVersion":1,"dossierId":"e2e-dossier"}'::jsonb;
  v_definition jsonb :=
    '{"schemaVersion":1,"generation":{"unresolvedQuestionIds":[]},"template":{"name":"E2E template","graph":{"nodes":[],"edges":[]},"documents":[],"languages":["English"]}}'::jsonb;
  v_result jsonb;
  v_family uuid;
  v_draft uuid;
  v_request uuid;
  v_version uuid;
  v_next_draft uuid;
begin
  v_actor := gen_random_uuid();
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
  values (
    v_actor,
    'authenticated',
    'authenticated',
    'template-e2e-admin@example.com',
    '',
    statement_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Template E2E Admin"}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  );

  update public.profiles
  set full_name = 'Template E2E Admin',
      role = 'superuser',
      is_admin = true,
      is_active = true
  where id = v_actor;
  if not found then
    insert into public.profiles (
      id,
      full_name,
      email,
      role,
      is_admin,
      is_active
    )
    values (
      v_actor,
      'Template E2E Admin',
      'template-e2e-admin@example.com',
      'superuser',
      true,
      true
    );
  end if;

  insert into public.business_units (name, is_active, updated_at)
  values (
    'Template E2E Business ' || v_actor::text,
    true,
    statement_timestamp()
  )
  returning id into v_business;

  insert into public.business_departments (
    business_unit_id,
    name,
    is_active,
    updated_at
  )
  values (
    v_business,
    'Template E2E Department',
    true,
    statement_timestamp()
  )
  returning id into v_department;

  v_result := public.create_template_authoring_family(
    v_actor,
    'e2e-create-001',
    repeat('a', 64),
    v_family_key,
    'E2E template',
    v_business,
    v_department,
    v_dossier,
    v_definition,
    'E2E initial draft'
  );
  if v_result ->> 'outcome' <> 'applied' then
    raise exception 'create failed: %', v_result;
  end if;
  v_family := (v_result ->> 'familyId')::uuid;
  v_draft := (v_result ->> 'draftId')::uuid;

  v_result := public.create_template_authoring_family(
    v_actor,
    'e2e-create-001',
    repeat('a', 64),
    v_family_key,
    'E2E template',
    v_business,
    v_department,
    v_dossier,
    v_definition,
    'E2E initial draft'
  );
  if v_result ->> 'outcome' <> 'replayed' then
    raise exception 'replay failed: %', v_result;
  end if;

  v_result := public.create_template_authoring_family(
    v_actor,
    'e2e-create-001',
    repeat('b', 64),
    v_family_key,
    'E2E template',
    v_business,
    v_department,
    v_dossier,
    v_definition,
    'E2E initial draft'
  );
  if v_result ->> 'outcome' <> 'idempotency_conflict' then
    raise exception 'idempotency conflict failed: %', v_result;
  end if;

  v_result := public.create_template_authoring_draft(
    v_actor,
    v_family,
    'e2e-draft-000',
    repeat('0', 64),
    v_dossier,
    v_definition,
    'Duplicate open draft'
  );
  if v_result ->> 'outcome' <> 'open_draft_exists' then
    raise exception 'open draft guard failed: %', v_result;
  end if;

  v_result := public.replace_template_authoring_draft(
    v_actor,
    v_draft,
    1,
    'e2e-replace-001',
    repeat('c', 64),
    v_dossier,
    v_definition,
    'E2E replace'
  );
  if v_result ->> 'outcome' <> 'applied'
     or (v_result ->> 'currentRevision')::integer <> 2 then
    raise exception 'replace failed: %', v_result;
  end if;

  v_result := public.replace_template_authoring_draft(
    v_actor,
    v_draft,
    1,
    'e2e-replace-002',
    repeat('d', 64),
    v_dossier,
    v_definition,
    'E2E stale'
  );
  if v_result ->> 'outcome' <> 'stale_revision' then
    raise exception 'stale revision failed: %', v_result;
  end if;

  v_result := public.request_template_authoring_publish(
    v_actor,
    v_draft,
    2,
    'e2e-request-001',
    repeat('e', 64),
    'Ready for review',
    '{"errorCount":0,"warningCount":0}'::jsonb
  );
  if v_result ->> 'outcome' <> 'applied' then
    raise exception 'publish request failed: %', v_result;
  end if;
  v_request := (v_result ->> 'publishRequestId')::uuid;

  v_result := public.review_template_authoring_publish(
    v_actor,
    v_request,
    'approve',
    '',
    'e2e-review-001',
    repeat('f', 64)
  );
  if v_result ->> 'outcome' <> 'applied'
     or v_result ->> 'status' <> 'approved' then
    raise exception 'review failed: %', v_result;
  end if;

  v_result := public.publish_template_authoring_draft(
    v_actor,
    v_request,
    'e2e-publish-001',
    repeat('1', 64)
  );
  if v_result ->> 'outcome' <> 'applied' then
    raise exception 'publish failed: %', v_result;
  end if;
  v_version := (v_result ->> 'publishedVersionId')::uuid;

  if not exists (
    select 1
    from public.workflow_template_versions t
    where t.id = v_version
      and t.template_key = v_family_key
      and not t.is_active_version
      and t.template_snapshot ->> 'isDraft' = 'false'
  ) then
    raise exception 'published version invariants failed';
  end if;

  v_result := public.create_template_authoring_draft(
    v_actor,
    v_family,
    'e2e-draft-001',
    repeat('3', 64),
    v_dossier,
    v_definition,
    'Next version draft'
  );
  if v_result ->> 'outcome' <> 'applied' then
    raise exception 'next draft failed: %', v_result;
  end if;
  v_next_draft := (v_result ->> 'draftId')::uuid;
  if v_next_draft = v_draft then
    raise exception 'next draft reused the published draft id';
  end if;

  if (
    select count(*)
    from public.template_authoring_events
    where family_id = v_family
  ) <> 6 then
    raise exception 'unexpected event count';
  end if;

  if (
    select count(*)
    from public.template_authoring_command_receipts
    where family_id = v_family
  ) <> 6 then
    raise exception 'unexpected command receipt count';
  end if;
end
$$;

rollback;
