do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'approval_scheduler_runs'
  ) then
    raise exception 'approval_scheduler_runs is missing';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.run_approval_escalation_scheduler(text,timestamptz,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute the escalation scheduler';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.run_approval_escalation_scheduler(text,timestamptz,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute the escalation scheduler';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.claim_approval_email_outbox(text,timestamptz,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can claim email outbox rows';
  end if;
  if has_table_privilege('authenticated', 'public.approval_email_outbox', 'UPDATE') then
    raise exception 'authenticated can directly update email outbox rows';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approval_email_outbox'
      and column_name = 'lease_expires_at'
  ) then
    raise exception 'outbox lease expiry is missing';
  end if;
end
$$;
