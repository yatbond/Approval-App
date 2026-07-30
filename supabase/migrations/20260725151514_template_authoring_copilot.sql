-- Persistent, owner-scoped interview state for the embedded template Copilot.
-- Raw requirement documents are never stored here. Only bounded, sanitized
-- extracts may be attached to a session ledger.

create table public.template_copilot_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid references public.template_authoring_families(id) on delete set null,
  draft_id uuid references public.template_authoring_drafts(id) on delete set null,
  status text not null default 'interviewing',
  revision bigint not null default 1,
  ledger jsonb not null,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('interviewing', 'ready', 'draft_created', 'closed')),
  check (revision >= 1),
  check (jsonb_typeof(ledger) = 'object'),
  check (length(model) <= 200)
);

create table public.template_copilot_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.template_copilot_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_message_id text not null,
  role text not null,
  content text not null,
  structured_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, client_message_id, role),
  check (role in ('user', 'assistant')),
  check (length(client_message_id) between 8 and 128),
  check (length(content) between 1 and 16000),
  check (jsonb_typeof(structured_detail) = 'object')
);

create index template_copilot_sessions_owner_idx
on public.template_copilot_sessions (owner_id, updated_at desc);

create index template_copilot_messages_session_idx
on public.template_copilot_messages (session_id, created_at, id);

create index template_copilot_sessions_family_idx
on public.template_copilot_sessions (family_id);

create index template_copilot_sessions_draft_idx
on public.template_copilot_sessions (draft_id);

create index template_copilot_messages_owner_idx
on public.template_copilot_messages (owner_id);

alter table public.template_copilot_sessions enable row level security;
alter table public.template_copilot_messages enable row level security;

create policy "owners and admins read template copilot sessions"
on public.template_copilot_sessions
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_active_approval_admin((select auth.uid()))
);

create policy "owners and admins read template copilot messages"
on public.template_copilot_messages
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_active_approval_admin((select auth.uid()))
);

revoke all privileges on table
  public.template_copilot_sessions,
  public.template_copilot_messages
from public, anon, authenticated;

grant select on table
  public.template_copilot_sessions,
  public.template_copilot_messages
to authenticated;

grant select, insert, update, delete on table
  public.template_copilot_sessions,
  public.template_copilot_messages
to service_role;

create or replace function public.create_template_copilot_session(
  p_actor_id uuid,
  p_client_message_id text,
  p_ledger jsonb,
  p_assistant_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.template_copilot_sessions%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_id and p.is_active
  ) then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  if p_client_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or jsonb_typeof(p_ledger) <> 'object'
    or length(p_assistant_message) not between 1 and 16000
  then
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  insert into public.template_copilot_sessions (owner_id, ledger)
  values (p_actor_id, p_ledger)
  returning * into v_session;

  insert into public.template_copilot_messages (
    session_id, owner_id, client_message_id, role, content
  )
  values (
    v_session.id, p_actor_id, p_client_message_id, 'assistant',
    p_assistant_message
  );

  return jsonb_build_object(
    'outcome', 'applied',
    'sessionId', v_session.id,
    'revision', v_session.revision,
    'status', v_session.status,
    'ledger', v_session.ledger
  );
end;
$$;

create or replace function public.advance_template_copilot_session(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_client_message_id text,
  p_user_message text,
  p_assistant_message text,
  p_ledger jsonb,
  p_status text,
  p_model text,
  p_structured_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.template_copilot_sessions%rowtype;
  v_existing_assistant public.template_copilot_messages%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select *
  into v_session
  from public.template_copilot_sessions s
  where s.id = p_session_id
  for update;

  if not found or v_session.owner_id <> p_actor_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select *
  into v_existing_assistant
  from public.template_copilot_messages m
  where m.session_id = p_session_id
    and m.client_message_id = p_client_message_id
    and m.role = 'assistant';

  if found then
    return jsonb_build_object(
      'outcome', 'replayed',
      'sessionId', v_session.id,
      'revision', v_session.revision,
      'status', v_session.status,
      'ledger', v_session.ledger,
      'assistantMessage', v_existing_assistant.content
    );
  end if;

  if v_session.revision <> p_expected_revision then
    return jsonb_build_object(
      'outcome', 'stale_revision',
      'expectedRevision', p_expected_revision,
      'currentRevision', v_session.revision
    );
  end if;

  if v_session.status not in ('interviewing', 'ready')
    or p_status not in ('interviewing', 'ready')
    or p_client_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    or length(p_user_message) not between 1 and 16000
    or length(p_assistant_message) not between 1 and 16000
    or jsonb_typeof(p_ledger) <> 'object'
    or jsonb_typeof(p_structured_detail) <> 'object'
    or length(coalesce(p_model, '')) > 200
  then
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  insert into public.template_copilot_messages (
    session_id, owner_id, client_message_id, role, content
  )
  values (
    p_session_id, p_actor_id, p_client_message_id, 'user', p_user_message
  );

  insert into public.template_copilot_messages (
    session_id, owner_id, client_message_id, role, content, structured_detail
  )
  values (
    p_session_id, p_actor_id, p_client_message_id, 'assistant',
    p_assistant_message, p_structured_detail
  );

  update public.template_copilot_sessions
  set
    ledger = p_ledger,
    status = p_status,
    model = coalesce(p_model, ''),
    revision = revision + 1,
    updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'outcome', 'applied',
    'sessionId', v_session.id,
    'revision', v_session.revision,
    'status', v_session.status,
    'ledger', v_session.ledger,
    'assistantMessage', p_assistant_message
  );
end;
$$;

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
  if not exists (
    select 1 from public.template_authoring_drafts d
    where d.id = p_draft_id and d.family_id = p_family_id
  ) then
    return jsonb_build_object('outcome', 'invalid_draft');
  end if;

  update public.template_copilot_sessions
  set
    family_id = p_family_id,
    draft_id = p_draft_id,
    status = 'draft_created',
    revision = revision + 1,
    updated_at = now()
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

revoke all on function public.create_template_copilot_session(
  uuid, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.advance_template_copilot_session(
  uuid, uuid, bigint, text, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.link_template_copilot_draft(
  uuid, uuid, bigint, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.create_template_copilot_session(
  uuid, text, jsonb, text
) to service_role;
grant execute on function public.advance_template_copilot_session(
  uuid, uuid, bigint, text, text, text, jsonb, text, text, jsonb
) to service_role;
grant execute on function public.link_template_copilot_draft(
  uuid, uuid, bigint, uuid, uuid
) to service_role;
