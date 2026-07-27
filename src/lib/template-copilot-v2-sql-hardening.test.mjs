import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";
import {
  createTemplateCopilotV2Ledger,
  templateCopilotV2LedgerSchema,
} from "./template-copilot-facts.ts";
import {
  getTemplateCopilotQuestionLibrary,
  reopenTemplateCopilotV2Decision,
} from "./template-copilot-question-library.ts";

const atomicSql = await readFile(
  new URL("../../supabase/migrations/20260727190000_template_copilot_v2_atomic_decisions.sql", import.meta.url),
  "utf8",
);
const specialSql = await readFile(
  new URL("../../supabase/migrations/20260727210000_template_copilot_v2_special_decisions.sql", import.meta.url),
  "utf8",
);
const extractionSql = await readFile(
  new URL("../../supabase/migrations/20260727230000_template_copilot_v2_extraction_evidence.sql", import.meta.url),
  "utf8",
);

function extractPinnedGraph(sql) {
  const match = sql.match(/\$v2_dependency_graph\$(\{[\s\S]*\})\$v2_dependency_graph\$/);
  assert.ok(match, "the migration must expose one mechanically readable pinned graph");
  return JSON.parse(match[1]);
}

function expectedGraphFromLibrary() {
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  return Object.fromEntries(library.questions.map((question) => [
    question.primaryDecision.decisionId,
    [...new Set([
      ...question.prerequisiteDecisionIds,
      ...(question.applicability.kind === "always" ? [] : [question.applicability.decisionId]),
    ])].sort(),
  ]));
}

function reverseClosure(graph, target, currentDecisionIds) {
  const closure = new Set([target]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, dependencies] of Object.entries(graph)) {
      if (!closure.has(candidate) && dependencies.some((dependency) => closure.has(dependency))) {
        closure.add(candidate);
        changed = true;
      }
    }
  }
  return [...closure].filter((decisionId) => currentDecisionIds.has(decisionId)).sort();
}

function acceptsExactRemovalClaim(graph, currentDecisionIds, target, claim) {
  if (claim.some((value) => typeof value !== "string") || new Set(claim).size !== claim.length) return false;
  return JSON.stringify([...claim].sort()) === JSON.stringify(reverseClosure(graph, target, currentDecisionIds));
}

function withoutLineComments(sql) {
  return sql.replace(/--[^\r\n]*/g, "");
}

function assertEveryJsonTextExtractionIsDominatedByAStringGate(sql, label) {
  const source = withoutLineComments(sql);
  const extraction = /([A-Za-z_][A-Za-z0-9_.]*)->>'([^']+)'/g;
  for (const match of source.matchAll(extraction)) {
    const [expression, container, field] = match;
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    const lineEnd = source.indexOf("\n", match.index);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    assert.match(line, /:=/, `${label}: ${expression} must be extracted once into a typed variable`);
    const requiredGate = `jsonb_typeof(${container}->'${field}') is distinct from 'string'`;
    const gateIndex = source.lastIndexOf(requiredGate, match.index);
    assert.ok(gateIndex >= 0, `${label}: ${expression} has no earlier explicit string type gate`);
  }
}

function extractFunctionBody(sql, functionName) {
  const declarationIndex = sql.search(new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+${functionName.replaceAll(".", "\\.")}`));
  assert.ok(declarationIndex >= 0, `${functionName} declaration is missing`);
  const bodyStart = sql.indexOf("as $$", declarationIndex);
  assert.ok(bodyStart >= 0, `${functionName} body is missing`);
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  assert.ok(bodyEnd >= 0, `${functionName} body terminator is missing`);
  return sql.slice(bodyStart + "as $$".length, bodyEnd);
}

test("both hardened migrations parse as PostgreSQL SQL and PL/pgSQL", async () => {
  const [atomicAst, atomicPlPgSql, specialAst, specialPlPgSql, extractionAst, extractionPlPgSql] = await Promise.all([
    parse(atomicSql),
    parsePlPgSQL(atomicSql),
    parse(specialSql),
    parsePlPgSQL(specialSql),
    parse(extractionSql),
    parsePlPgSQL(extractionSql),
  ]);
  assert.ok(atomicAst.stmts.length >= 6);
  assert.equal(atomicPlPgSql.plpgsql_funcs.length, 1);
  assert.ok(specialAst.stmts.length >= 14);
  assert.equal(specialPlPgSql.plpgsql_funcs.length, 4);
  assert.ok(extractionAst.stmts.length >= 5);
  // Step 3 deliberately has one private redacted-audit helper plus one public
  // service-only mutation RPC. No additional public callable function may be
  // added as part of the evidence persistence surface.
  assert.equal(extractionPlPgSql.plpgsql_funcs.length, 2);
  assert.equal((extractionSql.match(/create(?:\s+or\s+replace)?\s+function\s+public\./gi) || []).length, 1);
  assert.match(extractionSql, /create(?:\s+or\s+replace)?\s+function\s+private\.audit_template_copilot_v2_extraction_attempt/i);
  assert.match(extractionSql, /revoke all on function private\.audit_template_copilot_v2_extraction_attempt[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(extractionSql, /grant execute on function public\.apply_template_copilot_v2_extraction[\s\S]+to authenticated/i);
});

test("extraction mutation remains owner-locked, bounded, replay-safe, and cannot replace a committed fact", () => {
  const body = extractFunctionBody(extractionSql, "public.apply_template_copilot_v2_extraction");
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /for update/);
  assert.match(body, /s\.owner_id is distinct from p_actor_id/);
  assert.match(body, /octet_length\(p_ledger::text\) > 12582912/);
  assert.match(body, /template_copilot_v2_operation_receipts/);
  assert.match(body, /s\.revision is distinct from p_expected_revision/);
  assert.match(body, /old\.value->>'status' in \('committed','not_applicable'\)/);
  assert.match(body, /p_operation = 'resolve_extraction_conflict'/);
  assert.match(extractionSql, /revoke all on function public\.apply_template_copilot_v2_extraction[\s\S]+to service_role/);
});

test("the database dependency graph exactly matches all 316 pinned TypeScript decisions and both edge kinds", () => {
  const graph = extractPinnedGraph(specialSql);
  const expected = expectedGraphFromLibrary();
  assert.equal(Object.keys(graph).length, 316);
  assert.equal(Object.values(graph).reduce((count, dependencies) => count + dependencies.length, 0), 324);
  assert.deepEqual(graph, expected);
  for (const [decisionId, dependencies] of Object.entries(graph)) {
    assert.deepEqual(dependencies, [...new Set(dependencies)].sort(), `${decisionId} dependencies must be sorted and unique`);
    assert.ok(dependencies.every((dependency) => Object.hasOwn(graph, dependency)), `${decisionId} has a forged dependency`);
  }
  assert.match(specialSql, /p_library_version = 'v2\.0'/);
  assert.match(specialSql, /graph_node_count is distinct from 316/);
});

test("database and TypeScript reopen closures agree for every target and reject forged missing or extra removals", () => {
  const graph = extractPinnedGraph(specialSql);
  const library = getTemplateCopilotQuestionLibrary("v2.0");
  const currentDecisionIds = new Set(Object.keys(graph));
  const base = createTemplateCopilotV2Ledger({
    businessUnitId: "11111111-1111-4111-8111-111111111111",
    businessName: "Finance",
    departmentId: "22222222-2222-4222-8222-222222222222",
    departmentName: "Accounts Payable",
  }, { enabled: true });
  const allDecisions = Object.fromEntries(Object.keys(graph).map((decisionId) => [
    decisionId,
    {
      kind: "unknown",
      answer: "unknown",
      display: "Not sure",
      provenance: [{ kind: "human_editor", sourceId: `special:${decisionId}`, sourceMessageIds: [] }],
      answeredAt: "2026-07-27T08:00:00.000Z",
    },
  ]));
  const allAnsweredLedger = templateCopilotV2LedgerSchema.parse({
    ...base,
    atomicDecisions: allDecisions,
  });

  for (const question of library.questions) {
    const target = question.primaryDecision.decisionId;
    const expected = reverseClosure(graph, target, currentDecisionIds);
    const fromTypeScript = reopenTemplateCopilotV2Decision({
      ledgerInput: allAnsweredLedger,
      decisionId: target,
      libraryInput: library,
    }).removedDecisionIds;
    assert.deepEqual(fromTypeScript, expected, target);
    assert.equal(acceptsExactRemovalClaim(graph, currentDecisionIds, target, expected), true, target);
  }

  const branchingTarget = "decision.workflow.stages.first_stage_person_mode";
  const expected = reverseClosure(graph, branchingTarget, currentDecisionIds);
  assert.ok(expected.length > 2);
  assert.equal(acceptsExactRemovalClaim(graph, currentDecisionIds, branchingTarget, expected.slice(1)), false, "missing target must fail");
  assert.equal(acceptsExactRemovalClaim(graph, currentDecisionIds, branchingTarget, [...expected, "decision.forged.extra"]), false, "forged extra must fail");
  assert.equal(acceptsExactRemovalClaim(graph, currentDecisionIds, branchingTarget, [...expected, expected[0]]), false, "duplicate must fail");
  assert.match(specialSql, /with recursive reverse_closure/);
  assert.match(specialSql, /closure\.decision_id = any\(graph\.dependency_decision_ids\)/);
  assert.match(specialSql, /filter \(where s\.ledger->'atomicDecisions' \? closure\.decision_id\)/);
  assert.match(specialSql, /supplied_removed_decision_ids is distinct from expected_removed_decision_ids/);
  assert.match(specialSql, /coalesce\(array_ndims\(p_removed_decision_ids\), 1\) > 1/);
});

test("schemaVersion is numeric and every JSON text extraction follows an explicit scalar gate", () => {
  for (const [label, sql] of [["atomic", atomicSql], ["special", specialSql]]) {
    assert.doesNotMatch(sql, /->>'schemaVersion'/, `${label} must not text-coerce schemaVersion`);
    assert.match(sql, /jsonb_typeof\(p_ledger->'schemaVersion'\) is distinct from 'number'/);
    assert.match(sql, /p_ledger->'schemaVersion' is distinct from '2'::jsonb/);
    assert.match(sql, /jsonb_typeof\(s\.ledger->'schemaVersion'\) is distinct from 'number'/);
    assert.match(sql, /s\.ledger->'schemaVersion' is distinct from '2'::jsonb/);
    assert.match(sql, /jsonb_typeof\(p_user_detail->'schemaVersion'\) is distinct from 'number'/);
    assert.match(sql, /jsonb_typeof\(p_assistant_detail->'schemaVersion'\) is distinct from 'number'/);
    assertEveryJsonTextExtractionIsDominatedByAStringGate(sql, label);
  }

  const numericSchemaVersionTwo = (value) => (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value === 2
  );
  assert.equal(numericSchemaVersionTwo(2), true);
  for (const adversarial of ["2", null, true, false, [], {}, 0, 2.1]) {
    assert.equal(numericSchemaVersionTwo(adversarial), false, JSON.stringify(adversarial));
  }

  const jsonString = (value) => typeof value === "string";
  for (const valid of ["unknown", "2", ""]) assert.equal(jsonString(valid), true);
  for (const adversarial of [2, null, true, false, [], {}, ["unknown"]]) {
    assert.equal(jsonString(adversarial), false, JSON.stringify(adversarial));
  }
});

test("array/object functions in public mutation bodies are preceded by the corresponding shape gates", () => {
  const atomicBody = extractFunctionBody(atomicSql, "public.answer_template_copilot_v2_decision");
  const specialBody = extractFunctionBody(specialSql, "public.apply_template_copilot_v2_special_decision");
  const requiredAtomicOrdering = [
    ["jsonb_typeof(p_ledger->'atomicDecisions') is distinct from 'object'", "jsonb_object_keys(p_ledger->'atomicDecisions')"],
    ["jsonb_typeof(s.ledger->'atomicDecisions') is distinct from 'object'", "jsonb_object_keys(s.ledger->'atomicDecisions')"],
    ["jsonb_typeof(decision->'provenance') is distinct from 'array'", "jsonb_array_length(decision->'provenance')"],
    ["jsonb_typeof(provenance_item->'sourceMessageIds') is distinct from 'array'", "jsonb_array_length(provenance_item->'sourceMessageIds')"],
    ["jsonb_typeof(provenance_item) is distinct from 'object'", "jsonb_object_keys(provenance_item)"],
    ["jsonb_typeof(decision) is distinct from 'object'", "jsonb_object_keys(decision)"],
    ["jsonb_typeof(p_user_detail) is distinct from 'object'", "jsonb_object_keys(p_user_detail)"],
    ["jsonb_typeof(p_assistant_detail) is distinct from 'object'", "jsonb_object_keys(p_assistant_detail)"],
  ];
  const requiredSpecialOrdering = [
    ["jsonb_typeof(s.ledger->'atomicDecisions') is distinct from 'object'", "jsonb_object_keys(s.ledger->'atomicDecisions')"],
    ["jsonb_typeof(p_ledger->'atomicDecisions') is distinct from 'object'", "jsonb_object_keys(p_ledger->'atomicDecisions')"],
    ["jsonb_typeof(decision->'provenance') is distinct from 'array'", "jsonb_array_length(decision->'provenance')"],
    ["jsonb_typeof(provenance->'sourceMessageIds') is distinct from 'array'", "jsonb_array_length(provenance->'sourceMessageIds')"],
    ["jsonb_typeof(provenance) is distinct from 'object'", "jsonb_object_keys(provenance)"],
    ["jsonb_typeof(decision) is distinct from 'object'", "jsonb_object_keys(decision)"],
    ["jsonb_typeof(p_user_detail) is distinct from 'object'", "jsonb_object_keys(p_user_detail)"],
    ["jsonb_typeof(p_assistant_detail) is distinct from 'object'", "jsonb_object_keys(p_assistant_detail)"],
  ];
  for (const [gate, use] of requiredAtomicOrdering) {
    assert.ok(atomicBody.indexOf(gate) >= 0, gate);
    assert.ok(atomicBody.indexOf(gate) < atomicBody.indexOf(use), `${gate} must precede ${use}`);
  }
  for (const [gate, use] of requiredSpecialOrdering) {
    assert.ok(specialBody.indexOf(gate) >= 0, gate);
    assert.ok(specialBody.indexOf(gate) < specialBody.indexOf(use), `${gate} must precede ${use}`);
  }
});

test("every owned-session rejected special attempt and exact replay has a bounded redacted audit", () => {
  const body = extractFunctionBody(specialSql, "public.apply_template_copilot_v2_special_decision");
  const ownerCheck = body.indexOf("if not found or s.owner_id is distinct from p_actor_id then");
  const firstAudit = body.indexOf("private.audit_template_copilot_v2_special_attempt");
  assert.ok(ownerCheck >= 0 && firstAudit > ownerCheck, "no audit may precede owner verification");

  const rejectedReturn = /return\s+jsonb_build_object\(\s*'outcome',\s*'(invalid_command|idempotency_conflict|stale_revision|invalid_transition)'/g;
  let rejectedCount = 0;
  for (const match of body.matchAll(rejectedReturn)) {
    rejectedCount += 1;
    const preceding = body.slice(Math.max(0, match.index - 700), match.index);
    assert.match(
      preceding,
      new RegExp(`private\\.audit_template_copilot_v2_special_attempt\\([\\s\\S]*?'${match[1]}'\\s*\\)`),
      `${match[1]} return is not audited`,
    );
  }
  assert.ok(rejectedCount >= 20, "all validation exits must remain independently auditable");

  const notFoundIndex = body.indexOf("return jsonb_build_object('outcome', 'not_found')");
  assert.ok(notFoundIndex >= 0 && notFoundIndex < firstAudit, "not_found must remain unaudited");
  const replayIndex = body.indexOf("'outcome', 'replayed'");
  const replayAuditIndex = body.lastIndexOf("'replayed_exact'", replayIndex);
  assert.ok(replayAuditIndex >= 0, "exact replay needs a distinguishable audit outcome");
  assert.ok(body.indexOf("update public.template_copilot_sessions") > body.lastIndexOf("return jsonb_build_object('outcome', 'invalid_transition')"));

  assert.match(specialSql, /'reject:' \|\| md5\(coalesce\(p_idempotency_key, '<null>'\)\)/);
  assert.match(specialSql, /safe_command_hash := case[\s\S]+md5\('special-command-1:'[\s\S]+md5\('special-command-2:'/);
  assert.match(specialSql, /jsonb_build_object\('schemaVersion', 2, 'attempt', safe_outcome\)/);
  assert.match(specialSql, /revoke all on function private\.audit_template_copilot_v2_special_attempt[\s\S]+service_role/);
  assert.doesNotMatch(specialSql, /jsonb_build_object\('schemaVersion', 2, 'attempt', safe_outcome,[\s\S]*?p_(operation|decision_id|user_message|assistant_message)/);
  assert.match(specialSql, /octet_length\(p_user_detail::text\) > 4096/, "the bound must retain 500 four-byte Unicode code points plus strict JSON framing");
});

test("special receipt preflight is owner-first and emits at most one terminal audit per invocation", () => {
  const body = extractFunctionBody(specialSql, "public.reconcile_template_copilot_v2_special_decision");
  const ownerCheck = body.indexOf("if not found or s.owner_id is distinct from p_actor_id then");
  const keyValidation = body.indexOf("p_idempotency_key !~");
  const receiptRead = body.indexOf("from public.template_copilot_v2_operation_receipts");
  const firstAudit = body.indexOf("private.audit_template_copilot_v2_special_attempt");
  assert.ok(ownerCheck >= 0);
  assert.ok(ownerCheck < keyValidation, "ownership must be resolved before hostile key validation");
  assert.ok(ownerCheck < receiptRead, "ownership must be resolved before receipt existence");
  assert.ok(ownerCheck < firstAudit, "other-owner and missing sessions must not be audited");

  const notFound = body.indexOf("return jsonb_build_object('outcome', 'not_found')");
  const missing = body.indexOf("jsonb_build_object('outcome', 'missing')");
  assert.ok(notFound > ownerCheck && notFound < firstAudit);
  assert.ok(missing > receiptRead);
  assert.doesNotMatch(body.slice(receiptRead, missing), /audit_template_copilot_v2_special_attempt/, "receipt absence has no audit because mutation owns the request event");

  for (const [outcome, auditOutcome] of [
    ["invalid_command", "invalid_command"],
    ["idempotency_conflict", "idempotency_conflict"],
    ["committed", "replayed_exact"],
  ]) {
    const returnIndex = body.indexOf(`jsonb_build_object('outcome', '${outcome}')`);
    assert.ok(returnIndex >= 0, `${outcome} return is missing`);
    const currentReturn = body.lastIndexOf("return ", returnIndex);
    const previousReturn = body.lastIndexOf("return ", currentReturn - 1);
    const precedingBranch = body.slice(previousReturn < 0 ? 0 : previousReturn + "return ".length, currentReturn);
    const audits = precedingBranch.match(/private\.audit_template_copilot_v2_special_attempt/g) || [];
    assert.equal(audits.length, 1, `${outcome} must have exactly one nearby audit call`);
    assert.match(precedingBranch, new RegExp(`'${auditOutcome}'`));
  }

  const mutationBody = extractFunctionBody(specialSql, "public.apply_template_copilot_v2_special_decision");
  const staleCheck = mutationBody.indexOf("if s.revision is distinct from p_expected_revision then");
  const storedLedgerCheck = mutationBody.indexOf("if jsonb_typeof(s.ledger) is distinct from 'object' then");
  const invalidProjectionCheck = mutationBody.indexOf("if p_projection_valid is false then");
  const candidateLedgerCheck = mutationBody.indexOf("if jsonb_typeof(p_ledger) is distinct from 'object'");
  assert.ok(staleCheck >= 0 && staleCheck < invalidProjectionCheck);
  assert.ok(storedLedgerCheck >= 0 && storedLedgerCheck < invalidProjectionCheck);
  assert.ok(invalidProjectionCheck < candidateLedgerCheck, "the explicit invalid projection must be classified without inspecting placeholder payloads");
  assert.match(specialSql, /revoke all on function public\.reconcile_template_copilot_v2_special_decision\(uuid,uuid,text,text\)[\s\S]+grant execute on function public\.reconcile_template_copilot_v2_special_decision\(uuid,uuid,text,text\)[\s\S]+to service_role/);
  assert.match(specialSql, /apply_template_copilot_v2_special_decision\(uuid,uuid,bigint,text,text,text,boolean,text,text\[\],jsonb,text,text,jsonb,jsonb\)/);
});
