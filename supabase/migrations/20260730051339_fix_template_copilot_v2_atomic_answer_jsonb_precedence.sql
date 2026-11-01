-- PostgreSQL gives JSON extraction (`->`) lower precedence than JSONB
-- deletion (`-`).  Without parentheses, expressions such as
-- `ledger->'atomicDecisions' - decision_id` are parsed as extraction with a
-- JSON subtraction expression on the right, producing SQLSTATE 22P02.
--
-- Correct every security-definer mutation function that used this ambiguous
-- form. Exact one-occurrence checks preserve fail-closed migration behavior.
do $migration$
declare
  correction record;
  function_definition text;
  corrected_definition text;
  occurrence_count integer;
begin
  for correction in
    select *
    from (values
      (
        to_regprocedure('public.answer_template_copilot_v2_decision(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb)')::oid,
        '(p_ledger->''atomicDecisions'' - p_decision_id)',
        '((p_ledger->''atomicDecisions'') - p_decision_id)'
      ),
      (
        to_regprocedure('public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb)')::oid,
        '(p_ledger->''atomicDecisions'' - p_decision_id)',
        '((p_ledger->''atomicDecisions'') - p_decision_id)'
      ),
      (
        to_regprocedure('public.apply_template_copilot_v2_extraction(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text)')::oid,
        '(conflict->''existing'' - ''candidate'')',
        '((conflict->''existing'') - ''candidate'')'
      )
    ) as corrections(target_oid, ambiguous_expression, corrected_expression)
  loop
    if correction.target_oid is null then
      raise exception using
        errcode = 'P0001',
        message = 'template_copilot_v2_jsonb_precedence_function_missing';
    end if;

    function_definition := pg_get_functiondef(correction.target_oid);
    occurrence_count :=
      (length(function_definition) -
        length(replace(
          function_definition,
          correction.ambiguous_expression,
          ''
        )))
      / length(correction.ambiguous_expression);

    if occurrence_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'template_copilot_v2_jsonb_precedence_definition_drift';
    end if;

    corrected_definition := replace(
      function_definition,
      correction.ambiguous_expression,
      correction.corrected_expression
    );
    execute corrected_definition;
  end loop;
end;
$migration$;

revoke all on function public.answer_template_copilot_v2_decision(
  uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.answer_template_copilot_v2_decision(
  uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb
) to service_role;

revoke all on function public.apply_template_copilot_v2_special_decision(
  uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_special_decision(
  uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb
) to service_role;

revoke all on function public.apply_template_copilot_v2_extraction(
  uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text
) from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_extraction(
  uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text
) to service_role;
