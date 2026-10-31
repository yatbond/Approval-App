-- Step 6 keeps the entry method and source snapshot in a private companion
-- record. The v2 JSONB ledger remains the sole fact/readiness/compiler input.
-- This migration is forward-safe and is intentionally not applied by tests.
create table if not exists public.template_copilot_v2_authoring_modes (
  session_id uuid primary key references public.template_copilot_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  mode text not null check (mode in ('guided','describe_everything','similar_template')),
  source_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The selected mode can later become guided/describe while the frozen source
  -- provenance remains available for review. The RPC, not this persistence
  -- shape, requires a snapshot when the requested mode is similar_template.
  check (source_snapshot is null or (jsonb_typeof(source_snapshot) = 'object' and pg_column_size(source_snapshot) <= 1048576))
);
alter table public.template_copilot_v2_authoring_modes enable row level security;
revoke all on public.template_copilot_v2_authoring_modes from public, anon, authenticated, service_role;
grant select on public.template_copilot_v2_authoring_modes to service_role;

alter table public.template_copilot_v2_audit_events drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events add constraint template_copilot_v2_audit_events_operation_check
  check (operation in ('create_session','record_candidate','human_commit','mark_unknown','mark_not_applicable','resolve_conflict','legacy_upgrade','atomic_answer','special_decision','candidate_extraction','candidate_confirmation','resolve_extraction_conflict','mode_switch'));

create or replace function public.switch_template_copilot_v2_mode(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint, p_idempotency_key text,
  p_command_hash text, p_mode text, p_source_snapshot jsonb, p_ledger jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.template_copilot_sessions%rowtype; r public.template_copilot_v2_operation_receipts%rowtype;
begin
  if p_mode not in ('guided','describe_everything','similar_template')
    or (p_mode = 'similar_template') <> (p_source_snapshot is not null)
    or p_expected_revision < 1 or length(p_idempotency_key) not between 8 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or p_command_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'invalid_mode_command'; end if;
  select * into s from public.template_copilot_sessions where id = p_session_id for update;
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  select * into r from public.template_copilot_v2_operation_receipts where session_id = p_session_id and idempotency_key = p_idempotency_key;
  if found then
    if r.command_hash is distinct from p_command_hash then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'idempotency_conflict',jsonb_build_object('schemaVersion',2,'mode',p_mode));
      return jsonb_build_object('outcome','idempotency_conflict');
    end if;
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'replayed',jsonb_build_object('schemaVersion',2,'mode',p_mode));
    return jsonb_build_object('outcome','replayed','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  end if;
  if s.revision <> p_expected_revision then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'stale_revision',jsonb_build_object('schemaVersion',2,'mode',p_mode));
    return jsonb_build_object('outcome','stale_revision','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  end if;
  -- Mode changes never mutate the ledger. Imported values use the existing
  -- extraction RPC immediately afterwards, inheriting its full candidate,
  -- conflict, provenance, and no-auto-commit validation.
  if jsonb_typeof(p_ledger) is distinct from 'object'
     or p_ledger is distinct from s.ledger then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'mode',p_mode,'reason','invalid_ledger'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  -- A source snapshot may be supplied only once for a session. A later mode
  -- change never reads the source template again and cannot replace history.
  if p_source_snapshot is not null and exists (select 1 from public.template_copilot_v2_authoring_modes m where m.session_id = p_session_id and m.source_snapshot is not null and m.source_snapshot is distinct from p_source_snapshot) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'mode',p_mode,'reason','source_snapshot_immutable'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode,source_snapshot)
  values (p_session_id,p_actor_id,p_mode,p_source_snapshot)
  on conflict (session_id) do update set mode = excluded.mode, source_snapshot = coalesce(public.template_copilot_v2_authoring_modes.source_snapshot, excluded.source_snapshot), updated_at = clock_timestamp();
  update public.template_copilot_sessions set ledger = p_ledger, revision = revision + 1, updated_at = clock_timestamp() where id = p_session_id returning * into s;
  insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response)
  values (p_session_id,p_idempotency_key,p_command_hash,jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger));
  insert into public.template_copilot_v2_audit_events(session_id,owner_id,idempotency_key,command_hash,operation,before_revision,after_revision,outcome,detail)
  values (p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',p_expected_revision,s.revision,'applied',jsonb_build_object('mode',p_mode,'hasSourceSnapshot',p_source_snapshot is not null));
  return jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
end;
$$;
revoke all on function public.switch_template_copilot_v2_mode(uuid,uuid,bigint,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.switch_template_copilot_v2_mode(uuid,uuid,bigint,text,text,text,jsonb,jsonb) to service_role;

-- Similar import is deliberately not implemented as two client RPCs.  The
-- existing extraction RPC already validates the complete candidate delta; this
-- wrapper executes it and persists the mode/snapshot in the *same* database
-- transaction. An error or safe rejection therefore rolls both back.
create or replace function public.import_template_copilot_v2_similar_mode(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint, p_idempotency_key text,
  p_command_hash text, p_source_snapshot jsonb, p_ledger jsonb, p_evidence_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.template_copilot_sessions%rowtype; result jsonb; source_id text; old_count integer; old_conflict_count integer; before_revision bigint;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));
  select * into s from public.template_copilot_sessions where id=p_session_id for update;
  -- Never disclose a receipt, source, or audit write before exact ownership.
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  if p_expected_revision < 1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_command_hash !~ '^[0-9a-f]{64}$' or p_evidence_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_source_snapshot) <> 'object' or jsonb_typeof(p_ledger) <> 'object'
     or p_source_snapshot->>'versionId' !~ '^[0-9a-fA-F-]{36}$'
     or p_source_snapshot->>'snapshotHash' !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_source_snapshot->'templateSnapshot') <> 'object' then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',s.revision,s.revision,'invalid_command',jsonb_build_object('schemaVersion',2,'kind','similar_template'));
    return jsonb_build_object('outcome','invalid_command');
  end if;
  -- A receipt from the underlying extraction is the terminal receipt for this
  -- compound command. It has the same command hash/key and cannot be replayed
  -- with a different source snapshot.
  if exists (select 1 from public.template_copilot_v2_operation_receipts r where r.session_id=p_session_id and r.idempotency_key=p_idempotency_key) then
    select response into result from public.template_copilot_v2_operation_receipts where session_id=p_session_id and idempotency_key=p_idempotency_key;
    if (select command_hash from public.template_copilot_v2_operation_receipts where session_id=p_session_id and idempotency_key=p_idempotency_key) is distinct from p_command_hash then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',s.revision,s.revision,'idempotency_conflict',jsonb_build_object('schemaVersion',2,'kind','similar_template'));
      return jsonb_build_object('outcome','idempotency_conflict');
    end if;
    if not exists (select 1 from public.template_copilot_v2_authoring_modes m where m.session_id=p_session_id and m.source_snapshot is not distinct from p_source_snapshot and m.mode='similar_template') then
      raise exception using errcode='22023', message='similar_import_receipt_without_snapshot';
    end if;
    return result || jsonb_build_object('outcome','replayed','modeState',jsonb_build_object('mode','similar_template','sourceSnapshot',p_source_snapshot));
  end if;
  if s.revision <> p_expected_revision then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',s.revision,s.revision,'stale_revision',jsonb_build_object('schemaVersion',2,'kind','similar_template'));
    return jsonb_build_object('outcome','stale_revision','currentRevision',s.revision);
  end if;
  if exists (select 1 from public.template_copilot_v2_authoring_modes m where m.session_id=p_session_id and m.source_snapshot is not null and m.source_snapshot is distinct from p_source_snapshot) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','source_snapshot_immutable'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  source_id := 'template-version:' || (p_source_snapshot->>'versionId');
  old_count := case when jsonb_typeof(s.ledger->'extractionEvidence'->'candidates')='array' then jsonb_array_length(s.ledger->'extractionEvidence'->'candidates') else 0 end;
  old_conflict_count := case when jsonb_typeof(s.ledger->'extractionEvidence'->'conflicts')='array' then jsonb_array_length(s.ledger->'extractionEvidence'->'conflicts') else 0 end;
  -- The candidate authority remains the Step-3 validator, but Similar may
  -- append only candidates/conflicts whose every leaf names this frozen source.
  if jsonb_typeof(p_ledger->'extractionEvidence'->'candidates') is distinct from 'array'
     or jsonb_typeof(p_ledger->'extractionEvidence'->'conflicts') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_ledger->'extractionEvidence'->'candidates')='array' then p_ledger->'extractionEvidence'->'candidates' else '[]'::jsonb end) with ordinality c(value,n)
                cross join lateral jsonb_array_elements(c.value->'evidence') e(value)
                where n > old_count and e.value->>'messageId' is distinct from source_id)
     or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_ledger->'extractionEvidence'->'conflicts')='array' then p_ledger->'extractionEvidence'->'conflicts' else '[]'::jsonb end) with ordinality conflict(value,n)
                 cross join lateral jsonb_array_elements(conflict.value->'incoming'->'evidence') e(value)
                 where n > old_conflict_count and e.value->>'messageId' is distinct from source_id) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','source_provenance'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  -- A source may have no exactly compatible facts, or every deterministic
  -- candidate may already exist. Selecting that frozen source is still a
  -- valid, revisioned mode transition and must not call the extraction RPC's
  -- deliberately no-op-rejecting candidate branch.
  if p_ledger is not distinct from s.ledger then
    before_revision := s.revision;
    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode,source_snapshot)
    values(p_session_id,p_actor_id,'similar_template',p_source_snapshot)
    on conflict(session_id) do update set mode='similar_template',source_snapshot=coalesce(public.template_copilot_v2_authoring_modes.source_snapshot,excluded.source_snapshot),updated_at=clock_timestamp();
    update public.template_copilot_sessions set revision=revision+1,updated_at=clock_timestamp()
      where id=p_session_id returning * into s;
    result := jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
    insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response)
      values(p_session_id,p_idempotency_key,p_command_hash,result);
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'candidate_extraction',before_revision,s.revision,'no_candidates',jsonb_build_object('schemaVersion',2,'kind','similar_template'));
    return result || jsonb_build_object('modeState',jsonb_build_object('mode','similar_template','sourceSnapshot',p_source_snapshot));
  end if;
  result := public.apply_template_copilot_v2_extraction(p_actor_id,p_session_id,p_expected_revision,p_idempotency_key,p_command_hash,'candidate_extraction',null,null,null,null,null,p_ledger,p_evidence_hash);
  if result->>'outcome' <> 'applied' then return result; end if;
  insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode,source_snapshot)
  values(p_session_id,p_actor_id,'similar_template',p_source_snapshot)
  on conflict(session_id) do update set mode='similar_template', source_snapshot=coalesce(public.template_copilot_v2_authoring_modes.source_snapshot,excluded.source_snapshot), updated_at=clock_timestamp();
  return result || jsonb_build_object('modeState',jsonb_build_object('mode','similar_template','sourceSnapshot',p_source_snapshot));
end;
$$;
revoke all on function public.import_template_copilot_v2_similar_mode(uuid,uuid,bigint,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.import_template_copilot_v2_similar_mode(uuid,uuid,bigint,text,text,jsonb,jsonb,text) to service_role;

-- Describe-everything may need a provider round trip. Keep that unavoidable
-- external work outside the transaction, but persist a single owner-bound
-- prepared command first. A second tab sees `pending`, never starts another
-- provider call; only its opaque claim token may choose the terminal branch.
create table if not exists public.template_copilot_v2_mode_commands (
  session_id uuid not null references public.template_copilot_sessions(id) on delete cascade,
  idempotency_key text not null,
  owner_id uuid not null references public.profiles(id),
  command_hash text not null,
  expected_revision bigint not null,
  mode text not null check (mode in ('describe_everything','similar_template')),
  state text not null check (state in ('prepared','finalized')),
  claim_token uuid not null,
  claim_expires_at timestamptz not null,
  source_message_id text not null,
  source_kind text not null check (source_kind in ('narrative','document','similar_difference')),
  response jsonb,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  primary key(session_id,idempotency_key),
  check (command_hash ~ '^[0-9a-f]{64}$'),
  check (length(source_message_id) between 8 and 128),
  check (jsonb_typeof(detail)='object'),
  check ((state='prepared') = (response is null))
);
alter table public.template_copilot_v2_mode_commands enable row level security;
revoke all on public.template_copilot_v2_mode_commands from public, anon, authenticated, service_role;

-- A governed requirement document is a bounded source record, not an
-- unbounded chat message. Its exact text must remain available to validate
-- evidence after a lost response, so extend the existing private transcript
-- bound to the Step-6 80k Unicode-character limit (browser roles remain
-- owner-scoped by the pre-existing RLS policy).
alter table public.template_copilot_messages drop constraint if exists template_copilot_messages_content_check;
alter table public.template_copilot_messages add constraint template_copilot_messages_content_check check (char_length(content) between 1 and 80000);

-- Step 3's extraction validator is intentionally exhaustive.  Preserve every
-- one of those server checks and make only its source-coordinate bound match
-- the Step-6 bounded document transcript (80k Unicode code points). Keeping
-- the prior function body avoids a second, drifting validation implementation.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text)'::regprocedure)
  into v_definition;
  if v_definition is null then raise exception using errcode='42883', message='missing_template_copilot_v2_extraction_validator'; end if;
  v_definition := replace(v_definition, '''^[0-9]{1,4}$''', '''^[0-9]{1,5}$''');
  v_definition := replace(v_definition, '(evidence->>''endCodePoint'')::integer > 8000', '(evidence->>''endCodePoint'')::integer > 80000');
  execute v_definition;
end;
$$;
revoke all on function public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text) to service_role;

create or replace function public.prepare_template_copilot_v2_mode_command(
  p_actor_id uuid,p_session_id uuid,p_expected_revision bigint,p_idempotency_key text,
  p_command_hash text,p_mode text,p_source_kind text,p_user_message text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.template_copilot_sessions%rowtype; c public.template_copilot_v2_mode_commands%rowtype; token uuid:=gen_random_uuid(); message_id text; terminal jsonb;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
  select * into s from public.template_copilot_sessions where id=p_session_id for update;
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  select * into c from public.template_copilot_v2_mode_commands where session_id=p_session_id and idempotency_key=p_idempotency_key for update;
  if found then
    if c.command_hash is distinct from p_command_hash then return jsonb_build_object('outcome','idempotency_conflict'); end if;
    if c.state='finalized' then
      if c.response->>'outcome' in ('applied','guided_fallback') then
        return c.response || jsonb_build_object('outcome','replayed');
      end if;
      return c.response;
    end if;
    if s.revision is distinct from c.expected_revision then
      terminal := jsonb_build_object('outcome','stale_revision','sessionId',s.id,'revision',s.revision,'currentRevision',s.revision,'status',s.status,'ledger',s.ledger);
      update public.template_copilot_v2_mode_commands
        set state='finalized',response=terminal,detail=jsonb_build_object('reason','revision_advanced'),finalized_at=clock_timestamp()
        where session_id=p_session_id and idempotency_key=p_idempotency_key;
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'stale_revision',jsonb_build_object('schemaVersion',2,'kind','describe_recovery'));
      return terminal;
    end if;
    if c.claim_expires_at <= clock_timestamp() then
      update public.template_copilot_v2_mode_commands
        set claim_token=token,claim_expires_at=clock_timestamp()+interval '2 minutes',
            detail=jsonb_set(detail,'{reclaimCount}',to_jsonb(coalesce((detail->>'reclaimCount')::integer,0)+1),true)
        where session_id=p_session_id and idempotency_key=p_idempotency_key;
      return jsonb_build_object('outcome','prepared','revision',s.revision,'ledger',s.ledger,'claimToken',token,'sourceMessageId',c.source_message_id);
    end if;
    return jsonb_build_object('outcome','pending','revision',s.revision,'ledger',s.ledger,'sourceMessageId',c.source_message_id);
  end if;
  if p_expected_revision < 1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' or p_command_hash !~ '^[0-9a-f]{64}$'
     or p_mode not in ('describe_everything','similar_template')
     or p_source_kind not in ('narrative','document','similar_difference')
     or (p_mode='similar_template') is distinct from (p_source_kind='similar_difference')
     or char_length(coalesce(p_user_message,'')) not between 1 and 80000 then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_command',jsonb_build_object('schemaVersion',2,'kind','describe'));
    return jsonb_build_object('outcome','invalid_command');
  end if;
  if s.revision <> p_expected_revision or s.status <> 'interviewing' or s.ledger->>'schemaVersion' <> '2' then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'stale_revision',jsonb_build_object('schemaVersion',2,'kind','describe'));
    return jsonb_build_object('outcome','stale_revision','currentRevision',s.revision);
  end if;
  -- Similar-template differences may only enrich an already-authorized,
  -- immutable source selection. This command never accepts/replaces a source
  -- snapshot, so it cannot turn an arbitrary broad message into an import.
  if p_mode = 'similar_template' and not exists (
    select 1 from public.template_copilot_v2_authoring_modes m
    where m.session_id = p_session_id and m.owner_id = p_actor_id
      and m.source_snapshot is not null
  ) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'kind','similar_differences'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  -- The receipt lookup above deliberately precedes this limit. Therefore the
  -- exact retry of the fifth successful document replays, while a genuinely
  -- new sixth document is rejected before a transcript row or provider call.
  if p_source_kind='document' and (
    jsonb_typeof(s.ledger->'requirementDocumentExtracts') is distinct from 'array'
    or jsonb_array_length(s.ledger->'requirementDocumentExtracts') >= 5
  ) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'kind','document','reason','document_limit'));
    return jsonb_build_object('outcome','document_limit','currentRevision',s.revision);
  end if;
  message_id := 'modecmd:' || substr(md5(p_session_id::text || ':' || p_idempotency_key),1,24);
  insert into public.template_copilot_messages(session_id,owner_id,client_message_id,role,content,structured_detail)
  values(p_session_id,p_actor_id,message_id,'user',p_user_message,jsonb_build_object('kind',p_source_kind));
  insert into public.template_copilot_v2_mode_commands(session_id,idempotency_key,owner_id,command_hash,expected_revision,mode,state,claim_token,claim_expires_at,source_message_id,source_kind)
  values(p_session_id,p_idempotency_key,p_actor_id,p_command_hash,p_expected_revision,p_mode,'prepared',token,clock_timestamp()+interval '2 minutes',message_id,p_source_kind);
  return jsonb_build_object('outcome','prepared','revision',s.revision,'ledger',s.ledger,'claimToken',token,'sourceMessageId',message_id);
end;
$$;

create or replace function public.finalize_template_copilot_v2_mode_command(
  p_actor_id uuid,p_session_id uuid,p_idempotency_key text,p_command_hash text,p_claim_token uuid,
  p_outcome text,p_mode text,p_ledger jsonb,p_evidence_hash text,p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.template_copilot_sessions%rowtype;
  c public.template_copilot_v2_mode_commands%rowtype;
  result jsonb;
  assistant_message text;
  source_text text;
  new_document jsonb;
  old_document_count integer;
  before_revision bigint;
  response_mode_state jsonb;
begin
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,0));
  select * into s from public.template_copilot_sessions where id=p_session_id for update;
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  select * into c from public.template_copilot_v2_mode_commands where session_id=p_session_id and idempotency_key=p_idempotency_key for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if c.command_hash is distinct from p_command_hash then return jsonb_build_object('outcome','idempotency_conflict'); end if;
  if c.state='finalized' then
    if c.response->>'outcome' in ('applied','guided_fallback') then
      return c.response || jsonb_build_object('outcome','replayed');
    end if;
    return c.response;
  end if;
  if c.claim_token is distinct from p_claim_token then return jsonb_build_object('outcome','pending','revision',s.revision,'ledger',s.ledger,'sourceMessageId',c.source_message_id); end if;
  if p_outcome not in ('applied','no_candidates','guided_fallback')
     or (p_outcome in ('applied','no_candidates') and p_mode is distinct from c.mode)
     or (p_outcome = 'guided_fallback' and p_mode <> 'guided')
     or jsonb_typeof(p_detail) <> 'object'
     or length(coalesce(p_detail->>'assistantMessage','')) not between 1 and 16000 then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'invalid_command',jsonb_build_object('schemaVersion',2,'kind','describe'));
    result := jsonb_build_object('outcome','invalid_command');
    update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','invalid_finalize'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
    return result;
  end if;
  assistant_message := p_detail->>'assistantMessage';
  if p_outcome='applied' then
    result := public.apply_template_copilot_v2_extraction(p_actor_id,p_session_id,c.expected_revision,p_idempotency_key,p_command_hash,'candidate_extraction',null,null,null,null,null,p_ledger,p_evidence_hash);
    if result->>'outcome' <> 'applied' then
      if result->>'outcome' in ('stale_revision','idempotency_conflict','invalid_transition','invalid_command') then
        update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','extraction_not_applied'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
      end if;
      return result;
    end if;
    -- Broad input is a one-turn intake. After candidates are proposed, the
    -- deterministic Guided controller asks only the remaining gaps.
    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)
    values(p_session_id,p_actor_id,'guided') on conflict(session_id) do update set mode='guided',updated_at=clock_timestamp();
  elsif p_outcome='no_candidates' then
    before_revision := s.revision;
    if c.source_kind='document' then
      if jsonb_typeof(s.ledger->'requirementDocumentExtracts') is distinct from 'array'
         or jsonb_typeof(p_ledger->'requirementDocumentExtracts') is distinct from 'array'
         or (p_ledger - 'requirementDocumentExtracts') is distinct from (s.ledger - 'requirementDocumentExtracts') then
        result := jsonb_build_object('outcome','invalid_transition');
        update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','document_ledger_scope'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
        return result;
      end if;
      old_document_count := jsonb_array_length(s.ledger->'requirementDocumentExtracts');
      if jsonb_array_length(p_ledger->'requirementDocumentExtracts') <> old_document_count + 1
         or exists (
           select 1 from jsonb_array_elements(s.ledger->'requirementDocumentExtracts') with ordinality d(value,n)
           where p_ledger->'requirementDocumentExtracts'->(n-1) is distinct from d.value
         ) then
        result := jsonb_build_object('outcome','invalid_transition');
        update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','document_delta'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
        return result;
      end if;
      new_document := p_ledger->'requirementDocumentExtracts'->old_document_count;
      select content into source_text from public.template_copilot_messages
        where session_id=p_session_id and owner_id=p_actor_id and client_message_id=c.source_message_id and role='user'
        order by created_at asc limit 1;
      if jsonb_typeof(new_document) is distinct from 'object'
         or not (new_document ?& array['id','fileName','sha256','text','safety'])
         or (new_document - array['id','fileName','sha256','text','safety']) <> '{}'::jsonb
         or new_document->>'id' !~ '^req-[0-9a-f]{32}$'
         or length(new_document->>'fileName') not between 1 and 300
         or new_document->>'sha256' !~ '^[0-9a-f]{64}$'
         or new_document->>'safety' <> 'sanitized_untrusted_text'
         or char_length(new_document->>'text') not between 1 and 80000
         or new_document->>'text' is distinct from source_text
         or jsonb_typeof(p_detail->'document') is distinct from 'object'
         or p_detail->'document' is distinct from (new_document - 'text') then
        result := jsonb_build_object('outcome','invalid_transition');
        update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','document_provenance'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
        return result;
      end if;
      update public.template_copilot_sessions set ledger=p_ledger,revision=revision+1,updated_at=clock_timestamp()
        where id=p_session_id returning * into s;
    elsif p_ledger is distinct from s.ledger then
      result := jsonb_build_object('outcome','invalid_transition');
      update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','no_candidate_ledger_changed'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
      return result;
    end if;
    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)
    values(p_session_id,p_actor_id,'guided') on conflict(session_id) do update set mode='guided',updated_at=clock_timestamp();
    result := jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
    insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response)
      values(p_session_id,p_idempotency_key,p_command_hash,result);
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',before_revision,s.revision,'no_candidates',jsonb_build_object('schemaVersion',2,'kind',c.source_kind));
  else
    -- Provider failure never writes candidates or alters the fact ledger.
    if p_ledger is distinct from s.ledger then
      result := jsonb_build_object('outcome','invalid_transition');
      update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=jsonb_build_object('reason','fallback_ledger_changed'),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
      return result;
    end if;
    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)
    values(p_session_id,p_actor_id,'guided') on conflict(session_id) do update set mode='guided',updated_at=clock_timestamp();
    result := jsonb_build_object('outcome','guided_fallback','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
    insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response) values(p_session_id,p_idempotency_key,p_command_hash,result);
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,'mode_switch',s.revision,s.revision,'guided_fallback',jsonb_build_object('schemaVersion',2,'kind','describe'));
  end if;
  insert into public.template_copilot_messages(session_id,owner_id,client_message_id,role,content,structured_detail)
  values(p_session_id,p_actor_id,c.source_message_id,'assistant',assistant_message,p_detail - 'assistantMessage');
  select jsonb_strip_nulls(jsonb_build_object('mode','guided','sourceSnapshot',m.source_snapshot))
    into response_mode_state from public.template_copilot_v2_authoring_modes m where m.session_id=p_session_id;
  result := result || jsonb_build_object(
    'modeState',coalesce(response_mode_state,jsonb_build_object('mode','guided')),
    'detail',(p_detail - 'assistantMessage') || jsonb_build_object('entryMode',c.mode)
  );
  update public.template_copilot_v2_mode_commands set state='finalized',response=result,detail=p_detail-'assistantMessage',finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;
  return result;
end;
$$;
revoke all on function public.prepare_template_copilot_v2_mode_command(uuid,uuid,bigint,text,text,text,text,text), public.finalize_template_copilot_v2_mode_command(uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.prepare_template_copilot_v2_mode_command(uuid,uuid,bigint,text,text,text,text,text), public.finalize_template_copilot_v2_mode_command(uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb) to service_role;
