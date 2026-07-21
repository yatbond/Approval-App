do $$
declare v_count integer;
begin
  if (select mode <> 'authoritative' or cohort_percentage <> 100 or not legacy_writes_frozen
      from public.approval_rollout_settings where singleton) then
    raise exception 'rollout is not in the authoritative safe state';
  end if;

  select count(*) into v_count from pg_trigger
  where tgname = 'legacy_runtime_write_frozen' and not tgisinternal;
  if v_count <> 7 then raise exception 'expected 7 legacy freeze triggers, found %', v_count; end if;

  if has_function_privilege('authenticated', 'public.set_approval_rollout_state(text,integer,timestamptz,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_approval_legacy_runtime(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.audit_approval_runtime_projections(text,integer)', 'EXECUTE') then
    raise exception 'authenticated role can execute a service-only rollout function';
  end if;

  if not has_function_privilege('service_role', 'public.get_approval_rollout_decision(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.set_approval_rollout_state(text,integer,timestamptz,uuid,text)', 'EXECUTE') then
    raise exception 'service role is missing rollout execution grants';
  end if;

  if has_table_privilege('authenticated', 'public.approval_rollout_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.approval_rollout_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.approval_read_comparison_mismatches', 'UPDATE') then
    raise exception 'browser role can mutate rollout state or evidence';
  end if;

  select count(*) into v_count from public.approval_migration_issues
  where entity_type = 'approval_request' and resolved_at is null;
  if v_count < 0 then raise exception 'invalid unresolved issue count'; end if;
end
$$;
