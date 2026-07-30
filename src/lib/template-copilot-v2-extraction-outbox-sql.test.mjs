import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";

const sql = await readFile(
  new URL("../../supabase/migrations/20260727235900_template_copilot_v2_answer_extraction_jobs.sql", import.meta.url),
  "utf8",
);

function functionBody(name) {
  const start = sql.indexOf(`create function public.${name}(`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open, `${name} body`);
  return sql.slice(open + 5, close);
}

function tableBody() {
  const start = sql.indexOf("create table public.template_copilot_v2_extraction_jobs (");
  const close = sql.indexOf("\n);", start);
  assert.ok(start >= 0 && close > start);
  return sql.slice(start, close);
}

test("answer extraction outbox parses as PostgreSQL and six PL/pgSQL functions", async () => {
  const [ast, plpgsql] = await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.ok(ast.stmts.length >= 20);
  assert.equal(plpgsql.plpgsql_funcs.length, 6);
});

test("answer, transcript, and message-bound job share one transaction without copying the raw answer", () => {
  const wrapper = functionBody("answer_template_copilot_v2_decision_with_extraction_job");
  const answer = wrapper.indexOf("public.answer_template_copilot_v2_decision(");
  const message = wrapper.indexOf("from public.template_copilot_messages m");
  const job = wrapper.indexOf("insert into public.template_copilot_v2_extraction_jobs");
  assert.ok(answer >= 0 && answer < message && message < job);
  assert.match(wrapper, /m\.session_id = p_session_id[\s\S]*m\.owner_id = p_actor_id[\s\S]*m\.client_message_id = p_idempotency_key[\s\S]*m\.role = 'user'/);
  assert.match(wrapper, /result->>'appliedRevision'/);
  assert.match(wrapper, /result->>'revision'/);
  assert.match(wrapper, /jsonb_typeof\(answer_message\.structured_detail->'answerKind'\) is distinct from 'string'/);
  assert.match(wrapper, /answer_kind := answer_message\.structured_detail->>'answerKind'[\s\S]*answer_kind is distinct from 'text'/);
  assert.match(wrapper, /status in \('retry','failed'\)/);
  assert.match(wrapper, /status = 'processing'[\s\S]*lease_expires_at <= clock_timestamp\(\)/);

  const table = tableBody();
  assert.match(table, /foreign key \(answer_message_id, session_id, owner_id\)[\s\S]*references public\.template_copilot_messages\(id, session_id, owner_id\)/);
  assert.match(table, /unique \(session_id, answer_client_message_id\)/);
  assert.doesNotMatch(table, /\b(answer_text|raw_answer|content)\b/);
});

test("scheduled dequeue leases only due work with SKIP LOCKED and returns opaque bindings", () => {
  const dequeue = functionBody("dequeue_template_copilot_v2_answer_extraction_jobs");
  assert.match(dequeue, /bounded_limit := least\(greatest\(coalesce\(p_limit, 4\), 1\), 8\)/);
  assert.match(dequeue, /j\.status = 'pending'/);
  assert.match(dequeue, /j\.status = 'retry' and j\.next_attempt_at <= claimed_at/);
  assert.match(dequeue, /j\.status = 'processing'[\s\S]*j\.lease_expires_at <= claimed_at/);
  assert.match(dequeue, /for update skip locked/);
  assert.match(dequeue, /limit bounded_limit/);
  assert.match(dequeue, /j\.attempt_count >= 32/);
  assert.match(dequeue, /lease_token = gen_random_uuid\(\)/);
  assert.match(dequeue, /returning j\.id, j\.owner_id, j\.session_id, j\.lease_token/);
  assert.doesNotMatch(dequeue, /template_copilot_messages|answer_client_message_id|candidate_payload|\.content/);
});

test("claims are owner-first, duplicate-worker safe, bounded, and expose only the bound transcript in memory", () => {
  const claim = functionBody("claim_template_copilot_v2_answer_extraction_job");
  const owner = claim.indexOf("if not found or s.owner_id is distinct from p_actor_id");
  const jobRead = claim.indexOf("from public.template_copilot_v2_extraction_jobs");
  const messageRead = claim.indexOf("from public.template_copilot_messages");
  assert.ok(owner >= 0 && owner < jobRead && jobRead < messageRead);
  assert.match(claim, /j\.status = 'processing' and j\.lease_expires_at > claimed_at/);
  assert.match(claim, /j\.lease_token is distinct from p_lease_token[\s\S]*'outcome','busy'/);
  assert.match(claim, /'outcome','claimed'[\s\S]*'attempt',j\.attempt_count/);
  assert.match(claim, /j\.attempt_count >= 32/);
  assert.match(claim, /lease_expires_at = claimed_at \+ interval '1 minute'/);
  assert.match(claim, /\(p_job_id is not null and id = p_job_id\)[\s\S]*answer_client_message_id = p_answer_client_message_id/);
  assert.match(claim, /where id = j\.answer_message_id[\s\S]*and session_id = p_session_id[\s\S]*and owner_id = p_actor_id[\s\S]*client_message_id = j\.answer_client_message_id/);
});

test("private checkpoint and terminal metadata make provider and persistence retries deterministic", () => {
  const checkpoint = functionBody("checkpoint_template_copilot_v2_answer_extraction_job");
  const finish = functionBody("finish_template_copilot_v2_answer_extraction_job");
  const fail = functionBody("fail_template_copilot_v2_answer_extraction_job");
  assert.match(checkpoint, /jsonb_typeof\(p_candidate_payload\) is distinct from 'array'/);
  assert.match(checkpoint, /p_candidate_payload_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(checkpoint, /j\.candidate_payload is distinct from p_candidate_payload/);
  assert.match(checkpoint, /j\.candidate_payload_hash is distinct from p_candidate_payload_hash/);
  assert.match(finish, /p_completion_outcome not in \('no_candidates','applied','replayed','superseded'\)/);
  assert.match(finish, /p_completion_outcome <> 'superseded' and j\.candidate_payload is null/);
  assert.match(finish, /terminal_status := case when p_completion_outcome = 'superseded'/);
  assert.match(fail, /next_status := case when p_retry and j\.attempt_count < 32/);
  assert.match(fail, /interval '15 seconds'/);
  assert.doesNotMatch(tableBody(), /provider_exception|error_message|error_detail/);
});

test("job table and every mutator are inaccessible to browser roles and direct service table writes", () => {
  assert.match(sql, /alter table public\.template_copilot_v2_extraction_jobs enable row level security/);
  assert.match(sql, /revoke all on table public\.template_copilot_v2_extraction_jobs from public, anon, authenticated, service_role/);
  for (const signature of [
    "answer_template_copilot_v2_decision_with_extraction_job\\(uuid,uuid,bigint,text,text,text,jsonb,text,text,text,jsonb,jsonb,boolean\\)",
    "dequeue_template_copilot_v2_answer_extraction_jobs\\(integer,integer\\)",
    "claim_template_copilot_v2_answer_extraction_job\\(uuid,uuid,text,uuid,uuid\\)",
    "checkpoint_template_copilot_v2_answer_extraction_job\\(uuid,uuid,uuid,uuid,jsonb,text\\)",
    "finish_template_copilot_v2_answer_extraction_job\\(uuid,uuid,uuid,uuid,text,bigint\\)",
    "fail_template_copilot_v2_answer_extraction_job\\(uuid,uuid,uuid,uuid,boolean,text\\)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]*template_copilot_v2_extraction_jobs[\s\S]*to\s+(anon|authenticated|service_role)/i);
});
