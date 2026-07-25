begin;

do $$
declare
  v_rls boolean;
  v_config text[];
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = 'public.approval_submission_receipts'::regclass;
  if not v_rls then
    raise exception 'approval_submission_receipts must have RLS enabled';
  end if;

  if has_table_privilege('authenticated', 'public.approval_submission_receipts', 'SELECT')
     or has_table_privilege('authenticated', 'public.approval_submission_receipts', 'INSERT')
     or has_table_privilege('authenticated', 'public.approval_submission_receipts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.approval_submission_receipts', 'DELETE') then
    raise exception 'authenticated must not access submission receipts';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.submit_approval_request(uuid,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute submit_approval_request';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.submit_approval_request(uuid,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute submit_approval_request';
  end if;

  select p.proconfig into v_config
  from pg_proc p
  where p.oid = 'public.submit_approval_request(uuid,text,text,jsonb,jsonb)'::regprocedure;
  if v_config is null or not ('search_path=""' = any(v_config)) then
    raise exception 'submit_approval_request must use an empty search_path';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = any(i.indkey)
    where i.indrelid = 'public.approval_submission_receipts'::regclass
      and a.attname = 'approval_request_id'
  ) then
    raise exception 'submission receipt request FK must be indexed';
  end if;
end;
$$;

rollback;
