-- Step 7 expands the three purpose-built fact values while preserving the
-- original Step 5 shapes for existing ledgers and explicit human upgrades.
-- This migration changes validation only. It does not rewrite a ledger,
-- create a browser grant, or enable a feature flag.

alter function private.template_copilot_v2_fact_value_valid(text, jsonb)
  rename to template_copilot_v2_step5_fact_value_valid;

-- Step 7's largest valid structures contain hundreds of recursive JSON
-- nodes. Preserve the original depth, string, array, object, and key bounds,
-- while raising only the total node/byte envelope to the route's 2 MB limit.
create or replace function private.template_copilot_v2_bounded_json(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  with recursive nodes(value,depth) as (
    select p_value,0
    union all
    select child.value,nodes.depth+1
    from nodes
    cross join lateral (
      select value
      from jsonb_array_elements(case when jsonb_typeof(nodes.value) = 'array' then
        case when jsonb_array_length(nodes.value) <= 100 then nodes.value else '[]'::jsonb end
        else '[]'::jsonb end)
      union all
      select value
      from jsonb_each(case when jsonb_typeof(nodes.value) = 'object' then
        case when (select count(*) from jsonb_object_keys(nodes.value)) <= 50 then nodes.value else '{}'::jsonb end
        else '{}'::jsonb end)
    ) child
    where nodes.depth < 9
  )
  select p_value is not null
    and octet_length(p_value::text) <= 2000000
    and count(*) <= 2000
    and coalesce(max(depth),0) <= 8
    and not exists (
      select 1 from nodes
      where case jsonb_typeof(value)
        when 'string' then private.template_copilot_v2_utf16_length(value #>> '{}') > 8000
        when 'array' then jsonb_array_length(value) > 100
        when 'object' then (select count(*) from jsonb_object_keys(value)) > 50
        else false end
    )
    and not exists (
      select 1
      from nodes
      cross join lateral jsonb_object_keys(
        case when jsonb_typeof(nodes.value) = 'object' then nodes.value else '{}'::jsonb end
      ) key
      where private.template_copilot_v2_utf16_length(key) > 120
    )
  from nodes;
$$;

create function private.template_copilot_v2_step7_attachment_value_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; formats jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value) not between 1 and 50 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    formats := item->'formats';
    if not private.template_copilot_v2_exact_object_keys(
        item,
        array['id','label','kind','required','formats','minimumQuantity','maximumQuantity','stage','contributorPolicy','confirmationPolicy'],
        array['maximumFileSizeMb']
      )
      or not private.template_copilot_v2_bounded_string(item->'id',2,80)
      or (item->>'id') !~ '^[a-z][a-z0-9_-]+$'
      or not private.template_copilot_v2_bounded_string(item->'label',1,200)
      or not private.template_copilot_v2_bounded_string(item->'kind',4,10)
      or item->>'kind' not in ('attachment','form')
      or jsonb_typeof(item->'required') is distinct from 'boolean'
      or not private.template_copilot_v2_integer_between(item->'minimumQuantity',0,20)
      or not private.template_copilot_v2_integer_between(item->'maximumQuantity',1,20)
      or not private.template_copilot_v2_bounded_string(item->'stage',7,206)
      or (
        item->>'stage' <> 'request_submission'
        and (item->>'stage') !~ '^stage:.{1,200}$'
      )
      or not private.template_copilot_v2_bounded_string(item->'contributorPolicy',1,40)
      or item->>'contributorPolicy' not in ('requester_only','allow_invited_contributors')
      or not private.template_copilot_v2_bounded_string(item->'confirmationPolicy',1,40)
      or item->>'confirmationPolicy' not in ('none','requester_confirms','stage_owner_confirms')
      then return false; end if;
    if jsonb_typeof(formats) is distinct from 'array' then return false; end if;
    if jsonb_array_length(formats) > 4 then return false; end if;
    if exists (
      select 1 from jsonb_array_elements(formats) f
      where jsonb_typeof(f) is distinct from 'string'
         or (f #>> '{}') not in ('text','pdf','image','excel_csv')
    ) then return false; end if;
    if exists (
      select 1 from jsonb_array_elements(formats) f
      group by f having count(*) > 1
    ) then return false; end if;
    -- Integer casts are safe only after the dedicated numeric guards above.
    if (item->>'maximumQuantity')::integer < (item->>'minimumQuantity')::integer
       or (item->>'required' = 'true' and (item->>'minimumQuantity')::integer < 1)
       then return false; end if;
    if item->>'kind' = 'attachment' then
      if jsonb_array_length(formats) < 1
         or not (item ? 'maximumFileSizeMb')
         then return false; end if;
      if not private.template_copilot_v2_integer_between(item->'maximumFileSizeMb',1,25)
         then return false; end if;
    end if;
    if item->>'kind' = 'form'
       and (jsonb_array_length(formats) <> 0 or item ? 'maximumFileSizeMb')
       then return false; end if;
    if item->>'stage' = 'request_submission'
       and item->>'confirmationPolicy' = 'stage_owner_confirms'
       then return false; end if;
  end loop;
  return not exists (
    select 1 from (
      select value->>'id' id, count(*) count
      from jsonb_array_elements(p_value)
      group by value->>'id'
    ) duplicates where duplicates.count > 1
  );
end;
$$;

create function private.template_copilot_v2_step7_condition_value_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; route_key text; route_value jsonb; route text; value_type text;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value) not between 1 and 50 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if not private.template_copilot_v2_exact_object_keys(
        item,
        array['id','sequence','field','operator','value','matchingRoute','otherwiseRoute'],
        array['currency','unit']
      )
      or not private.template_copilot_v2_bounded_string(item->'id',2,80)
      or (item->>'id') !~ '^[a-z][a-z0-9_-]+$'
      or not private.template_copilot_v2_integer_between(item->'sequence',1,50)
      or not private.template_copilot_v2_bounded_string(item->'field',1,200)
      or not private.template_copilot_v2_bounded_string(item->'operator',1,8)
      or item->>'operator' not in ('=','!=','>','>=','<','<=','contains')
      or (item ? 'currency' and item ? 'unit')
      or item->>'matchingRoute' = item->>'otherwiseRoute' then return false; end if;
    value_type := jsonb_typeof(item->'value');
    if value_type is null or value_type not in ('string','number') then return false; end if;
    if value_type = 'string'
       and not private.template_copilot_v2_bounded_string(item->'value',1,8000)
       then return false; end if;
    if item ? 'currency' then
      if not private.template_copilot_v2_bounded_string(item->'currency',3,3)
         or (item->>'currency') !~ '^[A-Z]{3}$'
         then return false; end if;
    end if;
    if item ? 'unit'
       and not private.template_copilot_v2_bounded_string(item->'unit',1,200)
       then return false; end if;
    if item->>'operator' in ('>','>=','<','<=')
       and value_type <> 'number' then return false; end if;
    if item->>'operator' = 'contains'
       and value_type <> 'string' then return false; end if;
    foreach route_key in array array['matchingRoute','otherwiseRoute'] loop
      route_value := item->route_key;
      if not private.template_copilot_v2_bounded_string(route_value,1,210)
         then return false; end if;
      route := route_value #>> '{}';
      if route not in ('complete','return_for_correction')
         and route !~ '^stage:.{1,200}$'
         and route !~ '^condition:[a-z][a-z0-9_-]+$' then return false; end if;
    end loop;
  end loop;
  return not exists (
    select 1 from (
      select value->>'id' id, count(*) count
      from jsonb_array_elements(p_value)
      group by value->>'id'
      union all
      select value->>'sequence' id, count(*) count
      from jsonb_array_elements(p_value)
      group by value->>'sequence'
    ) duplicates where duplicates.count > 1
  );
end;
$$;

create function private.template_copilot_v2_step7_notification_value_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; timing jsonb; recipients jsonb; recipient jsonb; stage_required boolean;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    timing := item->'timing';
    recipients := item->'recipients';
    if not private.template_copilot_v2_exact_object_keys(
        item,
        array['id','event','recipients','timing','channel','visibility'],
        array['stage']
      )
      or not private.template_copilot_v2_bounded_string(item->'id',2,80)
      or (item->>'id') !~ '^[a-z][a-z0-9_-]+$'
      or not private.template_copilot_v2_bounded_string(item->'event',1,40)
      or item->>'event' not in (
        'request_submitted','stage_assigned','stage_completed','request_rejected',
        'correction_requested','request_completed','due_soon','overdue'
      )
      or not private.template_copilot_v2_bounded_string(item->'channel',1,40)
      or item->>'channel' not in ('default','in_app','email','in_app_and_email')
      or not private.template_copilot_v2_bounded_string(item->'visibility',1,40)
      or item->>'visibility' not in ('recipients_only','all_participants')
      then return false; end if;
    if jsonb_typeof(recipients) is distinct from 'array' then return false; end if;
    if jsonb_array_length(recipients) not between 1 and 5 then return false; end if;
    for recipient in select value from jsonb_array_elements(recipients) loop
      if jsonb_typeof(recipient) is distinct from 'string'
         or (recipient #>> '{}') not in (
           'requester','current_stage_participants','previous_stage_participants',
           'all_participants','workflow_owner'
         ) then return false; end if;
    end loop;
    if exists (
      select 1 from jsonb_array_elements(recipients) value
      group by value having count(*) > 1
    ) then return false; end if;
    if jsonb_typeof(timing) is distinct from 'object' then return false; end if;
    if not private.template_copilot_v2_exact_object_keys(timing,array['mode'],array['offsetHours'])
       or not private.template_copilot_v2_bounded_string(timing->'mode',1,20)
       or timing->>'mode' not in ('immediate','before_due','after_due')
       then return false; end if;
    if timing->>'mode' = 'immediate' and timing ? 'offsetHours'
       then return false; end if;
    if timing->>'mode' <> 'immediate' then
      if not (timing ? 'offsetHours') then return false; end if;
      if not private.template_copilot_v2_integer_between(timing->'offsetHours',1,8760)
         then return false; end if;
    end if;
    if item->>'event' = 'due_soon' and timing->>'mode' <> 'before_due'
       then return false; end if;
    if item->>'event' = 'overdue' and timing->>'mode' <> 'after_due'
       then return false; end if;
    if item->>'event' not in ('due_soon','overdue')
       and timing->>'mode' <> 'immediate' then return false; end if;
    if item ? 'stage' then
      if not private.template_copilot_v2_bounded_string(item->'stage',7,206)
         or (item->>'stage') !~ '^stage:.{1,200}$'
         then return false; end if;
    end if;
    stage_required := item->>'event' in ('stage_assigned','stage_completed','due_soon','overdue')
      or recipients ? 'current_stage_participants'
      or recipients ? 'previous_stage_participants';
    if stage_required and not (item ? 'stage') then return false; end if;
  end loop;
  return not exists (
    select 1 from (
      select value->>'id' id, count(*) count
      from jsonb_array_elements(p_value)
      group by value->>'id'
    ) duplicates where duplicates.count > 1
  );
end;
$$;

create function private.template_copilot_v2_step7_legacy_shape_safe(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; format jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if p_fact_id = 'attachments.requirements' then
    if jsonb_array_length(p_value) > 50 then return false; end if;
  elsif p_fact_id = 'workflow.conditions' then
    if jsonb_array_length(p_value) > 50 then return false; end if;
  elsif p_fact_id = 'notifications.rules' then
    if jsonb_array_length(p_value) > 100 then return false; end if;
  else
    return false;
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    -- The renamed Step 5 attachment validator expands formats in one Boolean
    -- expression. Prove that expansion safe before calling it.
    if p_fact_id = 'attachments.requirements' and item ? 'formats' then
      if jsonb_typeof(item->'formats') is distinct from 'array' then return false; end if;
      for format in select value from jsonb_array_elements(item->'formats') loop
        if jsonb_typeof(format) is distinct from 'string' then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

create function private.template_copilot_v2_fact_value_valid(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if not private.template_copilot_v2_bounded_json(p_value) then return false; end if;
  if p_fact_id = 'attachments.requirements' then
    if private.template_copilot_v2_step7_attachment_value_valid(p_value) then return true; end if;
    if not private.template_copilot_v2_step7_legacy_shape_safe(p_fact_id,p_value) then return false; end if;
    return private.template_copilot_v2_step5_fact_value_valid(p_fact_id,p_value);
  elsif p_fact_id = 'workflow.conditions' then
    if private.template_copilot_v2_step7_condition_value_valid(p_value) then return true; end if;
    if not private.template_copilot_v2_step7_legacy_shape_safe(p_fact_id,p_value) then return false; end if;
    return private.template_copilot_v2_step5_fact_value_valid(p_fact_id,p_value);
  elsif p_fact_id = 'notifications.rules' then
    if private.template_copilot_v2_step7_notification_value_valid(p_value) then return true; end if;
    if not private.template_copilot_v2_step7_legacy_shape_safe(p_fact_id,p_value) then return false; end if;
    return private.template_copilot_v2_step5_fact_value_valid(p_fact_id,p_value);
  end if;
  return private.template_copilot_v2_step5_fact_value_valid(p_fact_id,p_value);
end;
$$;

comment on function private.template_copilot_v2_fact_value_valid(text,jsonb)
  is 'Accepts legacy Step 5 values or strict Step 7 attachment, condition, and notification structures.';

revoke all on function private.template_copilot_v2_step7_attachment_value_valid(jsonb)
  from public, anon, authenticated;
revoke all on function private.template_copilot_v2_step7_condition_value_valid(jsonb)
  from public, anon, authenticated;
revoke all on function private.template_copilot_v2_step7_notification_value_valid(jsonb)
  from public, anon, authenticated;
revoke all on function private.template_copilot_v2_step7_legacy_shape_safe(text,jsonb)
  from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_value_valid(text,jsonb)
  from public, anon, authenticated;
revoke all on function private.template_copilot_v2_bounded_json(jsonb)
  from public, anon, authenticated;
