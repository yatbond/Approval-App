grant select, insert, update on public.workflow_template_versions to authenticated;

drop policy if exists "template creators insert workflow template versions"
on public.workflow_template_versions;

create policy "template creators insert workflow template versions"
on public.workflow_template_versions for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "template creators update workflow template versions"
on public.workflow_template_versions;

create policy "template creators update workflow template versions"
on public.workflow_template_versions for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

drop policy if exists "users claim ownerless workflow template versions"
on public.workflow_template_versions;

create policy "users claim ownerless workflow template versions"
on public.workflow_template_versions for update
to authenticated
using (created_by is null)
with check (created_by = (select auth.uid()));
