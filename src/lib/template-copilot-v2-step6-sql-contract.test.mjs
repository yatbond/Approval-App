import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";

const sql = await readFile(new URL("../../supabase/migrations/20260728113000_template_copilot_v2_authoring_modes.sql", import.meta.url), "utf8");

function body() {
  const start = sql.indexOf("create or replace function public.switch_template_copilot_v2_mode(");
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open, "mode-switch RPC must be defined");
  return sql.slice(open + 5, close);
}

test("Step 6 mode migration parses and keeps snapshots private", async () => {
  const [ast, plpgsql] = await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.ok(ast.stmts.length >= 8);
  assert.ok(plpgsql.plpgsql_funcs.length >= 4);
  assert.match(sql, /create table if not exists public\.template_copilot_v2_authoring_modes/i);
  assert.match(sql, /alter table public\.template_copilot_v2_authoring_modes enable row level security/i);
  assert.match(sql, /revoke all on public\.template_copilot_v2_authoring_modes from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant select on public\.template_copilot_v2_authoring_modes to authenticated/i);
  assert.match(sql, /mode text not null check \(mode in \('describe_everything','similar_template'\)\)/i);
  assert.match(sql, /claim_expires_at timestamptz not null/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|all)[^;]*template_copilot_v2_mode_commands[^;]*service_role/i);
  assert.match(sql, /pg_column_size\(source_snapshot\) <= 1048576/i);
  assert.doesNotMatch(sql, /check \(\(mode = 'similar_template'\) = \(source_snapshot is not null\)\)/i);
  for (const operation of ["special_decision", "candidate_extraction", "candidate_confirmation", "resolve_extraction_conflict", "mode_switch"]) {
    assert.match(sql, new RegExp(`'${operation}'`));
  }
});

test("mode switch is owner-locked, revisioned, idempotent, snapshot-immutable, and cannot mutate the ledger", () => {
  const fn = body();
  assert.match(fn, /for update/);
  assert.match(fn, /s\.owner_id is distinct from p_actor_id/);
  assert.match(fn, /template_copilot_v2_operation_receipts/);
  assert.match(fn, /s\.revision <> p_expected_revision/);
  assert.match(fn, /p_source_snapshot is not null and exists/);
  assert.match(fn, /source_snapshot is not null and m\.source_snapshot is distinct from p_source_snapshot/);
  assert.match(fn, /\(p_mode = 'similar_template'\) <> \(p_source_snapshot is not null\)/);
  assert.match(fn, /p_ledger is distinct from s\.ledger/);
  assert.match(fn, /revision = revision \+ 1/);
  assert.match(fn, /'mode_switch'/);
  for (const outcome of ["replayed", "idempotency_conflict", "stale_revision", "invalid_transition", "applied"]) {
    assert.match(fn, new RegExp(`'${outcome}'`), `mode switch must audit ${outcome}`);
  }
  assert.match(sql, /revoke all on function public\.switch_template_copilot_v2_mode\([^\n]+\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.switch_template_copilot_v2_mode\([^\n]+\) to service_role/i);
});

test("similar import is a single owner-locked candidate-and-snapshot transaction", () => {
  assert.match(sql, /create or replace function public\.import_template_copilot_v2_similar_mode/i);
  assert.match(sql, /public\.apply_template_copilot_v2_extraction\(p_actor_id,p_session_id,p_expected_revision,p_idempotency_key,p_command_hash,'candidate_extraction'/i);
  assert.match(sql, /source_snapshot_immutable/i);
  assert.match(sql, /e\.value->>'messageId' is distinct from source_id/i);
  assert.match(sql, /old_conflict_count/i);
  assert.match(sql, /where n > old_conflict_count and e\.value->>'messageId' is distinct from source_id/i);
  assert.match(sql, /insert into public\.template_copilot_v2_authoring_modes/i);
  assert.match(sql, /if p_ledger is not distinct from s\.ledger then/i);
  assert.match(sql, /'no_candidates'/i);
  assert.match(sql, /revoke all on function public\.import_template_copilot_v2_similar_mode/i);
});

test("describe commands are prepared once, claimed once, then replay their fixed terminal branch", () => {
  assert.match(sql, /create table if not exists public\.template_copilot_v2_mode_commands/i);
  assert.match(sql, /create or replace function public\.prepare_template_copilot_v2_mode_command/i);
  assert.match(sql, /create or replace function public\.finalize_template_copilot_v2_mode_command/i);
  assert.match(sql, /c\.state='finalized'/i);
  assert.match(sql, /c\.response->>'outcome' in \('applied','guided_fallback'\)/i);
  assert.match(sql, /return c\.response;/i);
  assert.match(sql, /c\.claim_token is distinct from p_claim_token/i);
  assert.match(sql, /c\.claim_expires_at <= clock_timestamp\(\)/i);
  assert.match(sql, /claim_expires_at=clock_timestamp\(\)\+interval '2 minutes'/i);
  assert.match(sql, /values\(p_session_id,p_actor_id,message_id,'user',p_user_message/i);
  assert.match(sql, /values\(p_session_id,p_actor_id,c\.source_message_id,'assistant',assistant_message/i);
  assert.match(sql, /char_length\(content\) between 1 and 80000/i);
  assert.match(sql, /char_length\(coalesce\(p_user_message,''\)\) not between 1 and 80000/i);
  assert.match(sql, /pg_get_functiondef\('public\.apply_template_copilot_v2_extraction/i);
  assert.match(sql, /\^\[0-9\]\{1,5\}\$/i);
  assert.match(sql, /endCodePoint''\)::integer > 80000/i);
  assert.match(sql, /p_mode not in \('describe_everything','similar_template'\)/i);
  assert.match(sql, /p_source_kind not in \('narrative','document','similar_difference'\)/i);
  assert.match(sql, /\(p_mode='similar_template'\) is distinct from \(p_source_kind='similar_difference'\)/i);
  assert.match(sql, /p_source_kind='document'[\s\S]+jsonb_array_length\(s\.ledger->'requirementDocumentExtracts'\) >= 5/i);
  assert.match(sql, /'outcome','document_limit'/i);
  assert.match(sql, /p_mode = 'similar_template' and not exists/i);
  assert.match(sql, /and m\.source_snapshot is not null/i);
  assert.match(sql, /p_outcome in \('applied','no_candidates'\) and p_mode is distinct from c\.mode/i);
  assert.match(sql, /p_outcome not in \('applied','no_candidates','guided_fallback'\)/i);
  assert.match(sql, /source_kind text not null check \(source_kind in \('narrative','document','similar_difference'\)\)/i);
  assert.match(sql, /c\.source_kind='document'/i);
  assert.match(sql, /new_document->>'text' is distinct from source_text/i);
  assert.match(sql, /values\(p_session_id,p_actor_id,'guided'\) on conflict/i);
  assert.match(sql, /'entryMode',c\.mode/i);
  assert.match(sql, /values\(p_session_id,p_actor_id,'guided'\) on conflict/i);
  assert.match(sql, /jsonb_build_object\('mode','guided','sourceSnapshot',m\.source_snapshot\)/i);
  assert.match(sql, /prepare_template_copilot_v2_mode_command\(uuid,uuid,bigint,text,text,text,text,text\)/i);
});
