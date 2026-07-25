begin;

select set_config('app.rls_admin', gen_random_uuid()::text, true);
select set_config('app.rls_other', gen_random_uuid()::text, true);

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
  current_setting('app.rls_admin')::uuid,
  'authenticated',
  'authenticated',
  'template-rls-admin@example.com',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Template RLS Admin"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
),
(
  current_setting('app.rls_other')::uuid,
  'authenticated',
  'authenticated',
  'template-rls-other@example.com',
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Template RLS Other"}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update public.profiles
set is_admin = id = current_setting('app.rls_admin')::uuid,
    is_active = true,
    role = case
      when id = current_setting('app.rls_admin')::uuid then 'superuser'
      else 'participant'
    end
where id in (
  current_setting('app.rls_admin')::uuid,
  current_setting('app.rls_other')::uuid
);

do $$
declare
  v_business uuid;
  v_department uuid;
  v_result jsonb;
begin
  insert into public.business_units (name, is_active, updated_at)
  values (
    'Template RLS Business ' || current_setting('app.rls_admin'),
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
    'Template RLS Department',
    true,
    statement_timestamp()
  )
  returning id into v_department;

  v_result := public.create_template_authoring_family(
    current_setting('app.rls_admin')::uuid,
    'rls-create-001',
    repeat('7', 64),
    'rls.e2e',
    'RLS E2E',
    v_business,
    v_department,
    '{"schemaVersion":1}'::jsonb,
    '{"schemaVersion":1}'::jsonb,
    'RLS proof'
  );
  if v_result ->> 'outcome' <> 'applied' then
    raise exception 'RLS fixture creation failed: %', v_result;
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.rls_admin'),
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.template_authoring_families
    where family_key = 'rls.e2e'
  ) <> 1 then
    raise exception 'authorized actor cannot read family';
  end if;

  begin
    update public.template_authoring_families
    set name = 'Forged direct update'
    where family_key = 'rls.e2e';
    raise exception 'authenticated direct update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.replace_template_authoring_draft(
      current_setting('app.rls_admin')::uuid,
      gen_random_uuid(),
      1,
      'rls-forged-001',
      repeat('8', 64),
      '{"schemaVersion":1}'::jsonb,
      '{"schemaVersion":1}'::jsonb,
      'Forged RPC'
    );
    raise exception 'authenticated direct RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
select set_config(
  'request.jwt.claim.sub',
  current_setting('app.rls_other'),
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.template_authoring_families
    where family_key = 'rls.e2e'
  ) <> 0 then
    raise exception 'unrelated actor can read family';
  end if;
end
$$;

reset role;
rollback;
