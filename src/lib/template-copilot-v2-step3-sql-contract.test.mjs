import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";

const extractionSql = await readFile(
  new URL("../../supabase/migrations/20260727230000_template_copilot_v2_extraction_evidence.sql", import.meta.url),
  "utf8",
);

function extractionBody(sql) {
  const start = sql.search(/create(?:\s+or\s+replace)?\s+function\s+public\.apply_template_copilot_v2_extraction/i);
  assert.ok(start >= 0, "Step 3 extraction RPC is required");
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, "Step 3 extraction RPC body is required");
  return sql.slice(bodyStart + "as $$".length, bodyEnd);
}

test("Step 3 extraction RPC parses and exposes an explicit candidate/conflict resolution command", async () => {
  const [ast, plpgsql] = await Promise.all([parse(extractionSql), parsePlPgSQL(extractionSql)]);
  assert.ok(ast.stmts.length >= 5);
  assert.ok(plpgsql.plpgsql_funcs.length >= 1);
  assert.match(extractionSql, /apply_template_copilot_v2_extraction\(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text\)/);
  for (const parameter of ["p_candidate_id", "p_conflict_id", "p_choice", "p_rationale", "p_human_value"]) {
    assert.match(extractionSql, new RegExp(`\\b${parameter}\\b`), `${parameter} is part of the locked server command`);
  }
});

test("Step 3 SQL binds a closed conflict to exactly one fact and retains immutable history", () => {
  const body = extractionBody(extractionSql);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /for update/);
  assert.match(body, /s\.owner_id is distinct from p_actor_id/);
  assert.match(body, /s\.revision is distinct from p_expected_revision/);
  assert.match(body, /octet_length\(p_ledger::text\) > 12582912/);
  assert.match(body, /p_operation.*candidate_extraction.*candidate_confirm.*resolve_extraction_conflict/s);
  assert.match(body, /extractionEvidence.*history/s);
  assert.match(body, /p_conflict_id/);
  assert.match(body, /p_candidate_id/);
  assert.match(body, /only.*fact|factId.*p_conflict_id|p_conflict_id.*factId/is, "the resolution check must bind conflict identity to its single changed fact");
  assert.match(body, /closed/, "resolution closes evidence rather than deleting it");
  assert.match(body, /p_human_value/);
  assert.match(body, /p_rationale/);
});

test("Step 3 database surface remains service-only and replay/audit-safe", () => {
  const body = extractionBody(extractionSql);
  assert.match(extractionSql, /revoke all on function public\.apply_template_copilot_v2_extraction[\s\S]+from public, anon, authenticated/i);
  assert.match(extractionSql, /grant execute on function public\.apply_template_copilot_v2_extraction[\s\S]+to service_role/i);
  assert.match(body, /template_copilot_v2_operation_receipts/);
  assert.match(body, /idempotency_conflict/);
  assert.match(body, /replayed/);
  assert.match(extractionSql, /template_copilot_v2_audit_events/);
  assert.match(body, /audit_template_copilot_v2_extraction_attempt/);
  assert.match(body, /history.*immutable|immutable.*history/is);
});
