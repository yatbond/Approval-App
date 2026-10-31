-- Server-authoritative, revisioned mutations for Template Copilot schema v2.
-- Only the service-role API may execute these functions; authenticated users
-- read through RLS and never write the JSONB ledger directly.

create table public.template_copilot_v2_operation_receipts (
  session_id uuid not null references public.template_copilot_sessions(id) on delete restrict,
  idempotency_key text not null,
  command_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id, idempotency_key),
  check (length(idempotency_key) between 8 and 128),
  check (command_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(response) = 'object')
);

create table public.template_copilot_v2_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.template_copilot_sessions(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  command_hash text not null,
  operation text not null,
  fact_id text,
  before_revision bigint,
  after_revision bigint,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(idempotency_key) between 8 and 128),
  check (command_hash ~ '^[0-9a-f]{64}$'),
  check (operation in ('create_session', 'record_candidate', 'human_commit', 'mark_unknown', 'mark_not_applicable', 'resolve_conflict', 'legacy_upgrade')),
  check (fact_id is null or fact_id in (
    'workflow.name', 'workflow.purpose', 'workflow.scope', 'request.initiator_policy', 'request.fields',
    'attachments.requirements', 'workflow.stages', 'workflow.conditions', 'workflow.rejection_policy',
    'collaboration.policy', 'timing.rules', 'visibility.policy', 'notifications.rules',
    'governance.owner', 'governance.policies', 'governance.retention'
  )),
  check (jsonb_typeof(detail) = 'object')
);

create unique index template_copilot_v2_create_receipt_idx
on public.template_copilot_v2_audit_events (owner_id, idempotency_key)
where operation = 'create_session' and outcome = 'applied';

create index template_copilot_v2_audit_session_idx
on public.template_copilot_v2_audit_events (session_id, created_at desc);

alter table public.template_copilot_v2_operation_receipts enable row level security;
alter table public.template_copilot_v2_audit_events enable row level security;

create policy "owners and admins read template copilot v2 receipts"
on public.template_copilot_v2_operation_receipts for select to authenticated
using (exists (
  select 1 from public.template_copilot_sessions s
  where s.id = session_id and (s.owner_id = (select auth.uid()) or private.is_active_approval_admin((select auth.uid())))
));

create policy "owners and admins read template copilot v2 audit"
on public.template_copilot_v2_audit_events for select to authenticated
using (owner_id = (select auth.uid()) or private.is_active_approval_admin((select auth.uid())));

revoke all privileges on table public.template_copilot_v2_operation_receipts, public.template_copilot_v2_audit_events from public, anon, authenticated;
grant select on table public.template_copilot_v2_operation_receipts, public.template_copilot_v2_audit_events to authenticated;
-- Retention is intentional: receipts and audit evidence are immutable and no
-- application role has direct insert/update/delete privileges. Governed data
-- retention changes require a reviewed migration, not a service-role bypass.

create or replace function private.prevent_template_copilot_v2_evidence_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'template copilot v2 evidence is immutable';
end;
$$;

create trigger template_copilot_v2_receipts_immutable
before update or delete on public.template_copilot_v2_operation_receipts
for each row execute function private.prevent_template_copilot_v2_evidence_mutation();

create trigger template_copilot_v2_audit_immutable
before update or delete on public.template_copilot_v2_audit_events
for each row execute function private.prevent_template_copilot_v2_evidence_mutation();

create or replace function public.create_template_copilot_v2_session(
  p_actor_id uuid, p_client_message_id text, p_command_hash text, p_ledger jsonb, p_assistant_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.template_copilot_v2_audit_events%rowtype; v_session public.template_copilot_sessions%rowtype; v_response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':template-copilot-v2-start', 0));
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.is_active) then return jsonb_build_object('outcome', 'forbidden'); end if;
  if p_client_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_command_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_ledger) <> 'object' or p_ledger->>'schemaVersion' <> '2' or length(p_assistant_message) not between 1 and 16000 then return jsonb_build_object('outcome', 'invalid_command'); end if;
  select * into v_existing from public.template_copilot_v2_audit_events e where e.owner_id = p_actor_id and e.idempotency_key = p_client_message_id and e.operation = 'create_session' and e.outcome = 'applied';
  if found then
    if v_existing.command_hash <> p_command_hash then return jsonb_build_object('outcome', 'idempotency_conflict'); end if;
    return v_existing.detail || jsonb_build_object('outcome', 'replayed');
  end if;
  insert into public.template_copilot_sessions (owner_id, ledger) values (p_actor_id, p_ledger) returning * into v_session;
  insert into public.template_copilot_messages (session_id, owner_id, client_message_id, role, content) values (v_session.id, p_actor_id, p_client_message_id, 'assistant', p_assistant_message);
  v_response := jsonb_build_object('outcome','applied','sessionId',v_session.id,'revision',v_session.revision,'status',v_session.status,'ledger',v_session.ledger);
  insert into public.template_copilot_v2_audit_events (session_id,owner_id,idempotency_key,command_hash,operation,before_revision,after_revision,outcome,detail) values (v_session.id,p_actor_id,p_client_message_id,p_command_hash,'create_session',null,v_session.revision,'applied',v_response);
  return v_response;
end; $$;

create or replace function public.mutate_template_copilot_v2_fact(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint, p_idempotency_key text, p_command_hash text, p_operation text, p_fact_id text, p_fact_entry jsonb, p_readiness jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.template_copilot_sessions%rowtype; v_receipt public.template_copilot_v2_operation_receipts%rowtype; v_response jsonb; v_before bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_session from public.template_copilot_sessions s where s.id = p_session_id for update;
  if not found or v_session.owner_id <> p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_command_hash !~ '^[0-9a-f]{64}$' or p_operation not in ('record_candidate','human_commit','mark_unknown','mark_not_applicable','resolve_conflict') or p_fact_id not in ('workflow.name','workflow.purpose','workflow.scope','request.initiator_policy','request.fields','attachments.requirements','workflow.stages','workflow.conditions','workflow.rejection_policy','collaboration.policy','timing.rules','visibility.policy','notifications.rules','governance.owner','governance.policies','governance.retention') or jsonb_typeof(p_fact_entry) <> 'object' or jsonb_typeof(p_readiness) <> 'object' then return jsonb_build_object('outcome','invalid_command'); end if;
  select * into v_receipt from public.template_copilot_v2_operation_receipts r where r.session_id = p_session_id and r.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_hash <> p_command_hash then return jsonb_build_object('outcome','idempotency_conflict'); end if;
    return v_receipt.response || jsonb_build_object('outcome','replayed');
  end if;
  if v_session.revision <> p_expected_revision then
    insert into public.template_copilot_v2_audit_events (session_id,owner_id,idempotency_key,command_hash,operation,fact_id,before_revision,after_revision,outcome,detail) values (p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,v_session.revision,v_session.revision,'stale_revision',jsonb_build_object('expectedRevision',p_expected_revision,'currentRevision',v_session.revision));
    return jsonb_build_object('outcome','stale_revision','expectedRevision',p_expected_revision,'currentRevision',v_session.revision);
  end if;
  if v_session.ledger->>'schemaVersion' <> '2' or v_session.status <> 'interviewing' then return jsonb_build_object('outcome','invalid_transition'); end if;
  v_before := v_session.revision;
  update public.template_copilot_sessions set ledger = jsonb_set(v_session.ledger, array['facts',p_fact_id], p_fact_entry, true), revision = revision + 1, updated_at = now() where id = p_session_id returning * into v_session;
  v_response := jsonb_build_object('outcome','applied','sessionId',v_session.id,'revision',v_session.revision,'status',v_session.status,'ledger',v_session.ledger,'readiness',p_readiness);
  insert into public.template_copilot_v2_operation_receipts (session_id,idempotency_key,command_hash,response) values (p_session_id,p_idempotency_key,p_command_hash,v_response);
  insert into public.template_copilot_v2_audit_events (session_id,owner_id,idempotency_key,command_hash,operation,fact_id,before_revision,after_revision,outcome,detail) values (p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,v_before,v_session.revision,'applied',v_response);
  return v_response;
end; $$;

create or replace function public.upgrade_template_copilot_v1_session(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint, p_idempotency_key text, p_command_hash text, p_preview_hash text, p_ledger jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session public.template_copilot_sessions%rowtype; v_receipt public.template_copilot_v2_operation_receipts%rowtype; v_response jsonb; v_before bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_session from public.template_copilot_sessions s where s.id = p_session_id for update;
  if not found or v_session.owner_id <> p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_command_hash !~ '^[0-9a-f]{64}$' or p_preview_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_ledger) <> 'object' or p_ledger->>'schemaVersion' <> '2' then return jsonb_build_object('outcome','invalid_command'); end if;
  select * into v_receipt from public.template_copilot_v2_operation_receipts r where r.session_id = p_session_id and r.idempotency_key = p_idempotency_key;
  if found then if v_receipt.command_hash <> p_command_hash then return jsonb_build_object('outcome','idempotency_conflict'); end if; return v_receipt.response || jsonb_build_object('outcome','replayed'); end if;
  if v_session.revision <> p_expected_revision then return jsonb_build_object('outcome','stale_revision','expectedRevision',p_expected_revision,'currentRevision',v_session.revision); end if;
  if v_session.ledger->>'schemaVersion' <> '1' or v_session.status not in ('interviewing','ready') then return jsonb_build_object('outcome','invalid_transition'); end if;
  v_before := v_session.revision;
  update public.template_copilot_sessions set ledger = p_ledger, status = 'interviewing', revision = revision + 1, updated_at = now() where id = p_session_id returning * into v_session;
  v_response := jsonb_build_object('outcome','applied','sessionId',v_session.id,'revision',v_session.revision,'status',v_session.status,'ledger',v_session.ledger,'previewHash',p_preview_hash);
  insert into public.template_copilot_v2_operation_receipts (session_id,idempotency_key,command_hash,response) values (p_session_id,p_idempotency_key,p_command_hash,v_response);
  insert into public.template_copilot_v2_audit_events (session_id,owner_id,idempotency_key,command_hash,operation,before_revision,after_revision,outcome,detail) values (p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'legacy_upgrade',v_before,v_session.revision,'applied',v_response);
  return v_response;
end; $$;

revoke all on function public.create_template_copilot_v2_session(uuid,text,text,jsonb,text), public.mutate_template_copilot_v2_fact(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb), public.upgrade_template_copilot_v1_session(uuid,uuid,bigint,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_template_copilot_v2_session(uuid,text,text,jsonb,text), public.mutate_template_copilot_v2_fact(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb), public.upgrade_template_copilot_v1_session(uuid,uuid,bigint,text,text,text,jsonb) to service_role;
