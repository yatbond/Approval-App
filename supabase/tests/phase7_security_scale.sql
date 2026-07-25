do $$
declare v_count integer;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_count <> 0 then raise exception '% public tables lack RLS', v_count; end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT';
  if v_count <> 0 then raise exception 'anon retains % non-SELECT table grants', v_count; end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated'
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  if v_count <> 0 then raise exception 'authenticated retains % dangerous table grants', v_count; end if;

  if has_table_privilege('authenticated', 'public.approval_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.approval_request_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.approval_notifications', 'UPDATE')
     or has_table_privilege('authenticated', 'public.delegations', 'INSERT') then
    raise exception 'authoritative or obsolete write grant is exposed';
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not ('search_path=""' = any(coalesce(p.proconfig, '{}'::text[])));
  if v_count <> 0 then raise exception '% definer functions lack empty search_path', v_count; end if;

  select count(*) into v_count
  from pg_constraint f join pg_class c on c.oid = f.conrelid
    join pg_namespace n on n.oid = c.relnamespace
  where f.contype = 'f' and n.nspname = 'public'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = f.conrelid
        and (i.indkey::smallint[])[0:cardinality(f.conkey)-1] @> f.conkey
        and f.conkey @> (i.indkey::smallint[])[0:cardinality(f.conkey)-1]
    );
  if v_count <> 0 then raise exception '% foreign keys lack covering indexes', v_count; end if;

  if not exists (
    select 1 from storage.buckets where id = 'approval-documents'
      and not public and file_size_limit = 26214400
  ) then raise exception 'private bounded attachment bucket is missing'; end if;

  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'approval document%';
  if v_count <> 4 then raise exception 'expected 4 attachment policies, found %', v_count; end if;
end
$$;
