begin;

do $test$
declare
  v_missing text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'approval_requests'
      and column_name = 'state_version'
      and is_nullable = 'NO'
  ) then
    raise exception 'approval_requests.state_version is missing or nullable';
  end if;

  if has_table_privilege('authenticated', 'public.approval_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.approval_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.approval_requests', 'DELETE') then
    raise exception 'authenticated can directly mutate approval_requests';
  end if;

  if has_table_privilege('authenticated', 'public.approval_request_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.approval_request_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.approval_request_events', 'DELETE') then
    raise exception 'authenticated can directly mutate approval_request_events';
  end if;

  if has_table_privilege('service_role', 'public.approval_request_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.approval_request_events', 'DELETE')
     or has_table_privilege('service_role', 'public.approval_request_events', 'TRUNCATE') then
    raise exception 'service_role can mutate or truncate approval_request_events';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.commit_approval_request_command(text,uuid,text,text,text,bigint,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute the authoritative command function';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.commit_approval_request_command(text,uuid,text,text,text,bigint,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute the authoritative command function';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.save_workspace_configuration(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute atomic configuration save';
  end if;

  select c.relname into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'approval_requests',
      'approval_request_events',
      'approval_request_participants',
      'approval_request_assignments',
      'approval_command_receipts',
      'approval_migration_issues',
      'approval_notifications',
      'approval_email_outbox'
    )
    and not c.relrowsecurity
  limit 1;
  if v_missing is not null then
    raise exception 'RLS is disabled on %', v_missing;
  end if;

  select p.proname into v_missing
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.proname in (
      'commit_approval_request_command',
      'save_workspace_configuration',
      'can_read_approval_request',
      'can_read_approval_request_by_no',
      'is_active_approval_admin'
    )
    and (
      not p.prosecdef
      or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=""%'
    )
  limit 1;
  if v_missing is not null then
    raise exception 'function % is missing SECURITY DEFINER or empty search_path', v_missing;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.approval_request_events'::regclass
      and t.tgname = 'approval_request_events_append_only'
      and t.tgenabled <> 'D'
  ) then
    raise exception 'approval_request_events append-only trigger is missing';
  end if;

  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'approval_requests',
        'approval_request_events',
        'workflow_collaboration_requests',
        'workflow_shared_fulfillments',
        'workflow_correction_requests',
        'workflow_notification_events'
      )
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any(p.roles)
  ) then
    raise exception 'authenticated write policy remains on authoritative runtime';
  end if;

  select cls.relname || '.' || att.attname into v_missing
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace n on n.oid = cls.relnamespace
  join pg_attribute att
    on att.attrelid = con.conrelid
   and att.attnum = any(con.conkey)
  where con.contype = 'f'
    and n.nspname = 'public'
    and cls.relname in (
      'approval_request_participants',
      'approval_request_assignments',
      'approval_command_receipts',
      'approval_notifications',
      'approval_email_outbox'
    )
    and not exists (
      select 1
      from pg_index idx
      where idx.indrelid = con.conrelid
        and con.conkey <@ idx.indkey::smallint[]
    )
  limit 1;
  if v_missing is not null then
    raise exception 'foreign key lacks an index: %', v_missing;
  end if;
end
$test$;

rollback;
