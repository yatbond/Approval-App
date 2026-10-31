-- Step 9: exact-version, authorized, auditable activation.
-- This migration is additive and must be reviewed/applied separately.

alter table public.template_authoring_command_receipts
drop constraint if exists template_authoring_command_receipts_operation_check;

alter table public.template_authoring_command_receipts
add constraint template_authoring_command_receipts_operation_check
check (operation in (
  'create_family',
  'create_draft',
  'replace_draft',
  'request_publish',
  'review_publish',
  'publish_draft',
  'set_publisher',
  'activate_version'
));

alter table public.template_authoring_events
drop constraint if exists template_authoring_events_event_type_check;

alter table public.template_authoring_events
add constraint template_authoring_events_event_type_check
check (event_type in (
  'family_created',
  'draft_created',
  'draft_replaced',
  'publish_requested',
  'changes_requested',
  'publish_approved',
  'publish_rejected',
  'version_published',
  'publisher_granted',
  'publisher_revoked',
  'version_activated'
));

-- Preserve a server-owned copy of the exact generated artifact when the
-- dedicated Copilot route links its draft. General authoring edits cannot
-- manufacture this binding, and any later dossier or definition edit breaks
-- equality and therefore activation readiness.
alter table public.template_copilot_sessions
add column if not exists generated_source_revision bigint,
add column if not exists generated_artifact jsonb;

alter table public.template_copilot_sessions
drop constraint if exists template_copilot_sessions_generated_artifact_check;

alter table public.template_copilot_sessions
add constraint template_copilot_sessions_generated_artifact_check
check (
  (
    generated_source_revision is null
    and generated_artifact is null
  )
  or (
    generated_source_revision >= 1
    and jsonb_typeof(generated_artifact) = 'object'
  )
);

create or replace function public.link_template_copilot_draft(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_family_id uuid,
  p_draft_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.template_copilot_sessions%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
begin
  select *
  into v_session
  from public.template_copilot_sessions s
  where s.id = p_session_id
  for update;

  if not found or v_session.owner_id <> p_actor_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_session.status = 'draft_created'
    and v_session.family_id = p_family_id
    and v_session.draft_id = p_draft_id
    and v_session.generated_source_revision is not null
    and v_session.generated_artifact is not null
  then
    return jsonb_build_object(
      'outcome', 'replayed',
      'sessionId', v_session.id,
      'revision', v_session.revision,
      'status', v_session.status,
      'familyId', v_session.family_id,
      'draftId', v_session.draft_id
    );
  end if;
  if v_session.revision <> p_expected_revision then
    return jsonb_build_object(
      'outcome', 'stale_revision',
      'currentRevision', v_session.revision
    );
  end if;
  if v_session.status <> 'ready' then
    return jsonb_build_object('outcome', 'not_ready');
  end if;

  select *
  into v_draft
  from public.template_authoring_drafts d
  where d.id = p_draft_id
    and d.family_id = p_family_id;

  if not found
     or coalesce(
       v_draft.definition #>> '{generation,sourceSessionId}',
       ''
     ) <> p_session_id::text
     or coalesce(
       jsonb_typeof(
         v_draft.definition #> '{generation,sourceSessionRevision}'
       ),
       ''
     ) <> 'number'
     or coalesce(
       v_draft.definition #>> '{generation,sourceSessionRevision}',
       ''
     ) <> p_expected_revision::text then
    return jsonb_build_object('outcome', 'invalid_draft');
  end if;

  update public.template_copilot_sessions
  set
    family_id = p_family_id,
    draft_id = p_draft_id,
    status = 'draft_created',
    generated_source_revision = p_expected_revision,
    generated_artifact = jsonb_build_object(
      'dossier', v_draft.dossier,
      'definition', v_draft.definition
    ),
    revision = revision + 1,
    updated_at = statement_timestamp()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'outcome', 'applied',
    'sessionId', v_session.id,
    'revision', v_session.revision,
    'status', v_session.status,
    'familyId', v_session.family_id,
    'draftId', v_session.draft_id
  );
end;
$$;

revoke all on function public.link_template_copilot_draft(
  uuid, uuid, bigint, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.link_template_copilot_draft(
  uuid, uuid, bigint, uuid, uuid
) to service_role;

-- IT administrators can grant or revoke the exact family-scoped publisher
-- role through the authenticated application. This is the supported
-- provisioning path required before an activation button is enabled.
create or replace function public.set_template_authoring_publisher(
  p_actor_id uuid,
  p_family_id uuid,
  p_publisher_email text,
  p_enabled boolean,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_family public.template_authoring_families%rowtype;
  v_publisher public.profiles%rowtype;
  v_changed boolean := false;
  v_row_count bigint := 0;
  v_result jsonb;
begin
  if p_actor_id is null
     or p_family_id is null
     or p_enabled is null
     or pg_catalog.length(
       pg_catalog.btrim(coalesce(p_publisher_email, ''))
     ) not between 3 and 320
     or pg_catalog.length(
       pg_catalog.btrim(coalesce(p_idempotency_key, ''))
     ) not between 8 and 128
     or coalesce(p_payload_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text
        || ':set_publisher:'
        || pg_catalog.btrim(p_idempotency_key),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'set_publisher'
    and r.idempotency_key = pg_catalog.btrim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  if not private.is_active_approval_admin(p_actor_id) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  select * into v_family
  from public.template_authoring_families f
  where f.id = p_family_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_family.status <> 'active' then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  select * into v_publisher
  from public.profiles p
  where p.is_active
    and pg_catalog.lower(p.email) = pg_catalog.lower(
      pg_catalog.btrim(p_publisher_email)
    );
  if not found then
    return jsonb_build_object('outcome', 'invalid_target');
  end if;

  if p_enabled then
    insert into public.template_authoring_memberships (
      family_id,
      profile_id,
      role,
      created_by
    )
    values (
      v_family.id,
      v_publisher.id,
      'publisher',
      p_actor_id
    )
    on conflict (family_id, profile_id, role) do nothing;
    get diagnostics v_row_count = row_count;
    v_changed := v_row_count > 0;
  else
    delete from public.template_authoring_memberships m
    where m.family_id = v_family.id
      and m.profile_id = v_publisher.id
      and m.role = 'publisher';
    get diagnostics v_row_count = row_count;
    v_changed := v_row_count > 0;
  end if;

  if v_changed then
    insert into public.template_authoring_events (
      family_id,
      actor_id,
      event_type,
      detail
    )
    values (
      v_family.id,
      p_actor_id,
      case
        when p_enabled then 'publisher_granted'
        else 'publisher_revoked'
      end,
      jsonb_build_object(
        'publisherProfileId', v_publisher.id,
        'publisherEmail', pg_catalog.lower(v_publisher.email)
      )
    );
  end if;

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_family.id,
    'publisherProfileId', v_publisher.id,
    'publisherEmail', pg_catalog.lower(v_publisher.email),
    'enabled', p_enabled,
    'changed', v_changed
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    result
  )
  values (
    p_actor_id,
    'set_publisher',
    pg_catalog.btrim(p_idempotency_key),
    p_payload_hash,
    v_family.id,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.set_template_authoring_publisher(
  uuid, uuid, text, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.set_template_authoring_publisher(
  uuid, uuid, text, boolean, text, text
) to service_role;

-- Mark immutable versions that belong to the governed authoring family. The
-- browser still sends only the immutable database version id; this marker
-- selects the server-authoritative activation path without granting authority.
update public.workflow_template_versions v
set template_snapshot = jsonb_set(
  v.template_snapshot,
  '{authoringFamilyId}',
  to_jsonb(f.id::text),
  true
)
from public.template_authoring_families f
where f.family_key = v.template_key
  and coalesce(v.template_snapshot ->> 'authoringFamilyId', '') <> f.id::text;

create or replace function private.mark_template_authoring_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select f.id
  into v_family_id
  from public.template_authoring_families f
  where f.family_key = new.template_key;

  if v_family_id is not null then
    new.template_snapshot := jsonb_set(
      new.template_snapshot,
      '{authoringFamilyId}',
      to_jsonb(v_family_id::text),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists mark_template_authoring_version
on public.workflow_template_versions;
create trigger mark_template_authoring_version
before insert or update of template_key, template_snapshot
on public.workflow_template_versions
for each row execute function private.mark_template_authoring_version();

-- Governed authoring versions are immutable through the legacy whole-workspace
-- persistence path. Only the exact-version activation command below may change
-- their active marker. This prevents a stale browser tab from undoing a
-- server-authoritative activation while preserving legacy templates.
create or replace function private.guard_template_authoring_version_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_authoring boolean;
begin
  select exists (
    select 1
    from public.template_authoring_families f
    where f.family_key = new.template_key
       or (
         tg_op = 'UPDATE'
         and f.family_key = old.template_key
       )
  )
  into v_is_authoring;

  if not v_is_authoring
     or current_setting(
       'app.template_authoring_version_write',
       true
     ) = 'activate' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    return old;
  end if;

  new.is_active_version := false;
  new.template_snapshot := jsonb_set(
    new.template_snapshot,
    '{isActiveVersion}',
    'false'::jsonb,
    true
  );
  return new;
end;
$$;

drop trigger if exists aa_guard_template_authoring_version_write
on public.workflow_template_versions;
create trigger aa_guard_template_authoring_version_write
before insert or update
on public.workflow_template_versions
for each row execute function private.guard_template_authoring_version_write();

create or replace function public.activate_template_authoring_version(
  p_actor_id uuid,
  p_published_version_id uuid,
  p_expected_version_number integer,
  p_idempotency_key text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_version public.workflow_template_versions%rowtype;
  v_family public.template_authoring_families%rowtype;
  v_family_key text;
  v_expected_template jsonb;
  v_expected_languages text[];
  v_result jsonb;
begin
  if p_actor_id is null
     or p_published_version_id is null
     or p_expected_version_number is null
     or p_expected_version_number < 1
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_idempotency_key, '')))
       not between 8 and 128
     or coalesce(p_payload_hash, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  -- The receipt uniqueness key is actor + operation + idempotency key. Lock
  -- that same namespace so concurrent reuse against two different versions
  -- resolves as replay/conflict instead of racing the unique constraint.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text
        || ':activate_version:'
        || pg_catalog.btrim(p_idempotency_key),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'activate_version'
    and r.idempotency_key = pg_catalog.btrim(p_idempotency_key);

  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  -- Resolve the family without taking a version row lock, serialize every
  -- activation in that family, then lock the selected version. Two different
  -- versions can therefore never deadlock while each transaction holds one.
  select v.template_key into v_family_key
  from public.workflow_template_versions v
  where v.id = p_published_version_id;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_family
  from public.template_authoring_families f
  where f.family_key = v_family_key
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_version
  from public.workflow_template_versions v
  where v.id = p_published_version_id
    and v.template_key = v_family.family_key
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Activation is deliberately narrower than the legacy family helper:
  -- administrator status alone is not publisher authority.
  if not exists (
    select 1
    from public.template_authoring_memberships m
    join public.profiles p
      on p.id = m.profile_id
     and p.is_active
    where m.family_id = v_family.id
      and m.profile_id = p_actor_id
      and m.role = 'publisher'
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_family.status <> 'active' then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if v_version.version_number <> p_expected_version_number then
    return jsonb_build_object(
      'outcome', 'stale_revision',
      'currentVersionNumber', v_version.version_number
    );
  end if;

  if not v_version.is_active
     or coalesce((v_version.template_snapshot ->> 'isDraft')::boolean, true) then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if not exists (
    select 1
    from public.template_authoring_drafts d
    join public.template_authoring_publish_requests r
      on r.draft_id = d.id
     and r.family_id = d.family_id
     and r.published_version_id = d.published_version_id
    where d.family_id = v_family.id
      and d.published_version_id = v_version.id
      and d.status = 'published'
      and r.status = 'published'
      and r.requested_revision = d.revision
      and (
        (
          d.definition #>> '{generation,mode}'
            in ('manual', 'external_agent')
          and not (
            d.definition -> 'generation'
              ? 'sourceSessionId'
          )
          and not (
            d.definition -> 'generation'
              ? 'sourceSessionRevision'
          )
        )
        or (
          d.definition #>> '{generation,mode}' = 'copilot'
          and exists (
            select 1
            from public.template_copilot_sessions s
            where s.family_id = d.family_id
              and s.draft_id = d.id
              and s.status = 'draft_created'
              and s.id::text = coalesce(
                d.definition #>> '{generation,sourceSessionId}',
                ''
              )
              and s.generated_source_revision::text = coalesce(
                d.definition #>> '{generation,sourceSessionRevision}',
                ''
              )
              and s.generated_artifact = jsonb_build_object(
                'dossier', d.dossier,
                'definition', d.definition
              )
          )
        )
      )
  ) then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  select d.definition -> 'template'
  into v_expected_template
  from public.template_authoring_drafts d
  where d.family_id = v_family.id
    and d.published_version_id = v_version.id
    and d.status = 'published';

  v_expected_template := jsonb_set(
    jsonb_set(
      v_expected_template,
      '{version}',
      to_jsonb(v_version.version_number),
      true
    ),
    '{isDraft}',
    'false'::jsonb,
    true
  );
  select array(
    select jsonb_array_elements_text(
      v_expected_template -> 'languages'
    )
  )
  into v_expected_languages;

  -- Prove the immutable runtime record is still the exact normalized
  -- projection published from the reviewed draft. Server-owned active/family
  -- markers are excluded from the structural comparison.
  if (
    v_version.template_snapshot
      - 'isActiveVersion'
      - 'authoringFamilyId'
      - 'schemaVersion'
  ) is distinct from (
    v_expected_template
      - 'isActiveVersion'
      - 'authoringFamilyId'
      - 'schemaVersion'
  )
     or v_version.graph is distinct from v_expected_template -> 'graph'
     or v_version.document_requirements
       is distinct from v_expected_template -> 'documents'
     or v_version.supported_languages is distinct from v_expected_languages
     or v_version.name is distinct from v_family.name
     or v_version.business_unit_id is distinct from v_family.business_unit_id
     or v_version.department_id is distinct from v_family.department_id then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  perform set_config(
    'app.template_authoring_version_write',
    'activate',
    true
  );

  update public.workflow_template_versions
  set is_active_version = false,
      template_snapshot = jsonb_set(
        template_snapshot,
        '{isActiveVersion}',
        'false'::jsonb,
        true
      ),
      updated_at = statement_timestamp()
  where template_key = v_version.template_key
    and is_active_version;

  update public.workflow_template_versions
  set is_active_version = true,
      template_snapshot = jsonb_set(
        template_snapshot,
        '{isActiveVersion}',
        'true'::jsonb,
        true
      ),
      updated_at = statement_timestamp()
  where id = v_version.id;

  insert into public.template_authoring_events (
    family_id,
    actor_id,
    event_type,
    detail
  )
  values (
    v_family.id,
    p_actor_id,
    'version_activated',
    jsonb_build_object(
      'publishedVersionId', v_version.id,
      'versionNumber', v_version.version_number
    )
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_family.id,
    'publishedVersionId', v_version.id,
    'versionNumber', v_version.version_number,
    'active', true
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    result
  )
  values (
    p_actor_id,
    'activate_version',
    pg_catalog.btrim(p_idempotency_key),
    p_payload_hash,
    v_family.id,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.activate_template_authoring_version(
  uuid, uuid, integer, text, text
)
from public, anon, authenticated;

grant execute on function public.activate_template_authoring_version(
  uuid, uuid, integer, text, text
)
to service_role;
