-- A v2 Copilot interview never moved its session to "ready", and draft
-- creation (create-draft / link_template_copilot_draft) requires "ready". This
-- is the single, owner-checked transition. The application proves the
-- interview is complete (every applicable fact terminal) before calling it;
-- the database refuses any ledger that still has an unresolved, candidate or
-- conflicting fact.
create or replace function public.mark_template_copilot_v2_session_ready(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
begin
  select * into s from public.template_copilot_sessions
  where id = p_session_id and owner_id = p_actor_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if s.status = 'ready' then
    return jsonb_build_object('outcome', 'replayed', 'revision', s.revision, 'status', s.status);
  end if;
  if s.revision is distinct from p_expected_revision then
    return jsonb_build_object('outcome', 'stale_revision', 'currentRevision', s.revision);
  end if;
  if s.status is distinct from 'interviewing'
     or jsonb_typeof(s.ledger) is distinct from 'object'
     or s.ledger->'schemaVersion' is distinct from '2'::jsonb
     or jsonb_typeof(s.ledger->'facts') is distinct from 'object' then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if exists (
    select 1 from jsonb_each(s.ledger->'facts') fact(fact_id, entry)
    where fact.entry->>'status' in ('unresolved', 'candidate', 'conflicting')
  ) then
    return jsonb_build_object('outcome', 'invalid_transition', 'reason', 'facts_not_terminal');
  end if;
  update public.template_copilot_sessions
  set status = 'ready', revision = revision + 1, updated_at = now()
  where id = s.id returning * into s;
  return jsonb_build_object('outcome', 'applied', 'revision', s.revision, 'status', s.status);
end;
$$;

revoke all on function public.mark_template_copilot_v2_session_ready(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.mark_template_copilot_v2_session_ready(uuid, uuid, bigint) to service_role;
