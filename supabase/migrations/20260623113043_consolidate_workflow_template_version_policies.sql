grant select, insert, update on public.workflow_template_versions to authenticated;

drop policy if exists "authenticated read active workflow template versions"
on public.workflow_template_versions;

drop policy if exists "authenticated read active workflow templates"
on public.workflow_template_versions;

drop policy if exists "template creators read own workflow template versions"
on public.workflow_template_versions;

drop policy if exists "template creators insert workflow template versions"
on public.workflow_template_versions;

drop policy if exists "admins insert workflow template versions"
on public.workflow_template_versions;

drop policy if exists "admins create workflow template versions"
on public.workflow_template_versions;

drop policy if exists "template creators update workflow template versions"
on public.workflow_template_versions;

drop policy if exists "users claim ownerless workflow template versions"
on public.workflow_template_versions;

drop policy if exists "template owners archive workflow template versions"
on public.workflow_template_versions;

drop policy if exists "admins update workflow template versions"
on public.workflow_template_versions;

drop policy if exists "workflow template versions readable by active users"
on public.workflow_template_versions;

create policy "workflow template versions readable by active users"
on public.workflow_template_versions for select
to authenticated
using (
  is_active
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);

drop policy if exists "workflow template versions insertable by owners or admins"
on public.workflow_template_versions;

create policy "workflow template versions insertable by owners or admins"
on public.workflow_template_versions for insert
to authenticated
with check (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);

drop policy if exists "workflow template versions writable by owners or admins"
on public.workflow_template_versions;

create policy "workflow template versions writable by owners or admins"
on public.workflow_template_versions for update
to authenticated
using (
  created_by = (select auth.uid())
  or created_by is null
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
)
with check (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);
