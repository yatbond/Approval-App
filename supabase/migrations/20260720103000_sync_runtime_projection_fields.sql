-- Keep the queryable approval request projection aligned with the pinned task
-- snapshot written by every authoritative command. Without this trigger,
-- routing changes such as approve/reject can leave current_step and due_label
-- stale even though the transactional task snapshot is correct.

create or replace function private.sync_approval_request_task_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_snapshot is distinct from old.task_snapshot
     and jsonb_typeof(new.task_snapshot) = 'object' then
    if new.task_snapshot ? 'currentStep' then
      new.current_step := left(coalesce(new.task_snapshot ->> 'currentStep', ''), 500);
    end if;
    if new.task_snapshot ? 'due' then
      new.due_label := left(coalesce(new.task_snapshot ->> 'due', ''), 500);
    end if;
    if new.task_snapshot ? 'value' then
      new.value_label := left(coalesce(new.task_snapshot ->> 'value', ''), 500);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_approval_request_task_projection()
from public, anon, authenticated;

drop trigger if exists approval_requests_sync_task_projection
on public.approval_requests;

create trigger approval_requests_sync_task_projection
before update of task_snapshot on public.approval_requests
for each row
execute function private.sync_approval_request_task_projection();

-- Repair rows committed before the trigger existed. This is intentionally
-- limited to denormalized display/routing fields; owner identity continues to
-- be validated and written by commit_approval_request_command.
update public.approval_requests r
set current_step = case
      when r.task_snapshot ? 'currentStep'
        then left(coalesce(r.task_snapshot ->> 'currentStep', ''), 500)
      else r.current_step
    end,
    due_label = case
      when r.task_snapshot ? 'due'
        then left(coalesce(r.task_snapshot ->> 'due', ''), 500)
      else r.due_label
    end,
    value_label = case
      when r.task_snapshot ? 'value'
        then left(coalesce(r.task_snapshot ->> 'value', ''), 500)
      else r.value_label
    end
where jsonb_typeof(r.task_snapshot) = 'object'
  and (
    (r.task_snapshot ? 'currentStep'
      and r.task_snapshot ->> 'currentStep' is distinct from coalesce(r.current_step, ''))
    or (r.task_snapshot ? 'due'
      and r.task_snapshot ->> 'due' is distinct from coalesce(r.due_label, ''))
    or (r.task_snapshot ? 'value'
      and r.task_snapshot ->> 'value' is distinct from coalesce(r.value_label, ''))
  );

select public.audit_approval_runtime_projections(null, 5000);
