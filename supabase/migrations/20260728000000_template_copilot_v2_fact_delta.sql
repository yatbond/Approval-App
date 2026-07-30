-- Step 5 fact-map edits are database-derived.  The service may submit only a
-- fact id, operation, typed value/reason, revision, and idempotency material;
-- it can never submit a replacement fact, history, dependency delta, sidecar,
-- readiness, confirmation, provenance, or ledger projection.

create or replace function private.template_copilot_v2_fact_ids()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'workflow.name','workflow.purpose','workflow.scope','request.initiator_policy',
    'request.fields','attachments.requirements','workflow.stages','workflow.conditions',
    'workflow.rejection_policy','collaboration.policy','timing.rules','visibility.policy',
    'notifications.rules','governance.owner','governance.policies','governance.retention'
  ]::text[];
$$;

-- This is the single persisted graph definition for the mutation path.  It is
-- intentionally not reconstructed from caller data or existing fact metadata.
create or replace function private.template_copilot_v2_fact_definition(p_fact_id text)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_fact_id
    when 'workflow.name' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn','[]'::jsonb)
    when 'workflow.purpose' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn','[]'::jsonb)
    when 'workflow.scope' then jsonb_build_object('appliesWhen','always','blockingLevel','publication','dependsOn',jsonb_build_array('workflow.purpose'))
    when 'request.initiator_policy' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn','[]'::jsonb)
    when 'request.fields' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn',jsonb_build_array('request.initiator_policy'))
    when 'attachments.requirements' then jsonb_build_object('appliesWhen','has_attachments','blockingLevel','publication','dependsOn',jsonb_build_array('request.fields'))
    when 'workflow.stages' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn',jsonb_build_array('request.initiator_policy'))
    when 'workflow.conditions' then jsonb_build_object('appliesWhen','conditional_workflow','blockingLevel','publication','dependsOn',jsonb_build_array('workflow.stages','request.fields'))
    when 'workflow.rejection_policy' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn',jsonb_build_array('workflow.stages'))
    when 'collaboration.policy' then jsonb_build_object('appliesWhen','always','blockingLevel','publication','dependsOn',jsonb_build_array('workflow.stages'))
    when 'timing.rules' then jsonb_build_object('appliesWhen','always','blockingLevel','publication','dependsOn',jsonb_build_array('workflow.stages'))
    when 'visibility.policy' then jsonb_build_object('appliesWhen','always','blockingLevel','draft','dependsOn',jsonb_build_array('workflow.stages'))
    when 'notifications.rules' then jsonb_build_object('appliesWhen','has_notifications','blockingLevel','publication','dependsOn',jsonb_build_array('visibility.policy'))
    when 'governance.owner' then jsonb_build_object('appliesWhen','governance_required','blockingLevel','publication','dependsOn','[]'::jsonb)
    when 'governance.policies' then jsonb_build_object('appliesWhen','governance_required','blockingLevel','publication','dependsOn','[]'::jsonb)
    when 'governance.retention' then jsonb_build_object('appliesWhen','governance_required','blockingLevel','publication','dependsOn','[]'::jsonb)
    else null
  end;
$$;

create or replace function private.template_copilot_v2_fact_dependents(p_fact_id text)
returns text[] language plpgsql immutable set search_path = '' as $$
declare result text[] := array[]::text[]; changed boolean := true; candidate text; definition jsonb;
begin
  while changed loop
    changed := false;
    foreach candidate in array private.template_copilot_v2_fact_ids() loop
      definition := private.template_copilot_v2_fact_definition(candidate);
      if not candidate = any(result)
         and exists (select 1 from jsonb_array_elements_text(definition->'dependsOn') dependency where dependency = p_fact_id or dependency = any(result)) then
        result := array_append(result,candidate); changed := true;
      end if;
    end loop;
  end loop;
  return array(select candidate from unnest(private.template_copilot_v2_fact_ids()) candidate where candidate = any(result));
end;
$$;

-- One executable matrix governs both the public RPC and the parity test.  The
-- tagged JSON is deliberately machine-readable so every domain state/action
-- pair is checked without maintaining a second SQL expectation by hand.
create or replace function private.template_copilot_v2_fact_transition_allowed(
  p_operation text, p_current_status text, p_applies_when text
) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  transition_matrix constant jsonb := $v2_fact_transition_matrix$
{
  "record_candidate": ["unresolved", "candidate", "unknown"],
  "human_commit": ["unresolved", "candidate", "unknown"],
  "human_replace": ["unresolved", "candidate", "unknown", "committed", "not_applicable"],
  "resolve_conflict": ["conflicting"],
  "mark_unknown": ["unresolved", "candidate", "unknown", "committed", "not_applicable"],
  "mark_not_applicable": ["unresolved", "candidate", "unknown", "committed", "not_applicable"]
}
$v2_fact_transition_matrix$::jsonb;
begin
  return coalesce((transition_matrix->p_operation) ? p_current_status,false)
    and (p_operation <> 'mark_not_applicable' or p_applies_when <> 'always');
end;
$$;

create or replace function private.template_copilot_v2_utf16_length(p_value text)
returns integer language plpgsql immutable set search_path = '' as $$
declare result integer := 0; position integer;
begin
  if p_value is null then return null; end if;
  if octet_length(p_value) > 32000 then return 2147483647; end if;
  for position in 1..length(p_value) loop
    result := result + case when octet_length(substr(p_value,position,1)) = 4 then 2 else 1 end;
  end loop;
  return result;
end;
$$;

create or replace function private.template_copilot_v2_ecmascript_trim(p_value text)
returns text language sql immutable set search_path = '' as $$
  select btrim(p_value,
    chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||
    chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||
    chr(8287)||chr(12288)||chr(65279)
  );
$$;

create or replace function private.template_copilot_v2_bounded_string(p_value jsonb, p_min integer, p_max integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') = private.template_copilot_v2_ecmascript_trim(p_value #>> '{}')
    and private.template_copilot_v2_utf16_length(p_value #>> '{}') between p_min and p_max,false);
$$;

create or replace function private.template_copilot_v2_integer_between(p_value jsonb, p_min integer, p_max integer)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) is distinct from 'number' then false else
    (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    and (p_value #>> '{}')::numeric between p_min and p_max end;
$$;

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
  select count(*) <= 200
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

create or replace function private.template_copilot_v2_exact_object_keys(p_value jsonb, p_required text[], p_optional text[] default array[]::text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) is distinct from 'object' then false else
    not exists (select 1 from unnest(p_required) key where not (p_value ? key))
    and not exists (select 1 from jsonb_object_keys(p_value) key where not key = any(p_required || p_optional)) end;
$$;

create or replace function private.template_copilot_v2_string_array(p_value jsonb, p_min integer, p_max integer)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) is distinct from 'array' then false else
    jsonb_array_length(p_value) between p_min and p_max
    and not exists (select 1 from jsonb_array_elements(p_value) item where not private.template_copilot_v2_bounded_string(item,1,8000)) end;
$$;

create or replace function private.template_copilot_v2_bounded_id_array(p_value jsonb, p_min integer, p_max integer)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) is distinct from 'array' then false else
    jsonb_array_length(p_value) between p_min and p_max
    and not exists (select 1 from jsonb_array_elements(p_value) item where not private.template_copilot_v2_bounded_string(item,1,128)) end;
$$;

create or replace function private.template_copilot_v2_policy_value_valid(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select private.template_copilot_v2_exact_object_keys(p_value,array['description'],array['rules'])
    and private.template_copilot_v2_bounded_string(p_value->'description',1,8000)
    and (not (p_value ? 'rules') or private.template_copilot_v2_string_array(p_value->'rules',0,50));
$$;

-- Independent typed-value validation mirrors the executable fact schemas. It
-- is deliberately strict enough that a compromised application cannot turn a
-- map edit into arbitrary ledger JSON.  Keep it here, adjacent to the graph.
create or replace function private.template_copilot_v2_fact_value_valid(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb; participant jsonb; formats jsonb; recipients jsonb;
begin
  if not private.template_copilot_v2_bounded_json(p_value) then return false; end if;
  if p_fact_id in ('workflow.name','governance.owner') then
    return private.template_copilot_v2_bounded_string(p_value,1,200);
  elsif p_fact_id = 'workflow.purpose' then
    return private.template_copilot_v2_bounded_string(p_value,1,8000);
  elsif p_fact_id in ('workflow.scope','collaboration.policy','visibility.policy') then
    return private.template_copilot_v2_policy_value_valid(p_value);
  elsif p_fact_id = 'request.initiator_policy' then
    return private.template_copilot_v2_exact_object_keys(p_value,array['mode','description'])
      and p_value->>'mode' in ('any_employee','directory_role','requester_selected')
      and private.template_copilot_v2_bounded_string(p_value->'description',1,8000);
  elsif p_fact_id = 'request.fields' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if not private.template_copilot_v2_exact_object_keys(item,array['label','type','required'],array['options'])
         or not private.template_copilot_v2_bounded_string(item->'label',1,200)
         or item->>'type' not in ('text','long_text','number','date','currency','email','select','radio','checkbox','table')
         or jsonb_typeof(item->'required') <> 'boolean'
         or (item ? 'options' and not private.template_copilot_v2_string_array(item->'options',0,100)) then return false; end if;
    end loop; return true;
  elsif p_fact_id = 'attachments.requirements' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 50 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      formats := item->'formats';
      if not private.template_copilot_v2_exact_object_keys(item,array['label','required'],array['formats','stage'])
         or not private.template_copilot_v2_bounded_string(item->'label',1,200) or jsonb_typeof(item->'required') <> 'boolean'
         or (item ? 'stage' and not private.template_copilot_v2_bounded_string(item->'stage',1,200))
         or (item ? 'formats' and (jsonb_typeof(formats) <> 'array' or jsonb_array_length(formats) > 4 or exists (select 1 from jsonb_array_elements_text(formats) f where f not in ('text','pdf','image','excel_csv')))) then return false; end if;
    end loop; return true;
  elsif p_fact_id = 'workflow.stages' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      participant := item->'participant';
      if not private.template_copilot_v2_exact_object_keys(item,array['label','kind','participant','sequence'])
         or not private.template_copilot_v2_bounded_string(item->'label',1,200)
         or item->>'kind' not in ('approval','review','for_information','submission')
         or not private.template_copilot_v2_exact_object_keys(participant,array['mode'],array['value'])
         or participant->>'mode' not in ('fixed_email','directory_position','request_field','requester','unassigned_at_template')
         or (participant->>'mode' in ('fixed_email','directory_position','request_field')
           and (not (participant ? 'value') or not private.template_copilot_v2_bounded_string(participant->'value',1,200)))
         or (participant->>'mode' in ('requester','unassigned_at_template') and participant ? 'value')
         or (participant->>'mode' = 'fixed_email' and (
           participant->>'value' like '.%' or participant->>'value' like '%.@%'
           or position('..' in participant->>'value') > 0
           or participant->>'value' !~ '^[A-Za-z0-9_+''.-]+@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'
         ))
         or not private.template_copilot_v2_integer_between(item->'sequence',1,100) then return false; end if;
    end loop; return true;
  elsif p_fact_id = 'workflow.conditions' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 50 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      if not private.template_copilot_v2_exact_object_keys(item,array['field','operator','value','matchingRoute','otherwiseRoute'])
         or not private.template_copilot_v2_bounded_string(item->'field',1,200)
         or item->>'operator' not in ('=','!=','>','>=','<','<=','contains')
         or jsonb_typeof(item->'value') not in ('string','number')
         or (jsonb_typeof(item->'value') = 'string' and not private.template_copilot_v2_bounded_string(item->'value',1,8000))
         or not private.template_copilot_v2_bounded_string(item->'matchingRoute',1,200)
         or not private.template_copilot_v2_bounded_string(item->'otherwiseRoute',1,200) then return false; end if;
    end loop; return true;
  elsif p_fact_id = 'workflow.rejection_policy' then
    return private.template_copilot_v2_exact_object_keys(p_value,array['action'],array['route'])
      and p_value->>'action' in ('return_for_correction','close','route_to_stage')
      and (
        (p_value->>'action' = 'route_to_stage' and p_value ? 'route' and private.template_copilot_v2_bounded_string(p_value->'route',1,200))
        or (p_value->>'action' <> 'route_to_stage' and not (p_value ? 'route'))
      );
  elsif p_fact_id = 'timing.rules' then
    return private.template_copilot_v2_exact_object_keys(p_value,array[]::text[],array['defaultDueHours','escalation'])
      and (not (p_value ? 'defaultDueHours') or private.template_copilot_v2_integer_between(p_value->'defaultDueHours',1,8760))
      and (not (p_value ? 'escalation') or private.template_copilot_v2_policy_value_valid(p_value->'escalation'));
  elsif p_fact_id = 'notifications.rules' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 100 then return false; end if;
    for item in select value from jsonb_array_elements(p_value) loop
      recipients := item->'recipients';
      if not private.template_copilot_v2_exact_object_keys(item,array['event','recipients','channel'])
         or not private.template_copilot_v2_bounded_string(item->'event',1,200)
         or not private.template_copilot_v2_string_array(recipients,1,50)
         or item->>'channel' not in ('in_app','email') then return false; end if;
    end loop; return true;
  elsif p_fact_id = 'governance.policies' then
    return private.template_copilot_v2_string_array(p_value,0,50);
  elsif p_fact_id = 'governance.retention' then
    return private.template_copilot_v2_exact_object_keys(p_value,array['period'],array['rationale'])
      and private.template_copilot_v2_bounded_string(p_value->'period',1,200)
      and (not (p_value ? 'rationale') or private.template_copilot_v2_bounded_string(p_value->'rationale',1,8000));
  end if;
  return false;
end;
$$;

create or replace function private.template_copilot_v2_rfc3339_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare parsed timestamptz;
begin
  if not private.template_copilot_v2_bounded_string(p_value,20,40)
     or (p_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return false;
  end if;
  begin
    parsed := (p_value #>> '{}')::timestamptz;
  exception when others then
    return false;
  end;
  return parsed is not null;
end;
$$;

create or replace function private.template_copilot_v2_provenance_valid(p_value jsonb, p_min integer, p_max integer)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or jsonb_array_length(p_value) not between p_min and p_max then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if not private.template_copilot_v2_exact_object_keys(item,array['kind','sourceId'],array['sourceMessageIds','excerpt','sha256'])
       or coalesce(item->>'kind' not in ('message','document','legacy_section','human_editor'),true)
       or not private.template_copilot_v2_bounded_string(item->'sourceId',1,128)
       or (item ? 'sourceMessageIds' and not private.template_copilot_v2_bounded_id_array(item->'sourceMessageIds',0,24))
       or (item ? 'excerpt' and not private.template_copilot_v2_bounded_string(item->'excerpt',0,1000))
       or (item->>'kind' = 'document' and not (item ? 'sha256'))
       or (item ? 'sha256' and coalesce(item->>'sha256' !~ '^[0-9a-f]{64}$',true)) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_confirmation_valid(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case when not private.template_copilot_v2_exact_object_keys(p_value,array['actorId','confirmedAt','operation']) then false else
    coalesce(p_value->>'actorId' ~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false)
    and private.template_copilot_v2_rfc3339_valid(p_value->'confirmedAt')
    and p_value->>'operation' in ('human_confirm','human_replace','human_resolve_conflict','human_mark_not_applicable') end,false);
$$;

create or replace function private.template_copilot_v2_conflict_values_valid(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or jsonb_array_length(p_value) not between 2 and 4 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if not private.template_copilot_v2_fact_value_valid(p_fact_id,item) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_conflict_evidence_valid(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or jsonb_array_length(p_value) not between 2 and 4 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if not private.template_copilot_v2_exact_object_keys(item,array['canonicalValue','provenance'])
       or not private.template_copilot_v2_fact_value_valid(p_fact_id,item->'canonicalValue')
       or not private.template_copilot_v2_provenance_valid(item->'provenance',1,12) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_stale_history_valid(p_fact_id text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  rules jsonb;
  status text;
  required_key text;
  forbidden_key text;
  evidence_index integer;
  stale_state_matrix constant jsonb := $v2_stale_state_matrix$
{
  "candidate": {
    "required": ["canonicalValue"],
    "forbidden": ["confirmation", "notApplicableReason", "conflictValues", "conflictEvidence"],
    "minProvenance": 1,
    "maxProvenance": 12,
    "confirmationOperations": []
  },
  "committed": {
    "required": ["canonicalValue", "confirmation"],
    "forbidden": ["notApplicableReason", "conflictValues", "conflictEvidence"],
    "minProvenance": 1,
    "maxProvenance": 12,
    "confirmationOperations": ["human_confirm", "human_replace", "human_resolve_conflict"]
  },
  "unknown": {
    "required": [],
    "forbidden": ["canonicalValue", "confirmation", "notApplicableReason", "conflictValues", "conflictEvidence"],
    "minProvenance": 0,
    "maxProvenance": 0,
    "confirmationOperations": []
  },
  "not_applicable": {
    "required": ["confirmation", "notApplicableReason"],
    "forbidden": ["canonicalValue", "conflictValues", "conflictEvidence"],
    "minProvenance": 0,
    "maxProvenance": 0,
    "confirmationOperations": ["human_mark_not_applicable"]
  },
  "conflicting": {
    "required": ["canonicalValue", "conflictValues", "conflictEvidence"],
    "forbidden": ["confirmation", "notApplicableReason"],
    "minProvenance": 1,
    "maxProvenance": 12,
    "confirmationOperations": []
  }
}
$v2_stale_state_matrix$::jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value) > 12 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if not private.template_copilot_v2_exact_object_keys(
         item,array['invalidatedBy','invalidatedAt','status','provenance'],
         array['canonicalValue','originalWording','confirmation','notApplicableReason','conflictValues','conflictEvidence']
       )
       or coalesce(not (item->>'invalidatedBy' = any(private.template_copilot_v2_fact_ids())),true)
       or not private.template_copilot_v2_rfc3339_valid(item->'invalidatedAt') then return false; end if;

    status := item->>'status';
    rules := stale_state_matrix->status;
    if rules is null then return false; end if;

    for required_key in select value from jsonb_array_elements_text(rules->'required') loop
      if not (item ? required_key) then return false; end if;
    end loop;
    for forbidden_key in select value from jsonb_array_elements_text(rules->'forbidden') loop
      if item ? forbidden_key then return false; end if;
    end loop;

    if not private.template_copilot_v2_provenance_valid(
         item->'provenance',
         (rules->>'minProvenance')::integer,
         (rules->>'maxProvenance')::integer
       )
       or (item ? 'canonicalValue' and not private.template_copilot_v2_fact_value_valid(p_fact_id,item->'canonicalValue'))
       or (item ? 'originalWording' and not private.template_copilot_v2_bounded_string(item->'originalWording',1,8000))
       or (item ? 'confirmation' and (
         not private.template_copilot_v2_confirmation_valid(item->'confirmation')
         or not exists (
           select 1 from jsonb_array_elements_text(rules->'confirmationOperations') operation
           where operation = item->'confirmation'->>'operation'
         )
       ))
       or (item ? 'notApplicableReason' and not private.template_copilot_v2_bounded_string(item->'notApplicableReason',1,1000))
       or (item ? 'conflictValues' and not private.template_copilot_v2_conflict_values_valid(p_fact_id,item->'conflictValues'))
       or (item ? 'conflictEvidence' and not private.template_copilot_v2_conflict_evidence_valid(p_fact_id,item->'conflictEvidence'))
       or (status = 'not_applicable' and private.template_copilot_v2_fact_definition(p_fact_id)->>'appliesWhen' = 'always') then return false; end if;

    if status = 'conflicting' then
      if jsonb_array_length(item->'conflictValues') <> jsonb_array_length(item->'conflictEvidence')
         or item->'canonicalValue' is distinct from item->'conflictValues'->0 then return false; end if;
      for evidence_index in 0..jsonb_array_length(item->'conflictValues')-1 loop
        if item->'conflictValues'->evidence_index
           is distinct from item->'conflictEvidence'->evidence_index->'canonicalValue' then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_fact_metadata_valid(p_entry jsonb, p_fact_id text, p_library_version text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_entry) is distinct from 'object'
     or p_entry->>'questionLibraryVersion' is distinct from p_library_version
     or p_entry->>'applicabilityCode' is distinct from private.template_copilot_v2_fact_definition(p_fact_id)->>'appliesWhen'
     or p_entry->>'blockingLevel' is distinct from private.template_copilot_v2_fact_definition(p_fact_id)->>'blockingLevel'
     or p_entry->'dependsOn' is distinct from private.template_copilot_v2_fact_definition(p_fact_id)->'dependsOn' then return false; end if;
  if p_entry ? 'staleHistory' and (jsonb_typeof(p_entry->'staleHistory') is distinct from 'array' or jsonb_array_length(p_entry->'staleHistory') > 12) then return false; end if;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_fact_entry_valid(p_entry jsonb, p_fact_id text, p_library_version text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare status text;
begin
  if not private.template_copilot_v2_exact_object_keys(
       p_entry,array['status','provenance','questionLibraryVersion','applicabilityCode','blockingLevel','dependsOn','staleHistory'],
       array['canonicalValue','originalWording','locale','confirmation','notApplicableReason','conflictValues','conflictEvidence']
     )
     or not private.template_copilot_v2_fact_metadata_valid(p_entry,p_fact_id,p_library_version) then return false; end if;
  status := p_entry->>'status';
  if coalesce(status not in ('candidate','committed','unknown','not_applicable','unresolved','conflicting'),true)
     or not private.template_copilot_v2_provenance_valid(p_entry->'provenance',0,12)
     or not private.template_copilot_v2_stale_history_valid(p_fact_id,p_entry->'staleHistory')
     or (p_entry ? 'originalWording' and not private.template_copilot_v2_bounded_string(p_entry->'originalWording',1,8000))
     or (p_entry ? 'locale' and coalesce(p_entry->>'locale' not in ('en','zh-Hant','zh-Hans'),true))
     or (status in ('candidate','committed','conflicting') and (
       not (p_entry ? 'canonicalValue')
       or not private.template_copilot_v2_fact_value_valid(p_fact_id,p_entry->'canonicalValue')
       or jsonb_array_length(p_entry->'provenance') = 0
     ))
     or (status not in ('candidate','committed','conflicting') and p_entry ? 'canonicalValue')
     or (status in ('committed','not_applicable') and (
       not (p_entry ? 'confirmation')
       or not private.template_copilot_v2_confirmation_valid(p_entry->'confirmation')
     ))
     or (status not in ('committed','not_applicable') and p_entry ? 'confirmation')
     or (status = 'not_applicable' and (
       private.template_copilot_v2_fact_definition(p_fact_id)->>'appliesWhen' = 'always'
       or not (p_entry ? 'notApplicableReason')
       or not private.template_copilot_v2_bounded_string(p_entry->'notApplicableReason',1,1000)
     ))
     or (status <> 'not_applicable' and p_entry ? 'notApplicableReason')
     or (status = 'conflicting' and (
       not (p_entry ? 'conflictValues') or not (p_entry ? 'conflictEvidence')
       or not private.template_copilot_v2_conflict_values_valid(p_fact_id,p_entry->'conflictValues')
       or not private.template_copilot_v2_conflict_evidence_valid(p_fact_id,p_entry->'conflictEvidence')
     ))
     or (status <> 'conflicting' and (p_entry ? 'conflictValues' or p_entry ? 'conflictEvidence')) then return false; end if;
  return true;
end;
$$;

create or replace function private.template_copilot_v2_fact_base(p_fact_id text, p_library_version text, p_stale_history jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('status','unresolved','provenance','[]'::jsonb,'staleHistory',coalesce(p_stale_history,'[]'::jsonb),
    'questionLibraryVersion',p_library_version,
    'applicabilityCode',private.template_copilot_v2_fact_definition(p_fact_id)->>'appliesWhen',
    'blockingLevel',private.template_copilot_v2_fact_definition(p_fact_id)->>'blockingLevel',
    'dependsOn',private.template_copilot_v2_fact_definition(p_fact_id)->'dependsOn');
$$;

create or replace function private.template_copilot_v2_fact_source_id(p_idempotency_key text)
returns text language sql immutable set search_path = '' as $$
  select 'fact:' || case when length(p_idempotency_key) <= 123
    then p_idempotency_key else md5(p_idempotency_key) end;
$$;

create or replace function private.template_copilot_v2_stale_snapshot(p_current jsonb, p_invalidated_by text, p_at text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('invalidatedBy',p_invalidated_by,'invalidatedAt',p_at,
    'status',p_current->'status','canonicalValue',p_current->'canonicalValue','originalWording',p_current->'originalWording',
    'provenance',p_current->'provenance','confirmation',p_current->'confirmation','notApplicableReason',p_current->'notApplicableReason',
    'conflictValues',p_current->'conflictValues','conflictEvidence',p_current->'conflictEvidence'));
$$;

create or replace function private.template_copilot_v2_append_stale(p_current jsonb, p_invalidated_by text, p_at text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare combined jsonb; result jsonb;
begin
  if p_current->>'status' = 'unresolved' then return coalesce(p_current->'staleHistory','[]'::jsonb); end if;
  combined := coalesce(p_current->'staleHistory','[]'::jsonb) || jsonb_build_array(private.template_copilot_v2_stale_snapshot(p_current,p_invalidated_by,p_at));
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into result
    from jsonb_array_elements(combined) with ordinality item(value,ordinality)
    where ordinality > greatest(jsonb_array_length(combined)-12,0);
  return result;
end;
$$;

-- Every owned invocation emits exactly one terminal attempt row. Hostile keys,
-- hashes, operations, and fact ids are normalized before insertion, and detail
-- never contains canonical values, reasons, evidence, sidecars, or ledger data.
create or replace function private.audit_template_copilot_v2_fact_attempt(
  p_session_id uuid, p_owner_id uuid, p_idempotency_key text, p_command_hash text,
  p_operation text, p_fact_id text, p_before_revision bigint,
  p_after_revision bigint, p_outcome text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  safe_idempotency_key text;
  safe_command_hash text;
  safe_operation text;
  safe_fact_id text;
  safe_outcome text;
begin
  safe_idempotency_key := case
    when coalesce(p_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', false)
      then p_idempotency_key
    else 'reject:' || md5(coalesce(p_idempotency_key, '<null>'))
  end;
  safe_command_hash := case
    when coalesce(p_command_hash ~ '^[0-9a-f]{64}$', false)
      then p_command_hash
    else
      md5('fact-command-1:' || coalesce(p_command_hash, '<null>')) ||
      md5('fact-command-2:' || coalesce(p_command_hash, '<null>'))
  end;
  safe_operation := case
    when p_operation = any(array['record_candidate','human_commit','human_replace','mark_unknown','mark_not_applicable','resolve_conflict'])
      then p_operation
    else 'human_replace'
  end;
  safe_fact_id := case
    when p_fact_id = any(private.template_copilot_v2_fact_ids()) then p_fact_id
    else null
  end;
  safe_outcome := case
    when p_outcome = any(array['applied','invalid_command','idempotency_conflict','stale_revision','invalid_transition','replayed_exact'])
      then p_outcome
    else 'invalid_transition'
  end;
  insert into public.template_copilot_v2_audit_events(
    session_id,owner_id,idempotency_key,command_hash,operation,fact_id,
    before_revision,after_revision,outcome,detail
  ) values (
    p_session_id,p_owner_id,safe_idempotency_key,safe_command_hash,safe_operation,safe_fact_id,
    p_before_revision,p_after_revision,safe_outcome,
    jsonb_build_object('schemaVersion',2,'attempt',safe_outcome)
  );
end;
$$;

alter table public.template_copilot_v2_audit_events
  drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events
  add constraint template_copilot_v2_audit_events_operation_check
  check (operation in ('create_session','record_candidate','human_commit','human_replace','mark_unknown','mark_not_applicable','resolve_conflict','legacy_upgrade','atomic_answer','special_decision','candidate_extraction','candidate_confirmation','resolve_extraction_conflict'));

create or replace function public.mutate_template_copilot_v2_fact_delta(
  p_actor_id uuid, p_session_id uuid, p_expected_revision bigint,
  p_idempotency_key text, p_command_hash text, p_operation text, p_fact_id text,
  p_canonical_value jsonb, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.template_copilot_sessions%rowtype;
  r public.template_copilot_v2_operation_receipts%rowtype;
  before_revision bigint; response jsonb; fact_id text; dependent_id text;
  old_entry jsonb; new_entry jsonb; next_ledger jsonb; old_history jsonb;
  timestamp_text text; library_version text; definition jsonb; candidate jsonb; conflict jsonb;
  open_sidecar_count integer;
  owner_verified boolean := false;
  fact_changed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into s from public.template_copilot_sessions where id = p_session_id for update;
  -- Owner first prevents an Admin/service caller from probing another owner's receipts.
  if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;
  owner_verified := true;

  if coalesce(p_expected_revision < 1,true)
     or coalesce(p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$',true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$',true)
     or coalesce(p_operation not in ('record_candidate','human_commit','human_replace','mark_unknown','mark_not_applicable','resolve_conflict'),true)
     or not p_fact_id = any(private.template_copilot_v2_fact_ids())
     or (p_operation in ('record_candidate','human_commit','human_replace','resolve_conflict') and p_canonical_value is null)
     or (p_operation in ('mark_unknown','mark_not_applicable') and p_canonical_value is not null)
     or (p_operation = 'mark_not_applicable' and coalesce(not private.template_copilot_v2_bounded_string(to_jsonb(p_reason),1,1000),true))
     or (p_operation <> 'mark_not_applicable' and p_reason is not null) then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_command');
    return jsonb_build_object('outcome','invalid_command');
  end if;

  select * into r from public.template_copilot_v2_operation_receipts where session_id=s.id and idempotency_key=p_idempotency_key;
  if found then
    if r.command_hash is distinct from p_command_hash then
      perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'idempotency_conflict');
      return jsonb_build_object('outcome','idempotency_conflict');
    end if;
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'replayed_exact');
    return r.response || jsonb_build_object('outcome','replayed','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  end if;
  if s.revision is distinct from p_expected_revision then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'stale_revision');
    return jsonb_build_object('outcome','stale_revision','currentRevision',s.revision);
  end if;

  if jsonb_typeof(s.ledger) is distinct from 'object'
     or jsonb_typeof(s.ledger->'schemaVersion') is distinct from 'number' or s.ledger->'schemaVersion' is distinct from '2'::jsonb
     or jsonb_typeof(s.ledger->'questionLibraryVersion') is distinct from 'string' or length(s.ledger->>'questionLibraryVersion') not between 1 and 64
     or jsonb_typeof(s.ledger->'facts') is distinct from 'object'
     or jsonb_typeof(s.ledger->'extractionEvidence') is distinct from 'object'
     or jsonb_typeof(s.ledger->'extractionEvidence'->'candidates') is distinct from 'array'
     or jsonb_typeof(s.ledger->'extractionEvidence'->'conflicts') is distinct from 'array'
     or s.status is distinct from 'interviewing'
     or exists (select 1 from jsonb_object_keys(s.ledger->'facts') key where not key = any(private.template_copilot_v2_fact_ids()))
     or exists (select 1 from unnest(private.template_copilot_v2_fact_ids()) key where not (s.ledger->'facts' ? key)) then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_transition');
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  library_version := s.ledger->>'questionLibraryVersion';
  foreach fact_id in array private.template_copilot_v2_fact_ids() loop
    if not private.template_copilot_v2_fact_entry_valid(s.ledger->'facts'->fact_id,fact_id,library_version) then
      perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_transition');
      return jsonb_build_object('outcome','invalid_transition');
    end if;
  end loop;
  old_entry := s.ledger->'facts'->p_fact_id;
  definition := private.template_copilot_v2_fact_definition(p_fact_id);
  if p_operation in ('record_candidate','human_commit','human_replace','resolve_conflict')
     and not private.template_copilot_v2_fact_value_valid(p_fact_id,p_canonical_value) then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_command');
    return jsonb_build_object('outcome','invalid_command');
  end if;

  -- A map edit cannot silently consume unreviewed extractor evidence.  Only
  -- the dedicated extraction RPC can close the named candidate/conflict.
  select count(*) into open_sidecar_count from (
    select value as item from jsonb_array_elements(s.ledger->'extractionEvidence'->'candidates')
    union all select value as item from jsonb_array_elements(s.ledger->'extractionEvidence'->'conflicts')
  ) sidecar where sidecar.item->>'factId'=p_fact_id and sidecar.item->>'state'='open';
  if open_sidecar_count > 0 then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_transition');
    return jsonb_build_object('outcome','invalid_transition','reason','open_extraction_sidecar');
  end if;

  timestamp_text := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  old_history := coalesce(old_entry->'staleHistory','[]'::jsonb);
  if not private.template_copilot_v2_fact_transition_allowed(p_operation,old_entry->>'status',definition->>'appliesWhen') then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_transition');
    return jsonb_build_object('outcome','invalid_transition');
  end if;

  if p_operation = 'record_candidate' then
    if old_entry->>'status' = 'candidate' and old_entry->'canonicalValue' is distinct from p_canonical_value then
      new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,old_history)
        || jsonb_build_object('status','conflicting','canonicalValue',old_entry->'canonicalValue','provenance',old_entry->'provenance',
          'conflictValues',jsonb_build_array(old_entry->'canonicalValue',p_canonical_value),
          'conflictEvidence',jsonb_build_array(jsonb_build_object('canonicalValue',old_entry->'canonicalValue','provenance',old_entry->'provenance'),jsonb_build_object('canonicalValue',p_canonical_value,'provenance',jsonb_build_array(jsonb_build_object('kind','human_editor','sourceId',private.template_copilot_v2_fact_source_id(p_idempotency_key),'sourceMessageIds','[]'::jsonb)))));
    else
      new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,old_history)
        || jsonb_build_object('status','candidate','canonicalValue',p_canonical_value,'provenance',jsonb_build_array(jsonb_build_object('kind','human_editor','sourceId',private.template_copilot_v2_fact_source_id(p_idempotency_key),'sourceMessageIds','[]'::jsonb)));
    end if;
  elsif p_operation = 'mark_unknown' then
    new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text)) || jsonb_build_object('status','unknown');
  elsif p_operation = 'mark_not_applicable' then
    new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text))
      || jsonb_build_object('status','not_applicable','notApplicableReason',private.template_copilot_v2_ecmascript_trim(p_reason),'confirmation',jsonb_build_object('actorId',p_actor_id,'confirmedAt',timestamp_text,'operation','human_mark_not_applicable'));
  elsif p_operation = 'human_commit' then
    new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text))
      || jsonb_build_object('status','committed','canonicalValue',p_canonical_value,'provenance',jsonb_build_array(jsonb_build_object('kind','human_editor','sourceId',private.template_copilot_v2_fact_source_id(p_idempotency_key),'sourceMessageIds','[]'::jsonb)),'confirmation',jsonb_build_object('actorId',p_actor_id,'confirmedAt',timestamp_text,'operation','human_confirm'));
  elsif p_operation = 'human_replace' then
    new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text))
      || jsonb_build_object('status','committed','canonicalValue',p_canonical_value,'provenance',jsonb_build_array(jsonb_build_object('kind','human_editor','sourceId',private.template_copilot_v2_fact_source_id(p_idempotency_key),'sourceMessageIds','[]'::jsonb)),'confirmation',jsonb_build_object('actorId',p_actor_id,'confirmedAt',timestamp_text,'operation','human_replace'));
  else
    new_entry := private.template_copilot_v2_fact_base(p_fact_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text))
      || jsonb_build_object('status','committed','canonicalValue',p_canonical_value,'provenance',jsonb_build_array(jsonb_build_object('kind','human_editor','sourceId',private.template_copilot_v2_fact_source_id(p_idempotency_key),'sourceMessageIds','[]'::jsonb)),'confirmation',jsonb_build_object('actorId',p_actor_id,'confirmedAt',timestamp_text,'operation','human_resolve_conflict'));
  end if;

  -- Match the domain's semantic equality: provenance, confirmation, and
  -- bounded correction history may change without orphaning downstream work.
  fact_changed := old_entry->>'status' is distinct from new_entry->>'status'
    or old_entry->'canonicalValue' is distinct from new_entry->'canonicalValue'
    or old_entry->>'notApplicableReason' is distinct from new_entry->>'notApplicableReason';
  next_ledger := jsonb_set(s.ledger,array['facts',p_fact_id],new_entry,true);
  -- The closure comes only from private.template_copilot_v2_fact_definition.
  -- Every dependent entry is rebuilt, retaining a bounded snapshot of the
  -- locked old entry; no unrelated ledger byte is caller-controlled or changed.
  if fact_changed then
    foreach dependent_id in array private.template_copilot_v2_fact_dependents(p_fact_id) loop
      old_entry := s.ledger->'facts'->dependent_id;
      new_entry := private.template_copilot_v2_fact_base(dependent_id,library_version,private.template_copilot_v2_append_stale(old_entry,p_fact_id,timestamp_text));
      next_ledger := jsonb_set(next_ledger,array['facts',dependent_id],new_entry,true);
    end loop;
  end if;

  before_revision := s.revision;
  update public.template_copilot_sessions set ledger=next_ledger, revision=revision+1, updated_at=now() where id=s.id returning * into s;
  response := jsonb_build_object('outcome','applied','sessionId',s.id,'revision',s.revision,'status',s.status,'ledger',s.ledger);
  insert into public.template_copilot_v2_operation_receipts(session_id,idempotency_key,command_hash,response) values(s.id,p_idempotency_key,p_command_hash,response);
  perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,before_revision,s.revision,'applied');
  return response;
exception when others then
  if owner_verified then
    perform private.audit_template_copilot_v2_fact_attempt(s.id,p_actor_id,p_idempotency_key,p_command_hash,p_operation,p_fact_id,s.revision,s.revision,'invalid_transition');
    return jsonb_build_object('outcome','invalid_transition');
  end if;
  raise;
end;
$$;

revoke all on function private.template_copilot_v2_fact_ids() from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_definition(text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_dependents(text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_transition_allowed(text,text,text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_utf16_length(text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_ecmascript_trim(text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_bounded_string(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_integer_between(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_bounded_json(jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_exact_object_keys(jsonb,text[],text[]) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_string_array(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_bounded_id_array(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_policy_value_valid(jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_value_valid(text,jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_rfc3339_valid(jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_provenance_valid(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_confirmation_valid(jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_conflict_values_valid(text,jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_conflict_evidence_valid(text,jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_stale_history_valid(text,jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_metadata_valid(jsonb,text,text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_entry_valid(jsonb,text,text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_base(text,text,jsonb) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_fact_source_id(text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_stale_snapshot(jsonb,text,text) from public, anon, authenticated;
revoke all on function private.template_copilot_v2_append_stale(jsonb,text,text) from public, anon, authenticated;
revoke all on function private.audit_template_copilot_v2_fact_attempt(uuid,uuid,text,text,text,text,bigint,bigint,text) from public, anon, authenticated, service_role;
revoke all on function public.mutate_template_copilot_v2_fact(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mutate_template_copilot_v2_fact_delta(uuid,uuid,bigint,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.mutate_template_copilot_v2_fact_delta(uuid,uuid,bigint,text,text,text,text,jsonb,text) to service_role;
