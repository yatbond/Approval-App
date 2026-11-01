import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";

const sql = await readFile(new URL("../../supabase/migrations/20260727230000_template_copilot_v2_extraction_evidence.sql", import.meta.url), "utf8");

function body() {
  const start = sql.indexOf("create function public.apply_template_copilot_v2_extraction(");
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open);
  return sql.slice(open + 5, close);
}

test("Step 3 extraction authority migration parses as PostgreSQL and PL/pgSQL", async () => {
  const [ast, plpgsql] = await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.ok(ast.stmts.length >= 8);
  assert.equal(plpgsql.plpgsql_funcs.length, 2, "redacted audit helper plus the public locked RPC");
});

test("Step 3 RPC is owner-first, service-only, revisioned, replay-safe, and leaves no not-found audit", () => {
  const source = body();
  const owner = source.indexOf("if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;");
  const receipt = source.indexOf("from public.template_copilot_v2_operation_receipts");
  const audit = source.indexOf("audit_template_copilot_v2_extraction_attempt", owner);
  assert.ok(owner >= 0 && owner < receipt && owner < audit);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /for update/);
  assert.match(source, /s\.revision is distinct from p_expected_revision/);
  assert.match(source, /idempotency_conflict/);
  assert.match(source, /replayed_exact/);
  assert.match(source, /octet_length\(p_ledger::text\) > 12582912/);
  assert.match(sql, /revoke all on function public\.apply_template_copilot_v2_extraction\(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.apply_template_copilot_v2_extraction\(uuid,uuid,bigint,text,text,text,text,text,text,text,jsonb,jsonb,text\) to service_role/);
});

test("Step 3 delta authority keeps scope/history immutable and binds confirm/resolve to one exact evidence ID", () => {
  const source = body();
  assert.match(source, /\(p_ledger - 'facts' - 'extractionEvidence'\) is distinct from \(s\.ledger - 'facts' - 'extractionEvidence'\)/);
  assert.match(source, /Prefix equality prevents array reorder, replacement, removal, or historical forgery/);
  assert.match(source, /new_history_count <> old_history_count \+ 1/);
  assert.match(source, /c->>'candidateId'=p_candidate_id and c->>'state'='open'/);
  assert.match(source, /c->>'candidateId'=p_candidate_id[\s\S]*c->>'state'='confirmed'/);
  assert.match(source, /c->>'conflictId'=p_conflict_id and c->>'state'='open'/);
  assert.match(source, /c->>'conflictId'=p_conflict_id[\s\S]*c->>'state'='closed'/);
  assert.match(source, /f\.key <> target_fact_id/);
  assert.match(source, /p_choice='keep_existing'/);
  assert.match(source, /p_choice='commit_incoming'/);
  assert.match(source, /p_choice='commit_human_value'/);
  assert.match(source, /duplicate_or_overlapping_claim/);
});

test("Step 3 SQL evidence envelope matches the canonical bounded pointer contract", () => {
  const source = body();
  // Empty and 201-item evidence lists take the invalid-candidate terminal path;
  // the upper bound intentionally matches the TypeScript leaf-evidence schema.
  assert.match(source, /jsonb_array_length\(candidate->'evidence'\) not between 1 and 200/);
  assert.match(source, /length\(evidence->>'path'\) not between 1 and 256/);
  assert.match(source, /evidence->>'path' !~ '\^\(\?:\/\$\|\/\(\?:\[A-Za-z0-9_\.\-\]\|~\[01\]\)/);
  assert.match(source, /evidence->>'normalizationRule' not in \('exact','nfkc_trim_collapse','nfkc_trim_collapse_whitespace','enum_lexical','approval_word_to_kind','ordinal_to_sequence','array_position_to_sequence','boolean_lexical','named_attachment_is_required','duration_hours'\)/);
  // Candidate IDs order distinct candidates; ordinality adds the missing
  // same-candidate comparison, so two leaf paths cannot reuse one message span.
  assert.match(source, /with ordinality e1\(value, ordinal1\)/);
  assert.match(source, /c1->>'candidateId' = c2->>'candidateId' and e1\.ordinal1 < e2\.ordinal2/);
  assert.match(source, /e1\.value->>'messageId' = e2\.value->>'messageId'/);
});

test("3D6 SQL permits only a candidate-derived first fact delta and preserves durable candidate conflicts", () => {
  const source = body();
  assert.match(source, /old_fact_entry\.value->>'status' in \('unresolved','unknown'\)/);
  assert.match(source, /p_ledger->'facts'->old_fact_entry\.key->>'status' = 'candidate'/);
  assert.match(source, /'canonicalValue' is not distinct from appended\.value->'value'/);
  assert.match(source, /'originalWording' is not distinct from appended\.value->'originalWording'/);
  assert.match(source, /not \(p_ledger->'facts'->old_fact_entry\.key \? 'confirmation'\)/);
  assert.match(source, /c\.value->'existing' \? 'candidate'/);
  assert.match(source, /c\.value->'existing'->'candidate'->'value' is distinct from c\.value->'existing'->'value'/);
  assert.match(source, /select conflict_item->'incoming' from jsonb_array_elements\(new_conflicts\)/);
  assert.match(source, /select conflict_item->'existing'->'candidate'/);
});

test("3D6 SQL binds ambiguity/conflict confirmation and all keep/incoming history variants", () => {
  const source = body();
  assert.match(source, /candidate->>'ambiguity' <> 'none'/);
  assert.match(source, /open_conflict->>'factId' = candidate->>'factId' and open_conflict->>'state' = 'open'/);
  assert.match(source, /\(new_fact - 'status' - 'confirmation'\) is distinct from \(old_fact - 'status' - 'confirmation'\)/);
  assert.match(source, /history->'incoming' is distinct from candidate/);
  assert.match(source, /p_choice='keep_existing' and old_fact->>'status' = 'candidate'/);
  assert.match(source, /new_fact->'canonicalValue' is distinct from conflict->'existing'->'value'/);
  assert.match(source, /history->'before' is distinct from \(conflict->'existing' - 'candidate'\)/);
  assert.match(source, /history->'existingCandidate' is distinct from conflict->'existing'->'candidate'/);
  assert.match(source, /p_choice='commit_incoming'/);
  assert.match(source, /p_choice='commit_human_value'/);
});

test("3D12 resolution rejects null controls and forged decision metadata", () => {
  const source = body();
  assert.match(source, /coalesce\(p_expected_revision < 1, true\)/);
  assert.match(source, /coalesce\(p_operation not in \('candidate_extraction','candidate_confirmation','resolve_extraction_conflict'\), true\)/);
  assert.match(source, /coalesce\(p_choice not in \('keep_existing','commit_incoming','commit_human_value'\), true\)/);
  assert.match(source, /p_human_value is null or jsonb_typeof\(p_human_value\) not in/);
  assert.match(source, /old_history_count > 128 or new_history_count > 128/);
  // Resolution history mirrors both presence and value of optional request context.
  assert.match(source, /p_rationale is null and history \? 'rationale'/);
  assert.match(source, /p_rationale is not null and history->>'rationale' is distinct from p_rationale/);
  assert.match(source, /p_choice <> 'commit_human_value' and history \? 'humanValue'/);
  // No target-entry metadata can be changed as collateral damage.
  assert.match(source, /new_fact - 'status' - 'canonicalValue' - 'originalWording' - 'provenance' - 'confirmation'\) is distinct from \(old_fact/);
  // An incoming result has evidence-derived model provenance and an action-bound confirmation.
  assert.match(source, /new_fact->'provenance'->0->>'sourceId' <> conflict->'incoming'->'evidence'->0->>'messageId'/);
  assert.match(source, /new_fact->'confirmation'->>'operation' <> 'human_resolve_conflict'/);
  // A human override cannot smuggle incoming wording or model provenance.
  assert.match(source, /new_fact \? 'originalWording'/);
  assert.match(source, /new_fact->'provenance'->0->>'kind' <> 'human_editor'/);
  assert.match(source, /new_fact->'provenance'->0->>'sourceId' <> \('conflict:' \|\| p_conflict_id\)/);
  // N/A conflicts bind their existing value to the durable status, not a missing canonical value.
  assert.match(source, /coalesce\(p_ledger->'facts'->\(c\.value->>'factId'\)->'canonicalValue', to_jsonb\(p_ledger->'facts'->\(c\.value->>'factId'\)->>'status'\)\)/);
  assert.ok(source.includes(String.raw`history->>'confirmedAt' !~ '^\d{4}-\d{2}-\d{2}T'`));
});
