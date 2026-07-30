begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values (
  '91000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'copilot-owner@example.com', '',
  now(), now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (
  id, email, full_name, role, is_admin, is_active
)
values (
  '91000000-0000-4000-8000-000000000001',
  'copilot-owner@example.com', 'Copilot Owner', 'originator', false, true
)
on conflict (id) do update set is_active = true;

do $$
declare
  v_created jsonb;
  v_advanced jsonb;
  v_replayed jsonb;
  v_stale jsonb;
  v_session_id uuid;
  v_ledger jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'businessUnitId', '11111111-1111-4111-8111-111111111111',
    'businessName', 'Finance',
    'departmentId', '22222222-2222-4222-8222-222222222222',
    'departmentName', 'Accounts Payable',
    'sections', '{}'::jsonb,
    'requirementDocumentExtracts', '[]'::jsonb
  );
begin
  v_created := public.create_template_copilot_session(
    '91000000-0000-4000-8000-000000000001',
    'start:00000001',
    v_ledger,
    'First governed question'
  );
  assert v_created->>'outcome' = 'applied';
  v_session_id := (v_created->>'sessionId')::uuid;

  v_advanced := public.advance_template_copilot_session(
    '91000000-0000-4000-8000-000000000001',
    v_session_id,
    1,
    'turn:00000001',
    'Employee answer',
    'Next governed question',
    v_ledger,
    'interviewing',
    'test-model',
    '{"targetSection":"identity_scope"}'::jsonb
  );
  assert v_advanced->>'outcome' = 'applied';
  assert (v_advanced->>'revision')::bigint = 2;

  v_replayed := public.advance_template_copilot_session(
    '91000000-0000-4000-8000-000000000001',
    v_session_id,
    1,
    'turn:00000001',
    'Employee answer',
    'Next governed question',
    v_ledger,
    'interviewing',
    'test-model',
    '{"targetSection":"identity_scope"}'::jsonb
  );
  assert v_replayed->>'outcome' = 'replayed';

  v_stale := public.advance_template_copilot_session(
    '91000000-0000-4000-8000-000000000001',
    v_session_id,
    1,
    'turn:00000002',
    'Second answer',
    'Another question',
    v_ledger,
    'interviewing',
    'test-model',
    '{}'::jsonb
  );
  assert v_stale->>'outcome' = 'stale_revision';

  assert (
    select count(*) from public.template_copilot_messages
    where session_id = v_session_id
  ) = 3;
end;
$$;

rollback;
