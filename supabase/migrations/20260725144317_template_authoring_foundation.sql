-- Server-authoritative workflow template authoring.
-- Browser roles may read rows allowed by RLS, but all mutations are service-only
-- RPCs which revalidate the active actor, scope, revision and idempotency key.

create schema if not exists private;

create table public.template_authoring_families (
  id uuid primary key default gen_random_uuid(),
  family_key text not null unique,
  name text not null,
  business_unit_id uuid not null references public.business_units(id),
  department_id uuid not null references public.business_departments(id),
  status text not null default 'active',
  created_by uuid not null references public.profiles(id),
  latest_published_version_id uuid references public.workflow_template_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (family_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'),
  check (length(name) between 1 and 300),
  check (status in ('active', 'archived'))
);

create table public.template_authoring_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.template_authoring_families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (family_id, profile_id, role),
  check (role in ('owner', 'editor', 'reviewer', 'publisher', 'viewer'))
);

create table public.template_authoring_drafts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.template_authoring_families(id) on delete cascade,
  revision bigint not null default 1,
  status text not null default 'draft',
  dossier jsonb not null,
  definition jsonb not null,
  change_reason text not null,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_version_id uuid references public.workflow_template_versions(id),
  check (revision >= 1),
  check (status in (
    'draft',
    'in_review',
    'approved',
    'changes_requested',
    'rejected',
    'published',
    'archived'
  )),
  check (jsonb_typeof(dossier) = 'object'),
  check (jsonb_typeof(definition) = 'object'),
  check (length(change_reason) between 1 and 2000)
);

create unique index template_authoring_one_open_draft_per_family_idx
on public.template_authoring_drafts (family_id)
where status in ('draft', 'in_review', 'approved', 'changes_requested');

create table public.template_authoring_publish_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.template_authoring_families(id) on delete cascade,
  draft_id uuid not null references public.template_authoring_drafts(id) on delete cascade,
  requested_revision bigint not null,
  status text not null default 'pending',
  request_note text not null default '',
  validation_summary jsonb not null,
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_note text not null default '',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  published_version_id uuid references public.workflow_template_versions(id),
  check (requested_revision >= 1),
  check (status in (
    'pending',
    'approved',
    'changes_requested',
    'rejected',
    'published',
    'superseded'
  )),
  check (length(request_note) <= 4000),
  check (length(review_note) <= 4000),
  check (jsonb_typeof(validation_summary) = 'object')
);

create unique index template_authoring_one_pending_request_per_draft_idx
on public.template_authoring_publish_requests (draft_id)
where status = 'pending';

create table public.template_authoring_command_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  operation text not null,
  idempotency_key text not null,
  payload_hash text not null,
  family_id uuid references public.template_authoring_families(id),
  draft_id uuid references public.template_authoring_drafts(id),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_id, operation, idempotency_key),
  check (operation in (
    'create_family',
    'create_draft',
    'replace_draft',
    'request_publish',
    'review_publish',
    'publish_draft'
  )),
  check (length(idempotency_key) between 8 and 128),
  check (payload_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(result) = 'object')
);

create table public.template_authoring_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.template_authoring_families(id) on delete cascade,
  draft_id uuid references public.template_authoring_drafts(id) on delete set null,
  publish_request_id uuid references public.template_authoring_publish_requests(id) on delete set null,
  actor_id uuid not null references public.profiles(id),
  event_type text not null,
  revision bigint,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in (
    'family_created',
    'draft_created',
    'draft_replaced',
    'publish_requested',
    'changes_requested',
    'publish_approved',
    'publish_rejected',
    'version_published'
  )),
  check (revision is null or revision >= 1),
  check (jsonb_typeof(detail) = 'object')
);

create index template_authoring_families_scope_idx
on public.template_authoring_families (business_unit_id, department_id, updated_at desc);

create index template_authoring_memberships_profile_idx
on public.template_authoring_memberships (profile_id, family_id, role);

create index template_authoring_drafts_family_idx
on public.template_authoring_drafts (family_id, updated_at desc);

create index template_authoring_publish_requests_family_idx
on public.template_authoring_publish_requests (family_id, requested_at desc);

create index template_authoring_events_family_idx
on public.template_authoring_events (family_id, created_at desc, id);

create index template_authoring_receipts_actor_idx
on public.template_authoring_command_receipts (actor_id, created_at desc);

-- Cover every foreign key used by deletion checks, audit joins, and lifecycle
-- lookups. Several write-heavy tables need dedicated indexes because their
-- primary operational indexes begin with a different column.
create index template_authoring_families_department_idx
on public.template_authoring_families (department_id);
create index template_authoring_families_creator_idx
on public.template_authoring_families (created_by);
create index template_authoring_families_published_version_idx
on public.template_authoring_families (latest_published_version_id);
create index template_authoring_memberships_creator_idx
on public.template_authoring_memberships (created_by);
create index template_authoring_drafts_creator_idx
on public.template_authoring_drafts (created_by);
create index template_authoring_drafts_updater_idx
on public.template_authoring_drafts (updated_by);
create index template_authoring_drafts_published_version_idx
on public.template_authoring_drafts (published_version_id);
create index template_authoring_publish_requests_requester_idx
on public.template_authoring_publish_requests (requested_by);
create index template_authoring_publish_requests_reviewer_idx
on public.template_authoring_publish_requests (reviewed_by);
create index template_authoring_publish_requests_published_version_idx
on public.template_authoring_publish_requests (published_version_id);
create index template_authoring_receipts_family_idx
on public.template_authoring_command_receipts (family_id);
create index template_authoring_receipts_draft_idx
on public.template_authoring_command_receipts (draft_id);
create index template_authoring_events_draft_idx
on public.template_authoring_events (draft_id);
create index template_authoring_events_request_idx
on public.template_authoring_events (publish_request_id);
create index template_authoring_events_actor_idx
on public.template_authoring_events (actor_id);

create or replace function private.can_view_template_authoring_family(
  p_family_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.is_active
      and (
        private.is_active_approval_admin(p_actor_id)
        or exists (
          select 1
          from public.template_authoring_families f
          where f.id = p_family_id
            and f.created_by = p_actor_id
        )
        or exists (
          select 1
          from public.template_authoring_memberships m
          where m.family_id = p_family_id
            and m.profile_id = p_actor_id
        )
      )
  );
$$;

create or replace function private.has_template_authoring_family_role(
  p_family_id uuid,
  p_actor_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.is_active
      and (
        private.is_active_approval_admin(p_actor_id)
        or exists (
          select 1
          from public.template_authoring_memberships m
          where m.family_id = p_family_id
            and m.profile_id = p_actor_id
            and m.role = any(coalesce(p_roles, '{}'::text[]))
        )
      )
  );
$$;

revoke all on function private.can_view_template_authoring_family(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function private.has_template_authoring_family_role(uuid, uuid, text[])
from public, anon, authenticated, service_role;
grant execute on function private.can_view_template_authoring_family(uuid, uuid)
to authenticated;
grant execute on function private.has_template_authoring_family_role(uuid, uuid, text[])
to authenticated;

alter table public.template_authoring_families enable row level security;
alter table public.template_authoring_memberships enable row level security;
alter table public.template_authoring_drafts enable row level security;
alter table public.template_authoring_publish_requests enable row level security;
alter table public.template_authoring_command_receipts enable row level security;
alter table public.template_authoring_events enable row level security;

create policy "authorized users read template authoring families"
on public.template_authoring_families
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_view_template_authoring_family(id, (select auth.uid()))
);

create policy "authorized users read template authoring memberships"
on public.template_authoring_memberships
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_view_template_authoring_family(family_id, (select auth.uid()))
);

create policy "authorized users read template authoring drafts"
on public.template_authoring_drafts
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_view_template_authoring_family(family_id, (select auth.uid()))
);

create policy "authorized users read template publish requests"
on public.template_authoring_publish_requests
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_view_template_authoring_family(family_id, (select auth.uid()))
);

create policy "authorized users read template authoring events"
on public.template_authoring_events
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.can_view_template_authoring_family(family_id, (select auth.uid()))
);

-- Receipts contain request hashes and replay results used only by server-side
-- command handlers. Keep the denial explicit so database security advisors can
-- distinguish intentional isolation from a missing policy.
create policy "browser roles cannot read template authoring receipts"
on public.template_authoring_command_receipts
for select
to authenticated
using (false);

revoke all privileges on table
  public.template_authoring_families,
  public.template_authoring_memberships,
  public.template_authoring_drafts,
  public.template_authoring_publish_requests,
  public.template_authoring_command_receipts,
  public.template_authoring_events
from public, anon, authenticated;

grant select on table
  public.template_authoring_families,
  public.template_authoring_memberships,
  public.template_authoring_drafts,
  public.template_authoring_publish_requests,
  public.template_authoring_events
to authenticated;

grant select, insert, update, delete on table
  public.template_authoring_families,
  public.template_authoring_memberships,
  public.template_authoring_drafts,
  public.template_authoring_publish_requests,
  public.template_authoring_command_receipts,
  public.template_authoring_events
to service_role;

create or replace function public.create_template_authoring_family(
  p_actor_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_family_key text,
  p_name text,
  p_business_unit_id uuid,
  p_department_id uuid,
  p_dossier jsonb,
  p_definition jsonb,
  p_change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_family public.template_authoring_families%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':create_family:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'create_family'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.is_active
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or trim(coalesce(p_family_key, '')) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
     or length(trim(coalesce(p_name, ''))) not between 1 and 300
     or length(trim(coalesce(p_change_reason, ''))) not between 1 and 2000
     or jsonb_typeof(p_dossier) <> 'object'
     or jsonb_typeof(p_definition) <> 'object'
     or coalesce((p_dossier ->> 'schemaVersion')::integer, 0) <> 1
     or coalesce((p_definition ->> 'schemaVersion')::integer, 0) <> 1 then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  if not exists (
    select 1
    from public.business_departments d
    join public.business_units b on b.id = d.business_unit_id
    where b.id = p_business_unit_id
      and d.id = p_department_id
      and b.is_active
      and d.is_active
  ) then
    return jsonb_build_object('outcome', 'invalid_scope');
  end if;

  begin
    insert into public.template_authoring_families (
      family_key,
      name,
      business_unit_id,
      department_id,
      created_by
    )
    values (
      trim(p_family_key),
      trim(p_name),
      p_business_unit_id,
      p_department_id,
      p_actor_id
    )
    returning * into v_family;
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'family_key_conflict');
  end;

  insert into public.template_authoring_memberships (
    family_id,
    profile_id,
    role,
    created_by
  )
  values (v_family.id, p_actor_id, 'owner', p_actor_id);

  insert into public.template_authoring_drafts (
    family_id,
    dossier,
    definition,
    change_reason,
    created_by,
    updated_by
  )
  values (
    v_family.id,
    p_dossier,
    p_definition,
    trim(p_change_reason),
    p_actor_id,
    p_actor_id
  )
  returning * into v_draft;

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_family.id,
    v_draft.id,
    p_actor_id,
    'family_created',
    v_draft.revision,
    jsonb_build_object('familyKey', v_family.family_key)
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_family.id,
    'familyKey', v_family.family_key,
    'draftId', v_draft.id,
    'currentRevision', v_draft.revision
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'create_family',
    trim(p_idempotency_key),
    p_payload_hash,
    v_family.id,
    v_draft.id,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.create_template_authoring_draft(
  p_actor_id uuid,
  p_family_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_dossier jsonb,
  p_definition jsonb,
  p_change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_family public.template_authoring_families%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':create_draft:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'create_draft'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_family
  from public.template_authoring_families f
  where f.id = p_family_id
    and f.status = 'active'
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if not private.has_template_authoring_family_role(
    v_family.id,
    p_actor_id,
    array['owner', 'editor']::text[]
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if exists (
    select 1
    from public.template_authoring_drafts d
    where d.family_id = v_family.id
      and d.status in ('draft', 'in_review', 'approved', 'changes_requested')
  ) then
    return jsonb_build_object('outcome', 'open_draft_exists');
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_change_reason, ''))) not between 1 and 2000
     or jsonb_typeof(p_dossier) <> 'object'
     or jsonb_typeof(p_definition) <> 'object'
     or coalesce((p_dossier ->> 'schemaVersion')::integer, 0) <> 1
     or coalesce((p_definition ->> 'schemaVersion')::integer, 0) <> 1 then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  insert into public.template_authoring_drafts (
    family_id,
    dossier,
    definition,
    change_reason,
    created_by,
    updated_by
  )
  values (
    v_family.id,
    p_dossier,
    p_definition,
    trim(p_change_reason),
    p_actor_id,
    p_actor_id
  )
  returning * into v_draft;

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_family.id,
    v_draft.id,
    p_actor_id,
    'draft_created',
    v_draft.revision,
    jsonb_build_object('changeReason', v_draft.change_reason)
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_family.id,
    'draftId', v_draft.id,
    'currentRevision', v_draft.revision
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'create_draft',
    trim(p_idempotency_key),
    p_payload_hash,
    v_family.id,
    v_draft.id,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.replace_template_authoring_draft(
  p_actor_id uuid,
  p_draft_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_payload_hash text,
  p_dossier jsonb,
  p_definition jsonb,
  p_change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':replace_draft:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'replace_draft'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_draft
  from public.template_authoring_drafts d
  where d.id = p_draft_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if not private.has_template_authoring_family_role(
    v_draft.family_id,
    p_actor_id,
    array['owner', 'editor']::text[]
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_draft.status not in ('draft', 'changes_requested') then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'status', v_draft.status
    );
  end if;

  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object(
      'outcome', 'stale_revision',
      'currentRevision', v_draft.revision,
      'draft', to_jsonb(v_draft)
    );
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_change_reason, ''))) not between 1 and 2000
     or jsonb_typeof(p_dossier) <> 'object'
     or jsonb_typeof(p_definition) <> 'object'
     or coalesce((p_dossier ->> 'schemaVersion')::integer, 0) <> 1
     or coalesce((p_definition ->> 'schemaVersion')::integer, 0) <> 1 then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  update public.template_authoring_drafts
  set dossier = p_dossier,
      definition = p_definition,
      change_reason = trim(p_change_reason),
      revision = revision + 1,
      status = 'draft',
      updated_by = p_actor_id,
      updated_at = statement_timestamp()
  where id = v_draft.id
  returning * into v_draft;

  update public.template_authoring_publish_requests
  set status = 'superseded',
      reviewed_at = statement_timestamp()
  where draft_id = v_draft.id
    and status = 'pending';

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_draft.family_id,
    v_draft.id,
    p_actor_id,
    'draft_replaced',
    v_draft.revision,
    jsonb_build_object('changeReason', v_draft.change_reason)
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_draft.family_id,
    'draftId', v_draft.id,
    'currentRevision', v_draft.revision,
    'draft', to_jsonb(v_draft)
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'replace_draft',
    trim(p_idempotency_key),
    p_payload_hash,
    v_draft.family_id,
    v_draft.id,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.request_template_authoring_publish(
  p_actor_id uuid,
  p_draft_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_payload_hash text,
  p_request_note text,
  p_validation_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.template_authoring_command_receipts%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_request public.template_authoring_publish_requests%rowtype;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':request_publish:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'request_publish'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_draft
  from public.template_authoring_drafts d
  where d.id = p_draft_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if not private.has_template_authoring_family_role(
    v_draft.family_id,
    p_actor_id,
    array['owner', 'editor']::text[]
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_draft.status not in ('draft', 'changes_requested')
     or v_draft.revision <> p_expected_revision then
    return jsonb_build_object(
      'outcome',
      case
        when v_draft.revision <> p_expected_revision then 'stale_revision'
        else 'invalid_transition'
      end,
      'currentRevision', v_draft.revision,
      'status', v_draft.status
    );
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_request_note, '')) > 4000
     or jsonb_typeof(p_validation_summary) <> 'object'
     or coalesce((p_validation_summary ->> 'errorCount')::integer, -1) <> 0
     or jsonb_array_length(
       coalesce(
         v_draft.definition -> 'generation' -> 'unresolvedQuestionIds',
         '[]'::jsonb
       )
     ) <> 0 then
    return jsonb_build_object('outcome', 'validation_failed');
  end if;

  insert into public.template_authoring_publish_requests (
    family_id,
    draft_id,
    requested_revision,
    request_note,
    validation_summary,
    requested_by
  )
  values (
    v_draft.family_id,
    v_draft.id,
    v_draft.revision,
    trim(coalesce(p_request_note, '')),
    p_validation_summary,
    p_actor_id
  )
  returning * into v_request;

  update public.template_authoring_drafts
  set status = 'in_review',
      updated_at = statement_timestamp()
  where id = v_draft.id;

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    publish_request_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_draft.family_id,
    v_draft.id,
    v_request.id,
    p_actor_id,
    'publish_requested',
    v_draft.revision,
    jsonb_build_object('requestNote', v_request.request_note)
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_draft.family_id,
    'draftId', v_draft.id,
    'publishRequestId', v_request.id,
    'currentRevision', v_draft.revision,
    'status', v_request.status
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'request_publish',
    trim(p_idempotency_key),
    p_payload_hash,
    v_draft.family_id,
    v_draft.id,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.review_template_authoring_publish(
  p_actor_id uuid,
  p_publish_request_id uuid,
  p_decision text,
  p_review_note text,
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
  v_request public.template_authoring_publish_requests%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_event_type text;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':review_publish:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'review_publish'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_request
  from public.template_authoring_publish_requests r
  where r.id = p_publish_request_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_draft
  from public.template_authoring_drafts d
  where d.id = v_request.draft_id
  for update;

  if not private.has_template_authoring_family_role(
    v_request.family_id,
    p_actor_id,
    array['reviewer', 'publisher']::text[]
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_request.status <> 'pending'
     or v_draft.status <> 'in_review'
     or v_draft.revision <> v_request.requested_revision then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if p_decision not in ('approve', 'request_changes', 'reject')
     or length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_review_note, '')) > 4000
     or (
       p_decision in ('request_changes', 'reject')
       and length(trim(coalesce(p_review_note, ''))) = 0
     ) then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  update public.template_authoring_publish_requests
  set status = case p_decision
        when 'approve' then 'approved'
        when 'request_changes' then 'changes_requested'
        else 'rejected'
      end,
      reviewed_by = p_actor_id,
      review_note = trim(coalesce(p_review_note, '')),
      reviewed_at = statement_timestamp()
  where id = v_request.id
  returning * into v_request;

  update public.template_authoring_drafts
  set status = case p_decision
        when 'approve' then 'approved'
        when 'request_changes' then 'changes_requested'
        else 'rejected'
      end,
      updated_at = statement_timestamp()
  where id = v_draft.id
  returning * into v_draft;

  v_event_type := case p_decision
    when 'approve' then 'publish_approved'
    when 'request_changes' then 'changes_requested'
    else 'publish_rejected'
  end;

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    publish_request_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_request.family_id,
    v_request.draft_id,
    v_request.id,
    p_actor_id,
    v_event_type,
    v_request.requested_revision,
    jsonb_build_object('reviewNote', v_request.review_note)
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_request.family_id,
    'draftId', v_request.draft_id,
    'publishRequestId', v_request.id,
    'status', v_request.status,
    'currentRevision', v_draft.revision
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'review_publish',
    trim(p_idempotency_key),
    p_payload_hash,
    v_request.family_id,
    v_request.draft_id,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.publish_template_authoring_draft(
  p_actor_id uuid,
  p_publish_request_id uuid,
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
  v_request public.template_authoring_publish_requests%rowtype;
  v_draft public.template_authoring_drafts%rowtype;
  v_family public.template_authoring_families%rowtype;
  v_version_number integer;
  v_version public.workflow_template_versions%rowtype;
  v_template jsonb;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_actor_id::text || ':publish_draft:' || coalesce(p_idempotency_key, ''),
      0
    )
  );

  select * into v_existing
  from public.template_authoring_command_receipts r
  where r.actor_id = p_actor_id
    and r.operation = 'publish_draft'
    and r.idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    return v_existing.result || jsonb_build_object('outcome', 'replayed');
  end if;

  select * into v_request
  from public.template_authoring_publish_requests r
  where r.id = p_publish_request_id
  for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into v_family
  from public.template_authoring_families f
  where f.id = v_request.family_id
  for update;

  select * into v_draft
  from public.template_authoring_drafts d
  where d.id = v_request.draft_id
  for update;

  if not private.has_template_authoring_family_role(
    v_request.family_id,
    p_actor_id,
    array['publisher']::text[]
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if v_request.status <> 'approved'
     or v_draft.status <> 'approved'
     or v_draft.revision <> v_request.requested_revision
     or coalesce((v_request.validation_summary ->> 'errorCount')::integer, -1) <> 0
     or jsonb_array_length(
       coalesce(
         v_draft.definition -> 'generation' -> 'unresolvedQuestionIds',
         '[]'::jsonb
       )
     ) <> 0 then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if length(trim(coalesce(p_idempotency_key, ''))) not between 8 and 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_draft.definition -> 'template') <> 'object'
     or jsonb_typeof(v_draft.definition -> 'template' -> 'graph') <> 'object'
     or jsonb_typeof(v_draft.definition -> 'template' -> 'documents') <> 'array'
     or jsonb_typeof(v_draft.definition -> 'template' -> 'languages') <> 'array' then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;

  select coalesce(max(t.version_number), 0) + 1
  into v_version_number
  from public.workflow_template_versions t
  where t.template_key = v_family.family_key;

  v_template := jsonb_set(
    jsonb_set(
      jsonb_set(
        v_draft.definition -> 'template',
        '{version}',
        to_jsonb(v_version_number),
        true
      ),
      '{isDraft}',
      'false'::jsonb,
      true
    ),
    '{isActiveVersion}',
    'false'::jsonb,
    true
  );

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
    v_family.family_key,
    v_version_number,
    v_family.name,
    v_family.business_unit_id,
    v_family.department_id,
    v_template -> 'graph',
    v_template -> 'documents',
    array(
      select jsonb_array_elements_text(v_template -> 'languages')
    ),
    jsonb_set(v_template, '{schemaVersion}', '1'::jsonb, true),
    true,
    false,
    v_draft.change_reason,
    p_actor_id,
    statement_timestamp()
  )
  returning * into v_version;

  update public.template_authoring_drafts
  set status = 'published',
      published_version_id = v_version.id,
      updated_at = statement_timestamp()
  where id = v_draft.id;

  update public.template_authoring_publish_requests
  set status = 'published',
      published_version_id = v_version.id,
      published_at = statement_timestamp()
  where id = v_request.id;

  update public.template_authoring_families
  set latest_published_version_id = v_version.id,
      updated_at = statement_timestamp()
  where id = v_family.id;

  insert into public.template_authoring_events (
    family_id,
    draft_id,
    publish_request_id,
    actor_id,
    event_type,
    revision,
    detail
  )
  values (
    v_family.id,
    v_draft.id,
    v_request.id,
    p_actor_id,
    'version_published',
    v_draft.revision,
    jsonb_build_object(
      'publishedVersionId', v_version.id,
      'versionNumber', v_version.version_number
    )
  );

  v_result := jsonb_build_object(
    'outcome', 'applied',
    'familyId', v_family.id,
    'draftId', v_draft.id,
    'publishRequestId', v_request.id,
    'publishedVersionId', v_version.id,
    'versionNumber', v_version.version_number
  );

  insert into public.template_authoring_command_receipts (
    actor_id,
    operation,
    idempotency_key,
    payload_hash,
    family_id,
    draft_id,
    result
  )
  values (
    p_actor_id,
    'publish_draft',
    trim(p_idempotency_key),
    p_payload_hash,
    v_family.id,
    v_draft.id,
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.create_template_authoring_family(
  uuid, text, text, text, text, uuid, uuid, jsonb, jsonb, text
)
from public, anon, authenticated;
revoke all on function public.create_template_authoring_draft(
  uuid, uuid, text, text, jsonb, jsonb, text
)
from public, anon, authenticated;
revoke all on function public.replace_template_authoring_draft(
  uuid, uuid, bigint, text, text, jsonb, jsonb, text
)
from public, anon, authenticated;
revoke all on function public.request_template_authoring_publish(
  uuid, uuid, bigint, text, text, text, jsonb
)
from public, anon, authenticated;
revoke all on function public.review_template_authoring_publish(
  uuid, uuid, text, text, text, text
)
from public, anon, authenticated;
revoke all on function public.publish_template_authoring_draft(
  uuid, uuid, text, text
)
from public, anon, authenticated;

grant execute on function public.create_template_authoring_family(
  uuid, text, text, text, text, uuid, uuid, jsonb, jsonb, text
)
to service_role;
grant execute on function public.create_template_authoring_draft(
  uuid, uuid, text, text, jsonb, jsonb, text
)
to service_role;
grant execute on function public.replace_template_authoring_draft(
  uuid, uuid, bigint, text, text, jsonb, jsonb, text
)
to service_role;
grant execute on function public.request_template_authoring_publish(
  uuid, uuid, bigint, text, text, text, jsonb
)
to service_role;
grant execute on function public.review_template_authoring_publish(
  uuid, uuid, text, text, text, text
)
to service_role;
grant execute on function public.publish_template_authoring_draft(
  uuid, uuid, text, text
)
to service_role;
