-- Keep the locked Copilot v2 database commands aligned with the reviewed
-- presentation-only question-library pins, and let one durable requirements
-- document command atomically retain both its sanitized source and any
-- review-only candidates derived from that exact source.
do $migration$
declare
  target_oid oid;
  function_definition text;
  corrected_definition text;
  occurrence_count integer;
begin
  target_oid :=
    to_regprocedure(
      'private.template_copilot_v2_dependency_graph(text)'
    )::oid;
  if target_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_dependency_graph_missing';
  end if;
  function_definition := pg_get_functiondef(target_oid);
  occurrence_count :=
    (length(function_definition) -
      length(replace(
        function_definition,
        'where p_library_version = ''v2.0''',
        ''
      )))
    / length('where p_library_version = ''v2.0''');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_dependency_graph_drift';
  end if;
  corrected_definition := replace(
    function_definition,
    'where p_library_version = ''v2.0''',
    'where p_library_version = any(array[''v2.0'',''v2.1'',''v2.2''])'
  );
  execute corrected_definition;

  target_oid :=
    to_regprocedure(
      'public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb)'
    )::oid;
  if target_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_special_function_missing';
  end if;
  function_definition := pg_get_functiondef(target_oid);

  occurrence_count :=
    (length(function_definition) -
      length(replace(
        function_definition,
        'session_library_version is distinct from ''v2.0''',
        ''
      )))
    / length('session_library_version is distinct from ''v2.0''');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_special_session_pin_drift';
  end if;
  corrected_definition := replace(
    function_definition,
    'session_library_version is distinct from ''v2.0''',
    'session_library_version <> all (array[''v2.0'',''v2.1'',''v2.2''])'
  );

  occurrence_count :=
    (length(corrected_definition) -
      length(replace(
        corrected_definition,
        'ledger_library_version is distinct from ''v2.0''',
        ''
      )))
    / length('ledger_library_version is distinct from ''v2.0''');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_special_ledger_pin_drift';
  end if;
  corrected_definition := replace(
    corrected_definition,
    'ledger_library_version is distinct from ''v2.0''',
    'ledger_library_version is distinct from session_library_version'
  );
  execute corrected_definition;

  target_oid :=
    to_regprocedure(
      'public.finalize_template_copilot_v2_mode_command(uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb)'
    )::oid;
  if target_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_mode_finalizer_missing';
  end if;
  function_definition := pg_get_functiondef(target_oid);

  occurrence_count :=
    (length(function_definition) -
      length(replace(
        function_definition,
        E'new_document jsonb;\n  old_document_count integer;',
        ''
      )))
    / length(E'new_document jsonb;\n  old_document_count integer;');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_mode_finalizer_declaration_drift';
  end if;
  corrected_definition := replace(
    function_definition,
    E'new_document jsonb;\n  old_document_count integer;',
    E'new_document jsonb;\n  old_document_count integer;\n  candidate_ledger jsonb;'
  );

  occurrence_count :=
    (length(corrected_definition) -
      length(replace(
        corrected_definition,
        E'if p_outcome=''applied'' then\n    result := public.apply_template_copilot_v2_extraction',
        ''
      )))
    / length(E'if p_outcome=''applied'' then\n    result := public.apply_template_copilot_v2_extraction');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_mode_finalizer_applied_branch_drift';
  end if;
  corrected_definition := replace(
    corrected_definition,
    E'if p_outcome=''applied'' then\n    result := public.apply_template_copilot_v2_extraction',
    E'if p_outcome=''applied'' then\n'
    || E'    candidate_ledger := p_ledger;\n'
    || E'    if c.source_kind=''document'' then\n'
    || E'      if jsonb_typeof(s.ledger->''requirementDocumentExtracts'') is distinct from ''array''\n'
    || E'         or jsonb_typeof(p_ledger->''requirementDocumentExtracts'') is distinct from ''array''\n'
    || E'         or (p_ledger - ''requirementDocumentExtracts'' - ''facts'' - ''extractionEvidence'')\n'
    || E'              is distinct from (s.ledger - ''requirementDocumentExtracts'' - ''facts'' - ''extractionEvidence'') then\n'
    || E'        result := jsonb_build_object(''outcome'',''invalid_transition'');\n'
    || E'        update public.template_copilot_v2_mode_commands set state=''finalized'',response=result,detail=jsonb_build_object(''reason'',''document_candidate_scope''),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;\n'
    || E'        return result;\n'
    || E'      end if;\n'
    || E'      old_document_count := jsonb_array_length(s.ledger->''requirementDocumentExtracts'');\n'
    || E'      if jsonb_array_length(p_ledger->''requirementDocumentExtracts'') <> old_document_count + 1\n'
    || E'         or exists (select 1 from jsonb_array_elements(s.ledger->''requirementDocumentExtracts'') with ordinality d(value,n) where p_ledger->''requirementDocumentExtracts''->(n-1) is distinct from d.value) then\n'
    || E'        result := jsonb_build_object(''outcome'',''invalid_transition'');\n'
    || E'        update public.template_copilot_v2_mode_commands set state=''finalized'',response=result,detail=jsonb_build_object(''reason'',''document_candidate_delta''),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;\n'
    || E'        return result;\n'
    || E'      end if;\n'
    || E'      new_document := p_ledger->''requirementDocumentExtracts''->old_document_count;\n'
    || E'      select content into source_text from public.template_copilot_messages where session_id=p_session_id and owner_id=p_actor_id and client_message_id=c.source_message_id and role=''user'' order by created_at asc limit 1;\n'
    || E'      if jsonb_typeof(new_document) is distinct from ''object''\n'
    || E'         or not (new_document ?& array[''id'',''fileName'',''sha256'',''text'',''safety''])\n'
    || E'         or (new_document - array[''id'',''fileName'',''sha256'',''text'',''safety'']) <> ''{}''::jsonb\n'
    || E'         or new_document->>''id'' !~ ''^req-[0-9a-f]{32}$''\n'
    || E'         or length(new_document->>''fileName'') not between 1 and 300\n'
    || E'         or new_document->>''sha256'' !~ ''^[0-9a-f]{64}$''\n'
    || E'         or new_document->>''safety'' <> ''sanitized_untrusted_text''\n'
    || E'         or char_length(new_document->>''text'') not between 1 and 80000\n'
    || E'         or new_document->>''text'' is distinct from source_text\n'
    || E'         or jsonb_typeof(p_detail->''document'') is distinct from ''object''\n'
    || E'         or p_detail->''document'' is distinct from (new_document - ''text'') then\n'
    || E'        result := jsonb_build_object(''outcome'',''invalid_transition'');\n'
    || E'        update public.template_copilot_v2_mode_commands set state=''finalized'',response=result,detail=jsonb_build_object(''reason'',''document_candidate_provenance''),finalized_at=clock_timestamp() where session_id=p_session_id and idempotency_key=p_idempotency_key;\n'
    || E'        return result;\n'
    || E'      end if;\n'
    || E'      candidate_ledger := jsonb_set(p_ledger,''{requirementDocumentExtracts}'',s.ledger->''requirementDocumentExtracts'',false);\n'
    || E'    end if;\n'
    || E'    result := public.apply_template_copilot_v2_extraction'
  );

  occurrence_count :=
    (length(corrected_definition) -
      length(replace(
        corrected_definition,
        'p_ledger,p_evidence_hash',
        ''
      )))
    / length('p_ledger,p_evidence_hash');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_mode_finalizer_extraction_argument_drift';
  end if;
  corrected_definition := replace(
    corrected_definition,
    'p_ledger,p_evidence_hash',
    'candidate_ledger,p_evidence_hash'
  );

  -- WITH ORDINALITY exposes bigint. PostgreSQL's jsonb array subscript
  -- operator accepts integer, so both the pre-existing no-candidate branch
  -- and the candidate-retention branch must cast the one-based ordinal.
  occurrence_count :=
    (length(corrected_definition) -
      length(replace(
        corrected_definition,
        '->(n-1)',
        ''
      )))
    / length('->(n-1)');
  if occurrence_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_document_ordinal_drift';
  end if;
  corrected_definition := replace(
    corrected_definition,
    '->(n-1)',
    '->((n-1)::integer)'
  );

  occurrence_count :=
    (length(corrected_definition) -
      length(replace(
        corrected_definition,
        E'    -- Broad input is a one-turn intake. After candidates are proposed, the\n    -- deterministic Guided controller asks only the remaining gaps.\n    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)',
        ''
      )))
    / length(E'    -- Broad input is a one-turn intake. After candidates are proposed, the\n    -- deterministic Guided controller asks only the remaining gaps.\n    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)');
  if occurrence_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_mode_finalizer_post_extraction_drift';
  end if;
  corrected_definition := replace(
    corrected_definition,
    E'    -- Broad input is a one-turn intake. After candidates are proposed, the\n    -- deterministic Guided controller asks only the remaining gaps.\n    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)',
    E'    if c.source_kind=''document'' then\n'
    || E'      result := jsonb_set(result,''{ledger,requirementDocumentExtracts}'',p_ledger->''requirementDocumentExtracts'',true);\n'
    || E'      update public.template_copilot_sessions set ledger=result->''ledger'',updated_at=clock_timestamp() where id=p_session_id and owner_id=p_actor_id;\n'
    || E'      if not found then\n'
    || E'        raise exception using errcode=''P0001'',message=''template_copilot_v2_document_session_finalize_missing'';\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || E'    -- Broad input is a one-turn intake. After candidates are proposed, the\n'
    || E'    -- deterministic Guided controller asks only the remaining gaps.\n'
    || E'    insert into public.template_copilot_v2_authoring_modes(session_id,owner_id,mode)'
  );
  execute corrected_definition;
end;
$migration$;

revoke all on function private.template_copilot_v2_dependency_graph(text)
from public, anon, authenticated, service_role;

revoke all on function public.apply_template_copilot_v2_special_decision(
  uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_special_decision(
  uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb
) to service_role;

revoke all on function public.finalize_template_copilot_v2_mode_command(
  uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb
) from public, anon, authenticated;
grant execute on function public.finalize_template_copilot_v2_mode_command(
  uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb
) to service_role;
