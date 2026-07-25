grant select, insert, update on public.workflow_template_versions to authenticated;

drop policy if exists "template creators update workflow template versions"
on public.workflow_template_versions;

create policy "template creators update workflow template versions"
on public.workflow_template_versions for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));
