-- Explicitly type the two top-level JSONB deletion keys as text. This removes
-- an avoidable operator-resolution ambiguity from the security-definer
-- function while preserving its behavior. The following forward migration
-- separately fixes the extraction-then-deletion precedence bug that produced
-- SQLSTATE 22P02 on the hosted PostgreSQL version.
--
-- Keep the already-applied migration immutable and patch only the established
-- function identity.  Exact occurrence checks make this forward correction
-- fail closed if the expected predecessor definition has drifted.
do $migration$
declare
  function_definition text;
  corrected_definition text;
  target_oid oid;
  untyped_parameter_occurrences integer;
  untyped_stored_occurrences integer;
begin
  select p.oid
  into target_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'answer_template_copilot_v2_decision'
    and pg_get_function_identity_arguments(p.oid) =
      'p_actor_id uuid, p_session_id uuid, p_expected_revision bigint, p_idempotency_key text, p_command_hash text, p_decision_id text, p_ledger jsonb, p_question_id text, p_user_message text, p_assistant_message text, p_user_detail jsonb, p_assistant_detail jsonb';

  if target_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_atomic_answer_function_missing';
  end if;

  function_definition := pg_get_functiondef(target_oid);
  untyped_parameter_occurrences :=
    (length(function_definition) -
      length(replace(function_definition, '(p_ledger - ''atomicDecisions'')', '')))
    / length('(p_ledger - ''atomicDecisions'')');
  untyped_stored_occurrences :=
    (length(function_definition) -
      length(replace(function_definition, '(s.ledger - ''atomicDecisions'')', '')))
    / length('(s.ledger - ''atomicDecisions'')');

  if untyped_parameter_occurrences <> 1
     or untyped_stored_occurrences <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'template_copilot_v2_atomic_answer_definition_drift';
  end if;

  corrected_definition := replace(
    replace(
      function_definition,
      '(p_ledger - ''atomicDecisions'')',
      '(p_ledger - ''atomicDecisions''::text)'
    ),
    '(s.ledger - ''atomicDecisions'')',
    '(s.ledger - ''atomicDecisions''::text)'
  );

  execute corrected_definition;
end;
$migration$;

revoke all on function public.answer_template_copilot_v2_decision(
  uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.answer_template_copilot_v2_decision(
  uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb
) to service_role;
