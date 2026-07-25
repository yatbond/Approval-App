revoke all privileges on table
  public.business_units,
  public.business_departments,
  public.profiles,
  public.workflow_template_versions,
  public.approval_requests,
  public.approval_request_events,
  public.approval_request_attachments,
  public.workspace_snapshots
from anon, authenticated;

grant select, insert, update, delete on public.business_units to authenticated;
grant select, insert, update, delete on public.business_departments to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workflow_template_versions to authenticated;
grant select, insert, update on public.approval_requests to authenticated;
grant select, insert, update on public.approval_request_events to authenticated;
grant select, insert, update on public.approval_request_attachments to authenticated;
grant select, insert, update on public.workspace_snapshots to authenticated;
