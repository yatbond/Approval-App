import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, parsePlPgSQL } from "libpg-query";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
  templateCopilotFactDefinitions,
  templateCopilotFactIds,
} from "./template-copilot-facts.ts";

const sql = await readFile(new URL("../../supabase/migrations/20260728000000_template_copilot_v2_fact_delta.sql", import.meta.url), "utf8");
const flag = { enabled: true };
const actorId = "33333333-3333-4333-8333-333333333333";
const confirmedAt = "2026-07-28T00:00:00.000Z";
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts Payable",
};
const optionalFactId = "attachments.requirements";
const attachmentA = [{ label: "Receipt", required: true, formats: ["pdf"] }];
const attachmentB = [{ label: "Supporting document", required: false, formats: ["image"] }];
const provenance = [{ kind: "human_editor", sourceId: "matrix:test", sourceMessageIds: [] }];

function mutationBody() {
  const start = sql.indexOf("create or replace function public.mutate_template_copilot_v2_fact_delta(");
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open);
  return sql.slice(open + 5, close);
}

function functionBody(functionName) {
  const start = sql.indexOf(`create or replace function ${functionName}(`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("\n$$;", open);
  assert.ok(start >= 0 && open >= 0 && close > open, `${functionName} must exist`);
  return sql.slice(open + 5, close);
}

function sqlTransitionMatrix() {
  const match = sql.match(/\$v2_fact_transition_matrix\$\s*(\{[\s\S]*?\})\s*\$v2_fact_transition_matrix\$/);
  assert.ok(match, "the SQL transition helper must expose its executable matrix");
  return JSON.parse(match[1]);
}

function sqlStaleStateMatrix() {
  const match = sql.match(/\$v2_stale_state_matrix\$\s*(\{[\s\S]*?\})\s*\$v2_stale_state_matrix\$/);
  assert.ok(match, "the SQL stale-history validator must expose its executable state matrix");
  return JSON.parse(match[1]);
}

function apply(ledger, transition, factId = optionalFactId) {
  return applyTemplateCopilotV2FactTransition({
    ledger,
    factId,
    transition,
    actorId,
    confirmedAt,
    flag,
  });
}

function optionalLedgerInState(status) {
  const base = createTemplateCopilotV2Ledger(scope, flag);
  if (status === "unresolved") return base;
  if (status === "candidate") {
    return apply(base, { operation: "record_candidate", payload: { canonicalValue: attachmentA, provenance } });
  }
  if (status === "unknown") return apply(base, { operation: "mark_unknown" });
  if (status === "committed") {
    return apply(base, { operation: "human_commit", payload: { canonicalValue: attachmentA, provenance } });
  }
  if (status === "not_applicable") {
    return apply(base, { operation: "mark_not_applicable", reason: "No attachments are used." });
  }
  const candidate = apply(base, { operation: "record_candidate", payload: { canonicalValue: attachmentA, provenance } });
  return apply(candidate, { operation: "record_candidate", payload: { canonicalValue: attachmentB, provenance } });
}

function commandFor(operation) {
  if (operation === "mark_unknown") return { operation };
  if (operation === "mark_not_applicable") return { operation, reason: "Corrected applicability." };
  return { operation, payload: { canonicalValue: attachmentB, provenance } };
}

function staleShapeAllowed(snapshot, matrix) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const baseKeys = ["invalidatedBy", "invalidatedAt", "status", "provenance"];
  const optionalKeys = ["canonicalValue", "originalWording", "confirmation", "notApplicableReason", "conflictValues", "conflictEvidence"];
  if (Object.keys(snapshot).some((key) => !baseKeys.includes(key) && !optionalKeys.includes(key))) return false;
  if (baseKeys.some((key) => !(key in snapshot))) return false;
  const rules = matrix[snapshot.status];
  if (!rules) return false;
  if (rules.required.some((key) => !(key in snapshot))) return false;
  if (rules.forbidden.some((key) => key in snapshot)) return false;
  if (!Array.isArray(snapshot.provenance) || snapshot.provenance.length < rules.minProvenance || snapshot.provenance.length > rules.maxProvenance) return false;
  if (snapshot.provenance.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    const keys = Object.keys(item);
    if (keys.some((key) => !["kind", "sourceId", "sourceMessageIds", "excerpt", "sha256"].includes(key))) return true;
    if (!["message", "document", "legacy_section", "human_editor"].includes(item.kind)) return true;
    if (typeof item.sourceId !== "string" || item.sourceId !== item.sourceId.trim() || item.sourceId.length < 1 || item.sourceId.length > 128) return true;
    if ("sourceMessageIds" in item && (!Array.isArray(item.sourceMessageIds) || item.sourceMessageIds.length > 24 || item.sourceMessageIds.some((id) => typeof id !== "string" || id !== id.trim() || id.length < 1 || id.length > 128))) return true;
    return item.kind === "document" && !/^[0-9a-f]{64}$/.test(item.sha256 || "");
  })) return false;
  if ("confirmation" in snapshot) {
    const confirmation = snapshot.confirmation;
    if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) return false;
    if (!rules.confirmationOperations.includes(confirmation.operation)) return false;
    if (!/^[0-9a-f-]{36}$/i.test(confirmation.actorId || "") || Number.isNaN(Date.parse(confirmation.confirmedAt || ""))) return false;
  }
  if ("notApplicableReason" in snapshot && (typeof snapshot.notApplicableReason !== "string" || snapshot.notApplicableReason !== snapshot.notApplicableReason.trim() || snapshot.notApplicableReason.length < 1 || snapshot.notApplicableReason.length > 1000)) return false;
  if (snapshot.status === "conflicting") {
    if (!Array.isArray(snapshot.conflictValues) || !Array.isArray(snapshot.conflictEvidence)) return false;
    if (snapshot.conflictValues.length < 2 || snapshot.conflictValues.length > 4 || snapshot.conflictValues.length !== snapshot.conflictEvidence.length) return false;
    if (JSON.stringify(snapshot.canonicalValue) !== JSON.stringify(snapshot.conflictValues[0])) return false;
    if (snapshot.conflictValues.some((value, index) => JSON.stringify(value) !== JSON.stringify(snapshot.conflictEvidence[index]?.canonicalValue))) return false;
  }
  return true;
}

test("Step 5 SQL parses as PostgreSQL and PL/pgSQL", async () => {
  const [ast, plpgsql] = await Promise.all([parse(sql), parsePlPgSQL(sql)]);
  assert.ok(ast.stmts.length >= 18);
  assert.ok(plpgsql.plpgsql_funcs.length >= 8, "private validators plus the locked public mutation must parse");
});

test("the executable SQL matrix exactly matches every domain state/action pair", () => {
  const matrix = sqlTransitionMatrix();
  const operations = [
    "record_candidate",
    "human_commit",
    "human_replace",
    "resolve_conflict",
    "mark_unknown",
    "mark_not_applicable",
  ];
  const statuses = ["unresolved", "candidate", "unknown", "committed", "not_applicable", "conflicting"];

  assert.deepEqual(Object.keys(matrix), operations, "SQL must use the domain operation names and no aliases");
  for (const operation of operations) {
    for (const status of statuses) {
      const expectedAllowed = matrix[operation].includes(status);
      let actualAllowed = true;
      try {
        apply(optionalLedgerInState(status), commandFor(operation));
      } catch {
        actualAllowed = false;
      }
      assert.equal(actualAllowed, expectedAllowed, `${operation} from ${status}`);
    }
  }
});

test("coded applicability is part of the SQL/domain transition matrix", () => {
  const alwaysFactId = "workflow.name";
  const base = createTemplateCopilotV2Ledger(scope, flag);
  assert.throws(
    () => apply(base, { operation: "mark_not_applicable", reason: "Not relevant." }, alwaysFactId),
    /cannot be marked not applicable/i,
  );

  const helper = functionBody("private.template_copilot_v2_fact_transition_allowed");
  assert.match(helper, /\(transition_matrix->p_operation\) \? p_current_status/i);
  assert.match(helper, /p_operation <> 'mark_not_applicable' or p_applies_when <> 'always'/i);
  assert.match(sql, /revoke all on function private\.template_copilot_v2_fact_transition_allowed\(text,text,text\) from public, anon, authenticated/i);
});

test("every newly permitted correction retains its superseded fact snapshot", () => {
  let ledger = apply(
    createTemplateCopilotV2Ledger(scope, flag),
    { operation: "human_commit", payload: { canonicalValue: attachmentA, provenance } },
  );
  ledger = apply(ledger, { operation: "mark_not_applicable", reason: "Attachments were believed unnecessary." });
  assert.equal(ledger.facts[optionalFactId].staleHistory.at(-1).status, "committed");
  assert.deepEqual(ledger.facts[optionalFactId].staleHistory.at(-1).canonicalValue, attachmentA);

  ledger = apply(ledger, { operation: "mark_not_applicable", reason: "Corrected N/A rationale." });
  assert.equal(ledger.facts[optionalFactId].staleHistory.at(-1).status, "not_applicable");
  assert.equal(ledger.facts[optionalFactId].staleHistory.at(-1).notApplicableReason, "Attachments were believed unnecessary.");

  ledger = apply(ledger, { operation: "mark_unknown" });
  assert.equal(ledger.facts[optionalFactId].staleHistory.at(-1).notApplicableReason, "Corrected N/A rationale.");

  ledger = apply(ledger, { operation: "human_replace", payload: { canonicalValue: attachmentB, provenance } });
  assert.equal(ledger.facts[optionalFactId].status, "committed");
  assert.equal(ledger.facts[optionalFactId].confirmation.operation, "human_replace");
  assert.equal(ledger.facts[optionalFactId].staleHistory.at(-1).status, "unknown");

  const body = mutationBody();
  assert.equal(
    (body.match(/private\.template_copilot_v2_append_stale\(/gi) || []).length,
    6,
    "five correcting operations and dependent invalidation must use the same bounded history helper",
  );
});

test("stale-history SQL enforces the exact valid state matrix and rejects malformed snapshots", () => {
  const matrix = sqlStaleStateMatrix();
  assert.deepEqual(matrix, {
    candidate: {
      required: ["canonicalValue"],
      forbidden: ["confirmation", "notApplicableReason", "conflictValues", "conflictEvidence"],
      minProvenance: 1,
      maxProvenance: 12,
      confirmationOperations: [],
    },
    committed: {
      required: ["canonicalValue", "confirmation"],
      forbidden: ["notApplicableReason", "conflictValues", "conflictEvidence"],
      minProvenance: 1,
      maxProvenance: 12,
      confirmationOperations: ["human_confirm", "human_replace", "human_resolve_conflict"],
    },
    unknown: {
      required: [],
      forbidden: ["canonicalValue", "confirmation", "notApplicableReason", "conflictValues", "conflictEvidence"],
      minProvenance: 0,
      maxProvenance: 0,
      confirmationOperations: [],
    },
    not_applicable: {
      required: ["confirmation", "notApplicableReason"],
      forbidden: ["canonicalValue", "conflictValues", "conflictEvidence"],
      minProvenance: 0,
      maxProvenance: 0,
      confirmationOperations: ["human_mark_not_applicable"],
    },
    conflicting: {
      required: ["canonicalValue", "conflictValues", "conflictEvidence"],
      forbidden: ["confirmation", "notApplicableReason"],
      minProvenance: 1,
      maxProvenance: 12,
      confirmationOperations: [],
    },
  });

  const base = () => createTemplateCopilotV2Ledger(scope, flag);
  const candidateLedger = apply(base(), { operation: "record_candidate", payload: { canonicalValue: attachmentA, provenance } });
  const committedLedger = apply(base(), { operation: "human_commit", payload: { canonicalValue: attachmentA, provenance } });
  const unknownLedger = apply(base(), { operation: "mark_unknown" });
  const notApplicableLedger = apply(base(), { operation: "mark_not_applicable", reason: "No attachments." });
  const firstCandidate = apply(base(), { operation: "record_candidate", payload: { canonicalValue: attachmentA, provenance } });
  const conflictLedger = apply(firstCandidate, { operation: "record_candidate", payload: { canonicalValue: attachmentB, provenance } });
  const snapshots = {
    candidate: apply(candidateLedger, { operation: "mark_unknown" }).facts[optionalFactId].staleHistory.at(-1),
    committed: apply(committedLedger, { operation: "mark_unknown" }).facts[optionalFactId].staleHistory.at(-1),
    unknown: apply(unknownLedger, { operation: "mark_not_applicable", reason: "No attachments." }).facts[optionalFactId].staleHistory.at(-1),
    not_applicable: apply(notApplicableLedger, { operation: "mark_unknown" }).facts[optionalFactId].staleHistory.at(-1),
    conflicting: apply(conflictLedger, { operation: "resolve_conflict", payload: { canonicalValue: attachmentB, provenance } }).facts[optionalFactId].staleHistory.at(-1),
  };
  for (const [status, snapshot] of Object.entries(snapshots)) {
    assert.equal(snapshot.status, status);
    assert.equal(staleShapeAllowed(snapshot, matrix), true, `${status} snapshot must satisfy SQL's executable matrix`);
  }

  const malformed = [];
  const corrupt = (status, label, change) => {
    const snapshot = structuredClone(snapshots[status]);
    change(snapshot);
    malformed.push([label, snapshot]);
  };
  corrupt("not_applicable", "N/A canonical null", (value) => { value.canonicalValue = null; });
  corrupt("not_applicable", "N/A missing reason", (value) => { delete value.notApplicableReason; });
  corrupt("not_applicable", "N/A blank reason", (value) => { value.notApplicableReason = "\t"; });
  corrupt("not_applicable", "N/A wrong confirmation", (value) => { value.confirmation.operation = "human_replace"; });
  corrupt("not_applicable", "N/A provenance", (value) => { value.provenance = provenance; });
  corrupt("committed", "committed missing canonical", (value) => { delete value.canonicalValue; });
  corrupt("committed", "committed empty provenance", (value) => { value.provenance = []; });
  corrupt("committed", "committed missing confirmation", (value) => { delete value.confirmation; });
  corrupt("committed", "committed N/A confirmation", (value) => { value.confirmation.operation = "human_mark_not_applicable"; });
  corrupt("committed", "committed invalid provenance ID", (value) => { value.provenance[0].sourceId = "x".repeat(129); });
  corrupt("candidate", "candidate missing canonical", (value) => { delete value.canonicalValue; });
  corrupt("candidate", "candidate empty provenance", (value) => { value.provenance = []; });
  corrupt("candidate", "candidate confirmation", (value) => { value.confirmation = structuredClone(snapshots.committed.confirmation); });
  corrupt("candidate", "candidate ambiguity field", (value) => { value.ambiguity = "possible"; });
  corrupt("conflicting", "conflict missing alternatives", (value) => { delete value.conflictValues; });
  corrupt("conflicting", "conflict missing evidence", (value) => { delete value.conflictEvidence; });
  corrupt("conflicting", "conflict mismatched evidence", (value) => { value.conflictEvidence[0].canonicalValue = attachmentB; });
  corrupt("conflicting", "conflict confirmation", (value) => { value.confirmation = structuredClone(snapshots.committed.confirmation); });
  corrupt("conflicting", "conflict N/A reason", (value) => { value.notApplicableReason = "No attachments."; });
  corrupt("unknown", "unknown canonical", (value) => { value.canonicalValue = attachmentA; });
  corrupt("unknown", "unknown confirmation", (value) => { value.confirmation = structuredClone(snapshots.committed.confirmation); });
  corrupt("unknown", "unknown N/A reason", (value) => { value.notApplicableReason = "No attachments."; });
  corrupt("unknown", "unknown conflicts", (value) => { value.conflictValues = [attachmentA, attachmentB]; });
  corrupt("unknown", "unknown provenance", (value) => { value.provenance = provenance; });
  corrupt("unknown", "unresolved history status", (value) => { value.status = "unresolved"; });
  corrupt("unknown", "nested stale history", (value) => { value.staleHistory = []; });
  corrupt("unknown", "unknown extra field", (value) => { value.untrusted = true; });
  for (const [label, snapshot] of malformed) {
    assert.equal(staleShapeAllowed(snapshot, matrix), false, label);
  }

  const body = functionBody("private.template_copilot_v2_stale_history_valid");
  assert.match(body, /jsonb_array_length\(p_value\) > 12/i);
  assert.match(body, /for required_key in select value from jsonb_array_elements_text\(rules->'required'\)/i);
  assert.match(body, /for forbidden_key in select value from jsonb_array_elements_text\(rules->'forbidden'\)/i);
  assert.match(body, /template_copilot_v2_provenance_valid\([\s\S]+rules->>'minProvenance'[\s\S]+rules->>'maxProvenance'/i);
  assert.match(body, /jsonb_array_elements_text\(rules->'confirmationOperations'\)[\s\S]+item->'confirmation'->>'operation'/i);
  assert.match(body, /status = 'not_applicable' and private\.template_copilot_v2_fact_definition\(p_fact_id\)->>'appliesWhen' = 'always'/i);
  assert.match(body, /jsonb_array_length\(item->'conflictValues'\) <> jsonb_array_length\(item->'conflictEvidence'\)/i);
  assert.match(body, /item->'canonicalValue' is distinct from item->'conflictValues'->0/i);
  assert.match(body, /item->'conflictValues'->evidence_index[\s\S]+item->'conflictEvidence'->evidence_index->'canonicalValue'/i);
  assert.doesNotMatch(body, /'staleHistory'/i, "nested histories must not be an allowed snapshot key");
});

test("the public mutation delegates transition authority once to the private matrix", () => {
  const body = mutationBody();
  assert.equal((body.match(/private\.template_copilot_v2_fact_transition_allowed\(/gi) || []).length, 1);
  assert.match(body, /template_copilot_v2_fact_transition_allowed\(p_operation,old_entry->>'status',definition->>'appliesWhen'\)/i);
  assert.doesNotMatch(body, /old_entry->>'status' in \(/i, "operation branches must not maintain a second state matrix");
  assert.doesNotMatch(body, /old_entry->>'status' <> 'conflicting'/i, "conflict authority belongs to the shared matrix");
});

test("semantic no-op edits preserve downstream decisions in both domain and SQL authority", () => {
  const fields = [{ label: "Amount", type: "number", required: true, options: [] }];
  let ledger = createTemplateCopilotV2Ledger(scope, flag);
  ledger = apply(
    ledger,
    { operation: "human_commit", payload: { canonicalValue: fields, provenance } },
    "request.fields",
  );
  ledger = apply(
    ledger,
    { operation: "human_commit", payload: { canonicalValue: attachmentA, provenance } },
    optionalFactId,
  );
  ledger = apply(
    ledger,
    { operation: "human_replace", payload: { canonicalValue: fields, provenance } },
    "request.fields",
  );
  assert.equal(ledger.facts[optionalFactId].status, "committed");

  ledger = apply(ledger, { operation: "mark_unknown" }, "workflow.purpose");
  ledger = apply(
    ledger,
    { operation: "human_commit", payload: { canonicalValue: { description: "Invoices", rules: [] }, provenance } },
    "workflow.scope",
  );
  ledger = apply(ledger, { operation: "mark_unknown" }, "workflow.purpose");
  assert.equal(ledger.facts["workflow.scope"].status, "committed");

  const body = mutationBody();
  assert.match(body, /fact_changed := old_entry->>'status' is distinct from new_entry->>'status'[\s\S]+old_entry->'canonicalValue' is distinct from new_entry->'canonicalValue'[\s\S]+old_entry->>'notApplicableReason' is distinct from new_entry->>'notApplicableReason'/i);
  assert.match(body, /if fact_changed then\s+foreach dependent_id in array private\.template_copilot_v2_fact_dependents/i);
});

test("Step 5 mutation is owner-first, locked, revisioned, and service-only", () => {
  const body = mutationBody();
  const owner = body.indexOf("if not found or s.owner_id is distinct from p_actor_id then return jsonb_build_object('outcome','not_found'); end if;");
  const receipt = body.indexOf("from public.template_copilot_v2_operation_receipts");
  assert.ok(owner >= 0 && owner < receipt, "owner resolution must precede receipt inspection");
  assert.match(body, /pg_advisory_xact_lock\(hashtextextended\(p_session_id::text, 0\)\)/i);
  assert.match(body, /for update/i);
  assert.match(body, /s\.revision is distinct from p_expected_revision/i);
  assert.match(body, /idempotency_conflict/i);
  assert.match(body, /private\.audit_template_copilot_v2_fact_attempt/i);
  assert.match(sql, /revoke all on function public\.mutate_template_copilot_v2_fact_delta\(uuid,uuid,bigint,text,text,text,text,jsonb,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.mutate_template_copilot_v2_fact_delta\(uuid,uuid,bigint,text,text,text,text,jsonb,text\) to service_role/i);
  assert.match(sql, /revoke all on function public\.mutate_template_copilot_v2_fact\(uuid,uuid,bigint,text,text,text,text,jsonb,jsonb\) from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]+mutate_template_copilot_v2_fact_delta[\s\S]+to authenticated/i);
});

test("every owned terminal return and caught exception emits exactly one fact-attempt audit", () => {
  const body = mutationBody();
  const lines = body.split("\n");
  const terminalLines = lines.flatMap((line, index) => /\breturn\s+(?:jsonb_build_object|r\.response|response;)/i.test(line) ? [{ line, index }] : []);
  assert.ok(terminalLines.length >= 8, "all shared guards, replay, stale, success, and exception paths must remain visible");
  let auditedReturns = 0;
  for (const terminal of terminalLines) {
    if (terminal.line.includes("'not_found'")) {
      assert.doesNotMatch(lines.slice(0, terminal.index + 1).join("\n"), /audit_template_copilot_v2_fact_attempt/i, "unknown/other-owner sessions must not create an existence-revealing audit");
      continue;
    }
    auditedReturns += 1;
    const previous = lines.slice(0, terminal.index).reverse().find((line) => line.trim().length > 0) || "";
    assert.match(previous, /perform private\.audit_template_copilot_v2_fact_attempt\(/i, `terminal return is missing its one adjacent audit: ${terminal.line.trim()}`);
    const expectedOutcome = terminal.line.includes("'invalid_command'") ? "invalid_command"
      : terminal.line.includes("'idempotency_conflict'") ? "idempotency_conflict"
      : terminal.line.includes("'replayed'") ? "replayed_exact"
      : terminal.line.includes("'stale_revision'") ? "stale_revision"
      : terminal.line.includes("'invalid_transition'") ? "invalid_transition"
      : "applied";
    assert.match(previous, new RegExp(`'${expectedOutcome}'\\);$`, "i"));
  }
  assert.equal((body.match(/perform private\.audit_template_copilot_v2_fact_attempt\(/gi) || []).length, auditedReturns, "no branch may double-audit or audit without terminating");
  assert.match(body, /exception when others then\s+if owner_verified then[\s\S]+audit_template_copilot_v2_fact_attempt[\s\S]+return jsonb_build_object\('outcome','invalid_transition'\)/i);
  assert.doesNotMatch(body, /insert into public\.template_copilot_v2_audit_events/i, "success and rejection paths must share one redaction helper");
});

test("fact-attempt audit helper is bounded, redacted, private, and normalizes hostile identifiers", () => {
  const body = functionBody("private.audit_template_copilot_v2_fact_attempt");
  assert.match(body, /'reject:' \|\| md5\(coalesce\(p_idempotency_key, '<null>'\)\)/i);
  assert.match(body, /md5\('fact-command-1:'[\s\S]+md5\('fact-command-2:'/i);
  assert.match(body, /safe_operation := case[\s\S]+else 'human_replace'/i);
  assert.match(body, /safe_fact_id := case[\s\S]+else null/i);
  assert.match(body, /jsonb_build_object\('schemaVersion',2,'attempt',safe_outcome\)/i);
  assert.doesNotMatch(body, /canonical|p_reason|evidence|sidecar|ledger|originalWording|notApplicableReason/i);
  assert.match(sql, /revoke all on function private\.audit_template_copilot_v2_fact_attempt\(uuid,uuid,text,text,text,text,bigint,bigint,text\) from public, anon, authenticated, service_role/i);
});

test("Step 5 accepts no caller-produced ledger, entry, history, metadata, confirmation, closure, or readiness", () => {
  const signature = sql.slice(sql.indexOf("create or replace function public.mutate_template_copilot_v2_fact_delta("), sql.indexOf(") returns jsonb", sql.indexOf("create or replace function public.mutate_template_copilot_v2_fact_delta(")));
  const body = mutationBody();
  const sourceId = functionBody("private.template_copilot_v2_fact_source_id");
  for (const forbidden of ["p_ledger", "p_fact_entry", "p_invalidated_entries", "p_stale_history", "p_confirmation", "p_provenance", "p_readiness", "p_extraction_evidence"]) assert.doesNotMatch(signature, new RegExp(forbidden, "i"));
  assert.match(signature, /p_fact_id text[\s\S]+p_canonical_value jsonb, p_reason text/i);
  assert.match(sql, /private\.template_copilot_v2_fact_base\(/i);
  assert.match(sql, /jsonb_build_object\('actorId',p_actor_id,'confirmedAt',timestamp_text/i);
  assert.match(sql, /private\.template_copilot_v2_append_stale\(/i);
  assert.match(sourceId, /length\(p_idempotency_key\) <= 123[\s\S]+else md5\(p_idempotency_key\)/i);
  assert.equal((body.match(/private\.template_copilot_v2_fact_source_id\(p_idempotency_key\)/gi) || []).length, 5);
  assert.doesNotMatch(body, /'fact:'\s*\|\|\s*p_idempotency_key/i);
});

test("Step 5 independently validates typed values and canonical metadata before applying the one graph closure", () => {
  const body = mutationBody();
  const validator = functionBody("private.template_copilot_v2_fact_value_valid");
  const entryValidator = functionBody("private.template_copilot_v2_fact_entry_valid");
  const boundedJson = functionBody("private.template_copilot_v2_bounded_json");
  const provenanceValidator = functionBody("private.template_copilot_v2_provenance_valid");
  assert.match(sql, /create or replace function private\.template_copilot_v2_fact_value_valid\(p_fact_id text, p_value jsonb\)/i);
  assert.match(sql, /create or replace function private\.template_copilot_v2_fact_definition\(p_fact_id text\)/i);
  assert.match(sql, /create or replace function private\.template_copilot_v2_fact_dependents\(p_fact_id text\)/i);
  assert.match(validator, /participant->>'mode' in \('fixed_email','directory_position','request_field'\)[\s\S]+not \(participant \? 'value'\)/i);
  assert.match(validator, /participant->>'mode' in \('requester','unassigned_at_template'\) and participant \? 'value'/i);
  assert.match(validator, /participant->>'mode' = 'fixed_email'[\s\S]+position\('\.\.' in participant->>'value'\)[\s\S]+participant->>'value' !~/i);
  assert.match(validator, /p_value->>'action' = 'route_to_stage' and p_value \? 'route'[\s\S]+p_value->>'action' <> 'route_to_stage' and not \(p_value \? 'route'\)/i);
  assert.match(validator, /template_copilot_v2_integer_between\(item->'sequence',1,100\)/i);
  assert.match(validator, /template_copilot_v2_integer_between\(p_value->'defaultDueHours',1,8760\)/i);
  assert.match(validator, /if not private\.template_copilot_v2_bounded_json\(p_value\) then return false/i);
  assert.match(boundedJson, /count\(\*\) <= 200[\s\S]+max\(depth\),0\) <= 8/i);
  assert.match(boundedJson, /jsonb_array_length\(value\) > 100[\s\S]+count\(\*\) from jsonb_object_keys\(value\)\) > 50/i);
  assert.match(boundedJson, /template_copilot_v2_utf16_length\(value #>> '\{\}'\) > 8000[\s\S]+template_copilot_v2_utf16_length\(key\) > 120/i);
  assert.match(provenanceValidator, /template_copilot_v2_bounded_id_array\(item->'sourceMessageIds',0,24\)/i);
  assert.match(entryValidator, /status in \('candidate','committed','conflicting'\)[\s\S]+template_copilot_v2_fact_value_valid\(p_fact_id,p_entry->'canonicalValue'\)[\s\S]+jsonb_array_length\(p_entry->'provenance'\) = 0/i);
  assert.match(entryValidator, /status in \('committed','not_applicable'\)[\s\S]+template_copilot_v2_confirmation_valid/i);
  assert.match(entryValidator, /status = 'conflicting'[\s\S]+template_copilot_v2_conflict_values_valid[\s\S]+template_copilot_v2_conflict_evidence_valid/i);
  assert.match(entryValidator, /template_copilot_v2_stale_history_valid\(p_fact_id,p_entry->'staleHistory'\)/i);
  assert.match(body, /not private\.template_copilot_v2_fact_value_valid\(p_fact_id,p_canonical_value\)/i);
  assert.match(body, /not private\.template_copilot_v2_fact_entry_valid\(s\.ledger->'facts'->fact_id,fact_id,library_version\)/i);
  assert.match(body, /foreach dependent_id in array private\.template_copilot_v2_fact_dependents\(p_fact_id\)/i);
  assert.match(body, /next_ledger := jsonb_set\(s\.ledger,array\['facts',p_fact_id\],new_entry,true\)/i);
  assert.doesNotMatch(body, /p_invalidated_entries|p_fact_entry|p_ledger/i);
});

test("SQL pins the same global canonical complexity boundary rejected by the domain", () => {
  const tooManyNodes = Array.from({ length: 50 }, (_, index) => ({
    label: `Field ${index}`,
    type: "text",
    required: false,
  }));
  assert.throws(
    () => apply(
      createTemplateCopilotV2Ledger(scope, flag),
      { operation: "human_commit", payload: { canonicalValue: tooManyNodes, provenance } },
      "request.fields",
    ),
    /invalid for this field/i,
  );
  assert.match(sql, /create or replace function private\.template_copilot_v2_bounded_id_array\(p_value jsonb, p_min integer, p_max integer\)/i);
  assert.match(sql, /private\.template_copilot_v2_bounded_string\(item,1,128\)/i);
  assert.match(sql, /revoke all on function private\.template_copilot_v2_bounded_json\(jsonb\) from public, anon, authenticated/i);
});

test("SQL rejects null and ECMAScript-whitespace-only canonical strings and N/A reasons", () => {
  const boundedString = functionBody("private.template_copilot_v2_bounded_string");
  const trim = functionBody("private.template_copilot_v2_ecmascript_trim");
  const body = mutationBody();
  assert.match(boundedString, /\(p_value #>> '\{\}'\) = private\.template_copilot_v2_ecmascript_trim\(p_value #>> '\{\}'\)/i);
  for (const codePoint of [9, 10, 11, 12, 13, 32, 160, 5760, 8232, 8233, 8239, 8287, 12288, 65279]) {
    assert.match(trim, new RegExp(`chr\\(${codePoint}\\)`));
  }
  assert.match(body, /p_operation = 'mark_not_applicable' and coalesce\(not private\.template_copilot_v2_bounded_string\(to_jsonb\(p_reason\),1,1000\),true\)/i);
  assert.match(body, /'notApplicableReason',private\.template_copilot_v2_ecmascript_trim\(p_reason\)/i);
  assert.throws(
    () => apply(
      createTemplateCopilotV2Ledger(scope, flag),
      { operation: "human_commit", payload: { canonicalValue: "\t", provenance } },
      "workflow.name",
    ),
    /invalid for this field/i,
  );
  assert.throws(
    () => apply(
      createTemplateCopilotV2Ledger(scope, flag),
      { operation: "mark_not_applicable", reason: "\t" },
    ),
    /invalid for this field/i,
  );
});

test("the database fact graph cannot drift from the pinned TypeScript fact definitions", () => {
  const start = sql.indexOf("create or replace function private.template_copilot_v2_fact_definition");
  const end = sql.indexOf("\n$$;", start);
  const definitionSource = sql.slice(start, end);
  for (const factId of templateCopilotFactIds) {
    const line = definitionSource.split("\n").find((candidate) => candidate.includes(`when '${factId}' then`));
    assert.ok(line, `database definition missing ${factId}`);
    const dependencySource = line.slice(line.indexOf("'dependsOn',") + "'dependsOn',".length);
    const dependencies = [...dependencySource.matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((value) => templateCopilotFactIds.includes(value));
    assert.deepEqual(dependencies, [...templateCopilotFactDefinitions[factId].dependsOn], `dependency drift for ${factId}`);
    assert.match(line, new RegExp(`'appliesWhen','${templateCopilotFactDefinitions[factId].appliesWhen}'`));
    assert.match(line, new RegExp(`'blockingLevel','${templateCopilotFactDefinitions[factId].blockingLevel}'`));
  }
});

test("Step 5 protects open extraction sidecars and leaves all unrelated ledger fields untouched", () => {
  const body = mutationBody();
  assert.match(body, /open_extraction_sidecar/i);
  assert.match(body, /jsonb_array_elements\(s\.ledger->'extractionEvidence'->'candidates'\)/i);
  assert.match(body, /jsonb_array_elements\(s\.ledger->'extractionEvidence'->'conflicts'\)/i);
  assert.match(body, /next_ledger := jsonb_set\(s\.ledger,/i);
  assert.doesNotMatch(body, /next_ledger := p_/i);
});

test("Step 5 has explicit owner, stale, replay, and forged-input rejection gates", () => {
  const body = mutationBody();
  assert.match(body, /if not found or s\.owner_id is distinct from p_actor_id then return jsonb_build_object\('outcome','not_found'\)/i);
  assert.match(body, /return jsonb_build_object\('outcome','stale_revision','currentRevision',s\.revision\)/i);
  assert.match(body, /return r\.response \|\| jsonb_build_object\('outcome','replayed'/i);
  assert.match(body, /p_operation not in \('record_candidate','human_commit','human_replace','mark_unknown','mark_not_applicable','resolve_conflict'\)/i);
  assert.match(body, /p_operation in \('record_candidate','human_commit','human_replace','resolve_conflict'\)\s+and not private\.template_copilot_v2_fact_value_valid/i);
  assert.match(body, /not private\.template_copilot_v2_fact_entry_valid/i);
});

test("Step 5 rollback remains data-preserving: read-only map mode needs no inverse ledger migration", () => {
  assert.match(sql, /no unrelated ledger byte is caller-controlled or changed/i);
  assert.match(sql, /return response;/i);
  assert.match(sql, /response := jsonb_build_object\('outcome','applied'.*'ledger',s\.ledger\)/is);
});
