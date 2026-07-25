-- Preserve the business/department foreign keys already stored for an exact
-- legacy template version when its directory entry has since been removed.
-- New template versions must still resolve both directory fields.

create or replace function public.save_workspace_configuration(
  p_configuration jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_business jsonb;
  v_department jsonb;
  v_template jsonb;
  v_business_id uuid;
  v_department_id uuid;
  v_existing_business_id uuid;
  v_existing_department_id uuid;
  v_existing_template_found boolean;
  v_business_count integer := 0;
  v_department_count integer := 0;
  v_template_count integer := 0;
  v_assignment_emails text[];
  v_existing_assignment_emails text[];
  v_invalid_assignment_emails text[];
begin
  if v_actor_id is null
     or not (select private.is_active_approval_admin(v_actor_id)) then
    raise exception using errcode = '42501', message = 'active admin required';
  end if;

  if jsonb_typeof(p_configuration) <> 'object'
     or coalesce((p_configuration ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb)) > 500
     or jsonb_array_length(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb)) > 5000
     or jsonb_array_length(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb)) > 5000 then
    raise exception using errcode = '22023', message = 'invalid workspace configuration';
  end if;

  for v_business in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'businessUnits', '[]'::jsonb))
  loop
    if jsonb_typeof(v_business) <> 'object'
       or length(trim(coalesce(v_business ->> 'name', ''))) not between 1 and 200 then
      raise exception using errcode = '22023', message = 'invalid business unit';
    end if;

    insert into public.business_units (name, is_active, updated_at)
    values (
      trim(v_business ->> 'name'),
      coalesce((v_business ->> 'isActive')::boolean, true),
      statement_timestamp()
    )
    on conflict (name) do update
    set is_active = excluded.is_active,
        updated_at = excluded.updated_at;
    v_business_count := v_business_count + 1;
  end loop;

  for v_department in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'businessDepartments', '[]'::jsonb))
  loop
    select b.id into v_business_id
    from public.business_units b
    where b.name = trim(coalesce(v_department ->> 'businessName', ''));

    if v_business_id is null
       or length(trim(coalesce(v_department ->> 'name', ''))) not between 1 and 200 then
      raise exception using errcode = '23503', message = 'department business is unresolved';
    end if;

    insert into public.business_departments (
      business_unit_id,
      name,
      is_active,
      updated_at
    )
    values (
      v_business_id,
      trim(v_department ->> 'name'),
      coalesce((v_department ->> 'isActive')::boolean, true),
      statement_timestamp()
    )
    on conflict (business_unit_id, name) do update
    set is_active = excluded.is_active,
        updated_at = excluded.updated_at;
    v_department_count := v_department_count + 1;
  end loop;

  for v_template in
    select value
    from jsonb_array_elements(coalesce(p_configuration -> 'workflowTemplateVersions', '[]'::jsonb))
  loop
    v_business_id := null;
    v_department_id := null;
    v_existing_business_id := null;
    v_existing_department_id := null;
    v_existing_template_found := false;

    if length(trim(coalesce(v_template ->> 'templateKey', ''))) not between 1 and 200
       or coalesce((v_template ->> 'versionNumber')::integer, 0) < 1
       or length(trim(coalesce(v_template ->> 'name', ''))) not between 1 and 300
       or jsonb_typeof(coalesce(v_template -> 'templateSnapshot', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid workflow template version';
    end if;

    select b.id into v_business_id
    from public.business_units b
    where b.name = trim(coalesce(v_template ->> 'businessName', ''));

    select d.id into v_department_id
    from public.business_departments d
    where d.business_unit_id = v_business_id
      and d.name = trim(coalesce(v_template ->> 'departmentName', ''));

    select
      existing.business_unit_id,
      existing.department_id
    into
      v_existing_business_id,
      v_existing_department_id
    from public.workflow_template_versions existing
    where existing.template_key = trim(v_template ->> 'templateKey')
      and existing.version_number = (v_template ->> 'versionNumber')::integer
    limit 1;
    v_existing_template_found := found;

    if v_business_id is null or v_department_id is null then
      if not v_existing_template_found then
        raise exception using errcode = '22023', message = 'invalid workflow template version';
      end if;
      v_business_id := v_existing_business_id;
      v_department_id := v_existing_department_id;
    end if;

    if v_business_id is null then
      raise exception using errcode = '22023', message = 'invalid workflow template version';
    end if;

    if coalesce((v_template ->> 'isActiveVersion')::boolean, false) then
      v_assignment_emails := private.workflow_template_assignment_emails(
        v_template -> 'templateSnapshot'
      );

      select private.workflow_template_assignment_emails(existing.template_snapshot)
      into v_existing_assignment_emails
      from public.workflow_template_versions existing
      where existing.template_key = trim(v_template ->> 'templateKey')
        and existing.version_number = (v_template ->> 'versionNumber')::integer
        and existing.is_active_version
      limit 1;

      v_existing_assignment_emails := coalesce(
        v_existing_assignment_emails,
        '{}'::text[]
      );
      v_invalid_assignment_emails := public.validate_active_directory_emails(
        array(
          select candidate_email
          from unnest(v_assignment_emails) candidate(candidate_email)
          except
          select existing_email
          from unnest(v_existing_assignment_emails) grandfathered(existing_email)
        )
      );
      if cardinality(v_invalid_assignment_emails) > 0 then
        raise exception using
          errcode = '23503',
          message = format(
            'inactive or missing template assignment: %s',
            v_invalid_assignment_emails[1]
          );
      end if;
    end if;

    insert into public.workflow_template_versions (
      template_key,
      version_number,
      name,
      business_unit_id,
      department_id,
      graph,
      document_requirements,
      supported_languages,
      template_snapshot,
      is_active,
      is_active_version,
      version_comment,
      created_by,
      updated_at
    )
    values (
      trim(v_template ->> 'templateKey'),
      (v_template ->> 'versionNumber')::integer,
      trim(v_template ->> 'name'),
      v_business_id,
      v_department_id,
      coalesce(v_template -> 'graph', '{"nodes":[],"edges":[]}'::jsonb),
      coalesce(v_template -> 'documentRequirements', '[]'::jsonb),
      coalesce(
        array(select jsonb_array_elements_text(v_template -> 'supportedLanguages')),
        array['en']::text[]
      ),
      jsonb_set(v_template -> 'templateSnapshot', '{schemaVersion}', '1'::jsonb, true),
      coalesce((v_template ->> 'isActive')::boolean, true),
      coalesce((v_template ->> 'isActiveVersion')::boolean, false),
      left(coalesce(v_template ->> 'versionComment', ''), 2000),
      v_actor_id,
      statement_timestamp()
    )
    on conflict (template_key, version_number) do update
    set name = excluded.name,
        business_unit_id = excluded.business_unit_id,
        department_id = excluded.department_id,
        graph = excluded.graph,
        document_requirements = excluded.document_requirements,
        supported_languages = excluded.supported_languages,
        template_snapshot = excluded.template_snapshot,
        is_active = excluded.is_active,
        is_active_version = excluded.is_active_version,
        version_comment = excluded.version_comment,
        updated_at = excluded.updated_at;
    v_template_count := v_template_count + 1;
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'businessUnits', v_business_count,
    'businessDepartments', v_department_count,
    'workflowTemplateVersions', v_template_count
  );
end;
$$;

revoke all on function public.save_workspace_configuration(jsonb)
from public, anon, service_role;
grant execute on function public.save_workspace_configuration(jsonb)
to authenticated;
