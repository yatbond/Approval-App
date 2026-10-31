-- private.template_copilot_v2_fact_dependents declared a variable named
-- "candidate" and reused that name as the column alias of its final
-- unnest(). PL/pgSQL rejects the ambiguous reference, so every fact mutation
-- that changed a value (human_commit, human_replace, ...) failed and was
-- reported as invalid_transition. The closure logic is unchanged.
create or replace function private.template_copilot_v2_fact_dependents(p_fact_id text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare result text[] := array[]::text[]; changed boolean := true; candidate text; definition jsonb;
begin
  while changed loop
    changed := false;
    foreach candidate in array private.template_copilot_v2_fact_ids() loop
      definition := private.template_copilot_v2_fact_definition(candidate);
      if not candidate = any(result)
         and exists (select 1 from jsonb_array_elements_text(definition->'dependsOn') dependency where dependency = p_fact_id or dependency = any(result)) then
        result := array_append(result,candidate); changed := true;
      end if;
    end loop;
  end loop;
  return array(select fact_id from unnest(private.template_copilot_v2_fact_ids()) as fact_id where fact_id = any(result));
end;
$$;
revoke all on function private.template_copilot_v2_fact_dependents(text) from public, anon, authenticated;
