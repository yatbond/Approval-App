drop policy if exists "template creators read own workflow template versions"
on public.workflow_template_versions;

create policy "template creators read own workflow template versions"
on public.workflow_template_versions for select
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);
