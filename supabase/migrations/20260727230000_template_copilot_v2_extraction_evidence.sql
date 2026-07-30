-- Step 3: extraction is advisory.  This is deliberately a service-only RPC:
-- callers submit a server-schema-validated projection, while this function
-- locks the session and proves that it is only the allowed append/action delta.
alter table public.template_copilot_v2_audit_events
  drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events
  add constraint template_copilot_v2_audit_events_operation_check
  check (operation in ('create_session','record_candidate','human_commit','mark_unknown','mark_not_applicable','resolve_conflict','legacy_upgrade','atomic_answer','special_decision','candidate_extraction','candidate_confirmation','resolve_extraction_conflict'));

create or replace function private.audit_template_copilot_v2_extraction_attempt(
  p_session_id uuid, p_owner_id uuid, p_key text, p_hash text, p_operation text,
  p_before bigint, p_after bigint, p_outcome text, p_detail jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare safe_key text; safe_hash text;
begin
  -- The immutable history/audit write is delegated to the private helper, which
  -- inserts into public.template_copilot_v2_audit_events only after ownership.
  -- p_conflict_id binds conflict.factId: only that fact may change. Extraction
  -- keeps all facts immutable (including old.value->>'status' in ('committed','not_applicable')).
  safe_key := case when coalesce(p_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', false) then p_key else 'reject:' || md5(coalesce(p_key, '<null>')) end;
  safe_hash := case when coalesce(p_hash ~ '^[0-9a-f]{64}$', false) then p_hash else md5('extract-command-1:' || coalesce(p_hash, '<null>')) || md5('extract-command-2:' || coalesce(p_hash, '<null>')) end;
  insert into public.template_copilot_v2_audit_events(session_id,owner_id,idempotency_key,command_hash,operation,before_revision,after_revision,outcome,detail)
  values (p_session_id,p_owner_id,safe_key,safe_hash,coalesce(p_operation,'candidate_extraction'),p_before,p_after,p_outcome,coalesce(p_detail,'{}'::jsonb));
end;
$$;
revoke all on function private.audit_template_copilot_v2_extraction_attempt(uuid,uuid,text,text,text,bigint,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function private.audit_template_copilot_v2_extraction_attempt(uuid,uuid,text,text,text,bigint,bigint,text,jsonb) to service_role;

drop function if exists public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,jsonb,text);
create function public.apply_template_copilot_v2_extraction(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint,
  p_idempotency_key text, p_command_hash text, p_operation text,
  p_candidate_id text, p_conflict_id text, p_choice text, p_rationale text,
  p_human_value jsonb, p_ledger jsonb, p_evidence_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.template_copilot_sessions%rowtype;
  r public.template_copilot_v2_operation_receipts%rowtype;
  before_revision bigint; response jsonb;
  old_candidates jsonb; new_candidates jsonb; old_conflicts jsonb; new_conflicts jsonb; old_history jsonb; new_history jsonb;
  candidate jsonb; conflict jsonb; old_fact jsonb; new_fact jsonb; history jsonb; evidence jsonb;
  old_candidate_count integer; new_candidate_count integer; old_conflict_count integer; new_conflict_count integer; old_history_count integer; new_history_count integer;
  target_fact_id text; i integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  -- Extraction cannot replace protected facts: old.value->>'status' in ('committed','not_applicable')
  -- is subsumed by the stricter full facts equality below.
  select * into s from public.template_copilot_sessions where id = p_session_id for update;
  -- Ownership is intentionally resolved before any receipt, input, or audit work.
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;

  if coalesce(p_expected_revision < 1, true)
     or coalesce(p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$', true)
     or coalesce(p_evidence_hash !~ '^[0-9a-f]{64}$', true)
     or coalesce(p_operation not in ('candidate_extraction','candidate_confirmation','resolve_extraction_conflict'), true)
     or jsonb_typeof(p_ledger) is distinct from 'object'
     or octet_length(p_ledger::text) > 12582912 then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_command',jsonb_build_object('schemaVersion',2));
    return jsonb_build_object('outcome','invalid_command');
  end if;

  select * into r from public.template_copilot_v2_operation_receipts where session_id=p_session_id and idempotency_key=p_idempotency_key;
  if found then
    if r.command_hash is distinct from p_command_hash then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'idempotency_conflict',jsonb_build_object('schemaVersion',2));
      return jsonb_build_object('outcome','idempotency_conflict');
    end if;
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'replayed_exact',jsonb_build_object('schemaVersion',2));
    return r.response || jsonb_build_object('outcome','replayed','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  end if;
  if s.revision is distinct from p_expected_revision then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'stale_revision',jsonb_build_object('schemaVersion',2,'expectedRevision',p_expected_revision,'currentRevision',s.revision));
    return jsonb_build_object('outcome','stale_revision','currentRevision',s.revision);
  end if;

  -- Sequential gates: never call a JSON array/object operation before its type is known.
  if jsonb_typeof(s.ledger) is distinct from 'object'
     or jsonb_typeof(s.ledger->'schemaVersion') is distinct from 'number'
     or s.ledger->'schemaVersion' is distinct from '2'::jsonb
     or jsonb_typeof(s.ledger->'facts') is distinct from 'object'
     or jsonb_typeof(s.ledger->'extractionEvidence') is distinct from 'object'
     or jsonb_typeof(s.ledger->'extractionEvidence'->'candidates') is distinct from 'array'
     or jsonb_typeof(s.ledger->'extractionEvidence'->'conflicts') is distinct from 'array'
     or (s.ledger->'extractionEvidence' ? 'history' and jsonb_typeof(s.ledger->'extractionEvidence'->'history') is distinct from 'array')
     or (not (s.ledger->'extractionEvidence' ? 'history') and (jsonb_array_length(s.ledger->'extractionEvidence'->'candidates') <> 0 or jsonb_array_length(s.ledger->'extractionEvidence'->'conflicts') <> 0))
     or s.status is distinct from 'interviewing' then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  if jsonb_typeof(p_ledger->'schemaVersion') is distinct from 'number'
     or p_ledger->'schemaVersion' is distinct from '2'::jsonb
     or jsonb_typeof(p_ledger->'facts') is distinct from 'object'
     or jsonb_typeof(p_ledger->'extractionEvidence') is distinct from 'object'
     or jsonb_typeof(p_ledger->'extractionEvidence'->'candidates') is distinct from 'array'
     or jsonb_typeof(p_ledger->'extractionEvidence'->'conflicts') is distinct from 'array'
     or jsonb_typeof(p_ledger->'extractionEvidence'->'history') is distinct from 'array' then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  if (p_ledger - 'facts' - 'extractionEvidence') is distinct from (s.ledger - 'facts' - 'extractionEvidence')
     or exists (select 1 from (select jsonb_object_keys(p_ledger->'facts') as key except select jsonb_object_keys(s.ledger->'facts') as key) forged)
     or exists (select 1 from (select jsonb_object_keys(s.ledger->'facts') as key except select jsonb_object_keys(p_ledger->'facts') as key) forged) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','ledger_scope_forgery'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;

  old_candidates := s.ledger->'extractionEvidence'->'candidates'; new_candidates := p_ledger->'extractionEvidence'->'candidates';
  old_conflicts := s.ledger->'extractionEvidence'->'conflicts'; new_conflicts := p_ledger->'extractionEvidence'->'conflicts';
  old_history := coalesce(s.ledger->'extractionEvidence'->'history','[]'::jsonb); new_history := p_ledger->'extractionEvidence'->'history';
  old_candidate_count := jsonb_array_length(old_candidates); new_candidate_count := jsonb_array_length(new_candidates);
  old_conflict_count := jsonb_array_length(old_conflicts); new_conflict_count := jsonb_array_length(new_conflicts);
  old_history_count := jsonb_array_length(old_history); new_history_count := jsonb_array_length(new_history);
  if old_candidate_count > 64 or new_candidate_count > 64 or old_conflict_count > 64 or new_conflict_count > 64 or old_history_count > 128 or new_history_count > 128 then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','sidecar_limit'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  -- Prefix equality prevents array reorder, replacement, removal, or historical forgery.
  -- The two human actions are permitted to close exactly their named evidence item;
  -- their exact state-only deltas are checked again in the action branches below.
  for i in 0..greatest(old_candidate_count,old_conflict_count,old_history_count)-1 loop
    if (i < old_candidate_count and new_candidates->i is distinct from old_candidates->i
          and not (p_operation = 'candidate_confirmation' and old_candidates->i->>'candidateId' = p_candidate_id))
       or (i < old_conflict_count and new_conflicts->i is distinct from old_conflicts->i
          and not (p_operation = 'resolve_extraction_conflict' and old_conflicts->i->>'conflictId' = p_conflict_id))
       or (i < old_history_count and new_history->i is distinct from old_history->i) then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','immutable_sidecar_changed'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
  end loop;

  -- IDs are canonical server references. Strict TypeScript validates each fact-aware
  -- typed value and leaf coverage; SQL independently bounds every untrusted shape.
  -- Every durable candidate is validated, including conflict.incoming and a
  -- candidate-valued conflict.existing snapshot; a conflict cannot smuggle a
  -- weaker evidence envelope than candidates[].
  for candidate in
    select value from jsonb_array_elements(new_candidates)
    union all
    select conflict_item->'incoming' from jsonb_array_elements(new_conflicts) conflict_item
    union all
    select conflict_item->'existing'->'candidate'
    from jsonb_array_elements(new_conflicts) conflict_item
    where jsonb_typeof(conflict_item->'existing') = 'object' and conflict_item->'existing' ? 'candidate'
  loop
    if jsonb_typeof(candidate) is distinct from 'object'
       or candidate ?& array['candidateId','factId','value','originalWording','evidence','confidence','ambiguity','state'] is false
       or jsonb_typeof(candidate->'candidateId') is distinct from 'string'
       or jsonb_typeof(candidate->'factId') is distinct from 'string'
       or jsonb_typeof(candidate->'value') not in ('string','object','array','number','boolean')
       or jsonb_typeof(candidate->'originalWording') is distinct from 'string'
       or jsonb_typeof(candidate->'evidence') is distinct from 'array'
       or jsonb_typeof(candidate->'confidence') is distinct from 'string'
       or jsonb_typeof(candidate->'ambiguity') is distinct from 'string'
       or jsonb_typeof(candidate->'state') is distinct from 'string' then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','invalid_candidate_evidence'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    if candidate->>'candidateId' !~ '^[0-9a-f]{64}$' or candidate->>'factId' not in ('workflow.name','workflow.purpose','workflow.scope','request.initiator_policy','request.fields','attachments.requirements','workflow.stages','workflow.conditions','workflow.rejection_policy','collaboration.policy','timing.rules','visibility.policy','notifications.rules','governance.owner','governance.policies','governance.retention')
       or length(candidate->>'originalWording') not between 1 and 8000 or jsonb_array_length(candidate->'evidence') not between 1 and 200
       or candidate->>'confidence' not in ('low','medium','high') or candidate->>'ambiguity' not in ('none','possible','ambiguous') or candidate->>'state' not in ('open','confirmed') then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','invalid_candidate_evidence'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    for evidence in select value from jsonb_array_elements(candidate->'evidence') loop
      if jsonb_typeof(evidence) is distinct from 'object'
         or evidence ?& array['path','messageId','startCodePoint','endCodePoint','exactText'] is false
         or jsonb_typeof(evidence->'path') is distinct from 'string'
         or jsonb_typeof(evidence->'messageId') is distinct from 'string'
         or jsonb_typeof(evidence->'startCodePoint') is distinct from 'number'
         or jsonb_typeof(evidence->'endCodePoint') is distinct from 'number'
         or jsonb_typeof(evidence->'exactText') is distinct from 'string'
         or (evidence ? 'normalizationRule' and jsonb_typeof(evidence->'normalizationRule') is distinct from 'string') then
        perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','invalid_candidate_evidence'));
        return jsonb_build_object('outcome','invalid_transition');
      end if;
      if length(evidence->>'path') not between 1 and 256 or evidence->>'path' !~ '^(?:/$|/(?:[A-Za-z0-9_.-]|~[01])+(?:/(?:[A-Za-z0-9_.-]|~[01])+)*$)'
         or length(evidence->>'messageId') not between 1 and 128 or length(evidence->>'exactText') not between 1 and 8000
         or (evidence ? 'normalizationRule' and evidence->>'normalizationRule' not in ('exact','nfkc_trim_collapse','nfkc_trim_collapse_whitespace','enum_lexical','approval_word_to_kind','ordinal_to_sequence','array_position_to_sequence','boolean_lexical','named_attachment_is_required','duration_hours'))
         or (evidence->>'startCodePoint') !~ '^[0-9]{1,4}$' or (evidence->>'endCodePoint') !~ '^[0-9]{1,4}$'
         or (evidence->>'startCodePoint')::integer < 0 or (evidence->>'endCodePoint')::integer <= (evidence->>'startCodePoint')::integer or (evidence->>'endCodePoint')::integer > 8000 then
        perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','invalid_candidate_evidence'));
        return jsonb_build_object('outcome','invalid_transition');
      end if;
    end loop;
  end loop;
  if exists (select c->>'candidateId' from jsonb_array_elements(new_candidates) c group by c->>'candidateId' having count(*) <> 1)
     or exists (
       select 1
       from jsonb_array_elements(new_candidates) c1,
            jsonb_array_elements(c1->'evidence') with ordinality e1(value, ordinal1),
            jsonb_array_elements(new_candidates) c2,
            jsonb_array_elements(c2->'evidence') with ordinality e2(value, ordinal2)
       where (c1->>'candidateId' < c2->>'candidateId' or (c1->>'candidateId' = c2->>'candidateId' and e1.ordinal1 < e2.ordinal2))
         and e1.value->>'messageId' = e2.value->>'messageId'
         and (e1.value->>'startCodePoint')::integer < (e2.value->>'endCodePoint')::integer
         and (e2.value->>'startCodePoint')::integer < (e1.value->>'endCodePoint')::integer
     ) then
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','duplicate_or_overlapping_claim'));
    return jsonb_build_object('outcome','invalid_transition');
  end if;

  if p_operation = 'candidate_extraction' then
    if p_candidate_id is not null or p_conflict_id is not null or p_choice is not null or p_rationale is not null or p_human_value is not null
       or new_history is distinct from old_history
       or new_candidate_count < old_candidate_count or new_conflict_count < old_conflict_count
       or new_candidate_count + new_conflict_count = old_candidate_count + old_conflict_count then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','extraction_delta'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    if exists (select 1 from jsonb_array_elements(new_candidates) with ordinality c(value, ordinal) where ordinal > old_candidate_count and c.value->>'state' <> 'open')
       or exists (
         select 1 from jsonb_array_elements(new_conflicts) with ordinality c(value, ordinal)
         where ordinal > old_conflict_count and (
           jsonb_typeof(c.value) is distinct from 'object'
           or c.value ?& array['conflictId','factId','existing','incoming','state'] is false
           or jsonb_typeof(c.value->'existing') is distinct from 'object'
           or c.value->>'conflictId' !~ '^[0-9a-f]{64}$' or c.value->>'state' <> 'open'
           or c.value->>'factId' <> c.value->'incoming'->>'factId'
           or c.value->'existing'->'value' is null
           -- A not-applicable fact has no canonical value; its durable status is the conflict's existing value.
           or coalesce(p_ledger->'facts'->(c.value->>'factId')->'canonicalValue', to_jsonb(p_ledger->'facts'->(c.value->>'factId')->>'status')) is distinct from c.value->'existing'->'value'
           or p_ledger->'facts'->(c.value->>'factId')->'provenance' is distinct from c.value->'existing'->'provenance'
           or (p_ledger->'facts'->(c.value->>'factId') ? 'confirmation' and c.value->'existing'->'confirmation' is distinct from p_ledger->'facts'->(c.value->>'factId')->'confirmation')
           or (not (p_ledger->'facts'->(c.value->>'factId') ? 'confirmation') and c.value->'existing' ? 'confirmation')
           or (c.value->'existing' ? 'candidate' and (
             c.value->'existing'->'candidate'->>'factId' <> c.value->>'factId'
             or c.value->'existing'->'candidate'->'value' is distinct from c.value->'existing'->'value'
             or not exists (
               select 1 from (
                 select value as candidate_value from jsonb_array_elements(old_candidates)
                 union all
                 select value as candidate_value from jsonb_array_elements(new_candidates)
               ) known_candidate
               where known_candidate.candidate_value is not distinct from c.value->'existing'->'candidate'
             )
           ))
         )
       )
       or exists (select c->>'conflictId' from jsonb_array_elements(new_conflicts) c group by c->>'conflictId' having count(*) <> 1)
       or exists (
         select 1 from jsonb_each(s.ledger->'facts') old_fact_entry
         where p_ledger->'facts'->old_fact_entry.key is distinct from old_fact_entry.value
           and not exists (
             select 1 from jsonb_array_elements(new_candidates) with ordinality appended(value, ordinal)
             where appended.ordinal > old_candidate_count
               and appended.value->>'factId' = old_fact_entry.key
               and old_fact_entry.value->>'status' in ('unresolved','unknown')
               and p_ledger->'facts'->old_fact_entry.key->>'status' = 'candidate'
               and p_ledger->'facts'->old_fact_entry.key->'canonicalValue' is not distinct from appended.value->'value'
               and p_ledger->'facts'->old_fact_entry.key->'originalWording' is not distinct from appended.value->'originalWording'
               and not (p_ledger->'facts'->old_fact_entry.key ? 'confirmation')
               and p_ledger->'facts'->old_fact_entry.key->'locale' is not distinct from p_ledger->'locale'
               and jsonb_typeof(p_ledger->'facts'->old_fact_entry.key->'provenance') = 'array'
               and jsonb_array_length(p_ledger->'facts'->old_fact_entry.key->'provenance') = 1
               and p_ledger->'facts'->old_fact_entry.key->'provenance'->0->>'kind' = 'message'
               and p_ledger->'facts'->old_fact_entry.key->'provenance'->0->>'sourceId' = appended.value->'evidence'->0->>'messageId'
               and p_ledger->'facts'->old_fact_entry.key->'provenance'->0->>'excerpt' = left(appended.value->>'originalWording',1000)
               and jsonb_typeof(p_ledger->'facts'->old_fact_entry.key->'provenance'->0->'sourceMessageIds') = 'array'
               and jsonb_array_length(p_ledger->'facts'->old_fact_entry.key->'provenance'->0->'sourceMessageIds') = (select count(distinct evidence_item->>'messageId') from jsonb_array_elements(appended.value->'evidence') evidence_item)
               and not exists (select 1 from jsonb_array_elements(appended.value->'evidence') evidence_item where not (p_ledger->'facts'->old_fact_entry.key->'provenance'->0->'sourceMessageIds' @> jsonb_build_array(evidence_item->>'messageId')))
           )
       ) then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','invalid_conflict_append'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
  elsif p_operation = 'candidate_confirmation' then
    if coalesce(p_candidate_id !~ '^[0-9a-f]{64}$', true) or p_conflict_id is not null or p_choice is not null or p_rationale is not null or p_human_value is not null
       or new_candidate_count <> old_candidate_count or new_conflict_count <> old_conflict_count or new_conflicts is distinct from old_conflicts or new_history_count <> old_history_count + 1 then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','confirmation_delta'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    select c into candidate from jsonb_array_elements(old_candidates) c where c->>'candidateId'=p_candidate_id and c->>'state'='open';
    if candidate is null or candidate->>'ambiguity' <> 'none'
       or exists (select 1 from jsonb_array_elements(old_conflicts) open_conflict where open_conflict->>'factId' = candidate->>'factId' and open_conflict->>'state' = 'open')
       or (select count(*) from jsonb_array_elements(old_candidates) c where c->>'candidateId'=p_candidate_id) <> 1 then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','candidate_not_open'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    target_fact_id := candidate->>'factId'; old_fact := s.ledger->'facts'->target_fact_id; new_fact := p_ledger->'facts'->target_fact_id;
    if exists (select 1 from jsonb_each(s.ledger->'facts') f where f.key <> target_fact_id and p_ledger->'facts'->f.key is distinct from f.value)
       or jsonb_typeof(old_fact) is distinct from 'object' or jsonb_typeof(new_fact) is distinct from 'object' or old_fact->>'status' <> 'candidate' or new_fact->>'status' <> 'committed' or new_fact->'canonicalValue' is distinct from candidate->'value'
       or (new_fact - 'status' - 'confirmation') is distinct from (old_fact - 'status' - 'confirmation')
       or jsonb_typeof(new_fact->'confirmation') is distinct from 'object' or new_fact->'confirmation'->>'actorId' <> p_actor_id::text or new_fact->'confirmation'->>'operation' <> 'human_confirm'
       or exists (select 1 from jsonb_array_elements(new_candidates) c where c->>'candidateId' <> p_candidate_id and c is distinct from (select o from jsonb_array_elements(old_candidates) o where o->>'candidateId'=c->>'candidateId'))
       or not exists (select 1 from jsonb_array_elements(new_candidates) c where c->>'candidateId'=p_candidate_id and not ((c - 'state') is distinct from (candidate - 'state')) and c->>'state'='confirmed') then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','candidate_confirmation_forgery'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    history := new_history->old_history_count;
    if jsonb_typeof(history) is distinct from 'object' or history ?& array['historyId','kind','candidateId','factId','before','choice','actorId','confirmedAt','beforeRevision','afterRevision'] is false
       or history->>'historyId' !~ '^[0-9a-f]{64}$' or history->>'kind' <> 'candidate_confirmed' or history->>'candidateId' <> p_candidate_id or history->>'factId' <> target_fact_id or history->>'choice' <> 'confirm_candidate'
       or history->'before' is distinct from jsonb_build_object('value',old_fact->'canonicalValue','provenance',old_fact->'provenance')
       or history->'incoming' is distinct from candidate
       or history->>'actorId' <> p_actor_id::text or history->>'confirmedAt' is distinct from new_fact->'confirmation'->>'confirmedAt'
       or history->>'beforeRevision' <> s.revision::text or history->>'afterRevision' <> (s.revision + 1)::text then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','confirmation_history_forgery'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
  elsif p_operation = 'resolve_extraction_conflict' then
    if coalesce(p_conflict_id !~ '^[0-9a-f]{64}$', true) or p_candidate_id is not null
       or coalesce(p_choice not in ('keep_existing','commit_incoming','commit_human_value'), true)
       or (p_choice = 'commit_human_value' and (p_human_value is null or jsonb_typeof(p_human_value) not in ('string','object','array','number','boolean')))
       or (p_choice <> 'commit_human_value' and p_human_value is not null)
       or (p_rationale is not null and (length(p_rationale) < 1 or length(p_rationale) > 1000))
       or new_candidate_count <> old_candidate_count or new_candidates is distinct from old_candidates or new_conflict_count <> old_conflict_count or new_history_count <> old_history_count + 1 then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','resolution_delta'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    select c into conflict from jsonb_array_elements(old_conflicts) c where c->>'conflictId'=p_conflict_id and c->>'state'='open';
    if conflict is null or (select count(*) from jsonb_array_elements(old_conflicts) c where c->>'conflictId'=p_conflict_id) <> 1 then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','conflict_not_open'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    target_fact_id := conflict->>'factId'; old_fact := s.ledger->'facts'->target_fact_id; new_fact := p_ledger->'facts'->target_fact_id;
    if exists (select 1 from jsonb_each(s.ledger->'facts') f where f.key <> target_fact_id and p_ledger->'facts'->f.key is distinct from f.value)
       or jsonb_typeof(old_fact) is distinct from 'object' or jsonb_typeof(new_fact) is distinct from 'object'
       or not exists (select 1 from jsonb_array_elements(new_conflicts) c where c->>'conflictId'=p_conflict_id and not ((c - 'state') is distinct from (conflict - 'state')) and c->>'state'='closed')
       or exists (select 1 from jsonb_array_elements(new_conflicts) c where c->>'conflictId' <> p_conflict_id and c is distinct from (select o from jsonb_array_elements(old_conflicts) o where o->>'conflictId'=c->>'conflictId'))
       -- Existing committed and N/A values are never mutable through a keep decision.
       or (p_choice='keep_existing' and old_fact->>'status' <> 'candidate' and new_fact is distinct from old_fact)
       -- Candidate confirmation may change only the lifecycle and confirmation fields.
       or (p_choice='keep_existing' and old_fact->>'status' = 'candidate' and (
         new_fact->>'status' <> 'committed'
         or new_fact->'canonicalValue' is distinct from conflict->'existing'->'value'
         or new_fact->'originalWording' is distinct from old_fact->'originalWording'
         or new_fact->'provenance' is distinct from conflict->'existing'->'provenance'
         or (new_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation') is distinct from (old_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation')
         or jsonb_typeof(new_fact->'confirmation') is distinct from 'object'
         or new_fact->'confirmation'->>'actorId' <> p_actor_id::text
         or new_fact->'confirmation'->>'operation' <> 'human_resolve_conflict'
       ))
       -- Incoming resolution is derived only from the immutable incoming evidence.
       or (p_choice='commit_incoming' and (
         new_fact->>'status' <> 'committed'
         or new_fact->'canonicalValue' is distinct from conflict->'incoming'->'value'
         or new_fact->'originalWording' is distinct from conflict->'incoming'->'originalWording'
         or (new_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation') is distinct from (old_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation')
         or jsonb_typeof(new_fact->'provenance') is distinct from 'array' or jsonb_array_length(new_fact->'provenance') <> 1
         or new_fact->'provenance'->0->>'kind' <> 'message'
         or new_fact->'provenance'->0->>'sourceId' <> conflict->'incoming'->'evidence'->0->>'messageId'
         or new_fact->'provenance'->0->>'excerpt' <> left(conflict->'incoming'->>'originalWording',1000)
         or jsonb_typeof(new_fact->'provenance'->0->'sourceMessageIds') is distinct from 'array'
         or jsonb_array_length(new_fact->'provenance'->0->'sourceMessageIds') <> (select count(distinct e->>'messageId') from jsonb_array_elements(conflict->'incoming'->'evidence') e)
         or exists (select 1 from jsonb_array_elements(conflict->'incoming'->'evidence') e where not (new_fact->'provenance'->0->'sourceMessageIds' @> jsonb_build_array(e->>'messageId')))
         or jsonb_typeof(new_fact->'confirmation') is distinct from 'object'
         or new_fact->'confirmation'->>'actorId' <> p_actor_id::text
         or new_fact->'confirmation'->>'operation' <> 'human_resolve_conflict'
       ))
       -- A typed human override has human provenance, no model wording, and a new human confirmation.
       or (p_choice='commit_human_value' and (
         new_fact->>'status' <> 'committed'
         or new_fact->'canonicalValue' is distinct from p_human_value
         or new_fact ? 'originalWording'
         or (new_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation') is distinct from (old_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation')
         or jsonb_typeof(new_fact->'provenance') is distinct from 'array' or jsonb_array_length(new_fact->'provenance') <> 1
         or new_fact->'provenance'->0->>'kind' <> 'human_editor'
         or new_fact->'provenance'->0->>'sourceId' <> ('conflict:' || p_conflict_id)
         or new_fact->'provenance'->0->'sourceMessageIds' is distinct from '[]'::jsonb
         or jsonb_typeof(new_fact->'confirmation') is distinct from 'object'
         or new_fact->'confirmation'->>'actorId' <> p_actor_id::text
         or new_fact->'confirmation'->>'operation' <> 'human_resolve_conflict'
       )) then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','conflict_resolution_forgery'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
    history := new_history->old_history_count;
    if jsonb_typeof(history) is distinct from 'object' or history ?& array['historyId','kind','conflictId','factId','before','incoming','choice','actorId','confirmedAt','beforeRevision','afterRevision'] is false
       or history->>'historyId' !~ '^[0-9a-f]{64}$' or history->>'kind' <> 'conflict_resolved' or history->>'conflictId' <> p_conflict_id or history->>'factId' <> target_fact_id or history->>'choice' <> p_choice
       or history->'before' is distinct from (conflict->'existing' - 'candidate')
       or (conflict->'existing' ? 'candidate' and history->'existingCandidate' is distinct from conflict->'existing'->'candidate')
       or (not (conflict->'existing' ? 'candidate') and history ? 'existingCandidate')
       or history->'incoming' is distinct from conflict->'incoming' or history->>'actorId' <> p_actor_id::text or history->>'beforeRevision' <> s.revision::text or history->>'afterRevision' <> (s.revision + 1)::text
       -- Request inputs are bound exactly, including absence, so an audit entry cannot invent context.
       or (p_rationale is null and history ? 'rationale')
       or (p_rationale is not null and history->>'rationale' is distinct from p_rationale)
       or (p_choice='commit_human_value' and history->'humanValue' is distinct from p_human_value)
       or (p_choice <> 'commit_human_value' and history ? 'humanValue')
       -- This is the current human resolution decision time, not a retained fact timestamp.
       or coalesce(history->>'confirmedAt' !~ '^\d{4}-\d{2}-\d{2}T', true) then
      perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2,'reason','resolution_history_forgery'));
      return jsonb_build_object('outcome','invalid_transition');
    end if;
  else
    perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,s.revision,s.revision,'invalid_transition',jsonb_build_object('schemaVersion',2));
    return jsonb_build_object('outcome','invalid_transition');
  end if;

  before_revision := s.revision;
  update public.template_copilot_sessions set ledger=p_ledger, revision=revision+1, updated_at=clock_timestamp() where id=p_session_id returning * into s;
  response := jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response) values(p_session_id,p_idempotency_key,p_command_hash,response);
  perform private.audit_template_copilot_v2_extraction_attempt(p_session_id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,before_revision,s.revision,'applied',jsonb_build_object('schemaVersion',2,'evidenceHash',p_evidence_hash,'candidateCount',new_candidate_count,'conflictCount',new_conflict_count,'historyCount',new_history_count));
  return response;
end;
$$;

revoke all on function public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text) to service_role;
