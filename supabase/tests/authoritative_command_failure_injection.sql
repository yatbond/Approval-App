begin;

create or replace function private.phase4_reject_injected_step()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.phase4_failure_step', true) =
     concat(tg_table_name, ':', tg_op) then
    raise exception 'phase4 injected failure at %:%', tg_table_name, tg_op;
  end if;
  return new;
end;
$$;

create trigger phase4_fail_request_update
before update on public.approval_requests
for each row execute function private.phase4_reject_injected_step();
create trigger phase4_fail_receipt_write
before insert or update on public.approval_command_receipts
for each row execute function private.phase4_reject_injected_step();
create trigger phase4_fail_participant_write
before insert or update on public.approval_request_participants
for each row execute function private.phase4_reject_injected_step();
create trigger phase4_fail_event_insert
before insert on public.approval_request_events
for each row execute function private.phase4_reject_injected_step();
create trigger phase4_fail_notification_insert
before insert on public.approval_notifications
for each row execute function private.phase4_reject_injected_step();
create trigger phase4_fail_outbox_insert
before insert on public.approval_email_outbox
for each row execute function private.phase4_reject_injected_step();

do $test$
declare
  v_request public.approval_requests%rowtype;
  v_step text;
  v_failed boolean;
  v_before_receipts bigint;
  v_before_events bigint;
  v_before_notifications bigint;
  v_before_outbox bigint;
  v_after_count bigint;
  v_after_version bigint;
  v_after_status text;
begin
  select r.* into v_request
  from public.approval_requests r
  where r.request_no like 'PHASE4-RACE-%'
    and r.state_version = 1
  order by r.request_no
  limit 1;
  if not found then
    raise exception 'run test-authoritative-concurrency.mjs before failure injection';
  end if;

  select count(*) into v_before_receipts
  from public.approval_command_receipts c
  where c.approval_request_id = v_request.id;
  select count(*) into v_before_events
  from public.approval_request_events e
  where e.approval_request_id = v_request.id;
  select count(*) into v_before_notifications
  from public.approval_notifications n
  where n.approval_request_id = v_request.id;
  select count(*) into v_before_outbox
  from public.approval_email_outbox o
  where o.approval_request_id = v_request.id;

  foreach v_step in array array[
    'approval_command_receipts:INSERT',
    'approval_requests:UPDATE',
    'approval_request_participants:UPDATE',
    'approval_request_events:INSERT',
    'approval_notifications:INSERT',
    'approval_email_outbox:INSERT',
    'approval_command_receipts:UPDATE'
  ]
  loop
    perform set_config('app.phase4_failure_step', v_step, true);
    v_failed := false;
    begin
      perform public.commit_approval_request_command(
        v_request.request_no,
        v_request.current_owner_id,
        concat('inject-', replace(lower(v_step), ':', '-')),
        'request_correction',
        repeat('a', 64),
        v_request.state_version,
        jsonb_build_object(
          'status', 'returned',
          'lastAction', concat('Injected failure ', v_step)
        ),
        jsonb_build_object(
          'type', 'request_correction',
          'summary', concat('Injected failure ', v_step),
          'details', jsonb_build_object('failureStep', v_step)
        ),
        jsonb_build_array(jsonb_build_object(
          'recipientProfileId', v_request.current_owner_id,
          'kind', 'request_correction',
          'title', 'Failure injection',
          'body', concat('Injected failure ', v_step),
          'sendEmail', true
        ))
      );
    exception when others then
      if sqlerrm not like 'phase4 injected failure at %' then
        raise;
      end if;
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'failure injection did not fire at %', v_step;
    end if;

    select state_version, status into v_after_version, v_after_status
    from public.approval_requests where id = v_request.id;
    if v_after_version <> v_request.state_version or v_after_status <> v_request.status then
      raise exception 'request changed after injected failure at %', v_step;
    end if;

    select count(*) into v_after_count from public.approval_command_receipts
    where approval_request_id = v_request.id;
    if v_after_count <> v_before_receipts then
      raise exception 'receipt leaked after injected failure at %', v_step;
    end if;
    select count(*) into v_after_count from public.approval_request_events
    where approval_request_id = v_request.id;
    if v_after_count <> v_before_events then
      raise exception 'event leaked after injected failure at %', v_step;
    end if;
    select count(*) into v_after_count from public.approval_notifications
    where approval_request_id = v_request.id;
    if v_after_count <> v_before_notifications then
      raise exception 'notification leaked after injected failure at %', v_step;
    end if;
    select count(*) into v_after_count from public.approval_email_outbox
    where approval_request_id = v_request.id;
    if v_after_count <> v_before_outbox then
      raise exception 'outbox row leaked after injected failure at %', v_step;
    end if;
  end loop;
end;
$test$;

rollback;
