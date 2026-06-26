revoke all privileges on table
  public.workflow_collaboration_requests,
  public.workflow_shared_fulfillments,
  public.workflow_correction_requests,
  public.workflow_notification_events
from anon, authenticated;

grant select, insert, update on public.workflow_collaboration_requests to authenticated;
grant select, insert, update on public.workflow_shared_fulfillments to authenticated;
grant select, insert, update on public.workflow_correction_requests to authenticated;
grant select, insert, update on public.workflow_notification_events to authenticated;
