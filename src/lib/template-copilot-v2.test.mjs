import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyTemplateCopilotV2FactTransition,
  approveLegacyTemplateCopilotUpgrade,
  classifyTemplateCopilotV2OperationError,
  createTemplateCopilotV2Ledger,
  previewLegacyTemplateCopilotUpgrade,
  templateCopilotFactIds,
  templateCopilotStoredLedgerSchema,
  templateCopilotV2LedgerSchema,
  TemplateCopilotFactTransitionError,
} from "./template-copilot-facts.ts";
import { createTemplateCopilotLedger } from "./template-copilot-ledger.ts";
import { getTemplateCopilotReadiness } from "./template-copilot-readiness.ts";
import { getTemplateCopilotV2Flag, isTemplateCopilotV2Enabled, TemplateCopilotV2DisabledError } from "./template-copilot-v2-feature.ts";

const enabled = { enabled: true };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };
const actorId = "33333333-3333-4333-8333-333333333333";
const confirmedAt = "2026-07-27T08:00:00.000Z";

const values = {
  "workflow.name": "Invoice approval",
  "workflow.purpose": "Route supplier invoices for approval.",
  "workflow.scope": { description: "Invoices", rules: ["Exclude expenses"] },
  "request.initiator_policy": { mode: "any_employee", description: "Employees submit invoices." },
  "request.fields": [{ label: "Amount", type: "currency", required: true }],
  "attachments.requirements": [],
  "workflow.stages": [{ label: "Manager approval", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 }],
  "workflow.conditions": [],
  "workflow.rejection_policy": { action: "return_for_correction" },
  "collaboration.policy": { description: "No shared fulfilment." },
  "timing.rules": {},
  "visibility.policy": { description: "Participants can view progress." },
  "notifications.rules": [],
  "governance.owner": "Finance Operations",
  "governance.policies": ["Finance policy"],
  "governance.retention": { period: "7 years" },
};

function payload(id) { return { canonicalValue: values[id], originalWording: `${id} wording`, provenance: [{ kind: "message", sourceId: `message:${id}`, sourceMessageIds: [`message:${id}`] }] }; }
function committedLedger() {
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  for (const id of templateCopilotFactIds) {
    ledger = applyTemplateCopilotV2FactTransition({ ledger, factId: id, actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: payload(id) } });
  }
  return ledger;
}

test("v2 fact ids and empty ledger are stable and gated", () => {
  assert.throws(() => createTemplateCopilotV2Ledger(scope), TemplateCopilotV2DisabledError);
  assert.deepEqual(createTemplateCopilotV2Ledger(scope, enabled), createTemplateCopilotV2Ledger(scope, enabled));
  assert.deepEqual(Object.keys(createTemplateCopilotV2Ledger(scope, enabled).facts), templateCopilotFactIds);
});

test("fact-specific semantic schemas reject arbitrary executable values", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const invalidName = () => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: { ...payload("workflow.name"), canonicalValue: { arbitrary: true } } } });
  assert.throws(invalidName, TemplateCopilotFactTransitionError);
  try {
    invalidName();
    assert.fail("Expected semantic transition validation to fail.");
  } catch (error) {
    assert.equal(classifyTemplateCopilotV2OperationError(error, "unavailable").status, 409);
  }
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.stages", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: { ...payload("workflow.stages"), canonicalValue: [{ label: "Unsafe" }] } } }));
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: { ...payload("workflow.name"), confirmation: { actorId } } } }));
});

test("explicit transition table protects committed, N/A, and conflicts", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const candidate = applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { ...payload("workflow.name"), canonicalValue: "Invoice approval" } } });
  const committed = applyTemplateCopilotV2FactTransition({ ledger: candidate, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: payload("workflow.name") } });
  assert.equal(committed.facts["workflow.name"].confirmation.actorId, actorId);
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: committed, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { ...payload("workflow.name"), canonicalValue: "Other" } } }));
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: committed, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "mark_unknown" } }));
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "mark_not_applicable", reason: "skip" } }));
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: candidate, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "resolve_conflict", payload: payload("workflow.name") } }));
});

test("candidate evidence is deduplicated, while competing candidates retain both alternatives", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const first = applyTemplateCopilotV2FactTransition({
    ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: " Invoice approval ", provenance: [{ kind: "message", sourceId: "message:first", sourceMessageIds: ["message:first"] }] } },
  });
  assert.equal(first.facts["workflow.name"].canonicalValue, "Invoice approval");
  // Existing v2 rows can predate canonical trimming, so normalize the current
  // stored candidate before comparing it with a new equivalent value too.
  const legacyWhitespace = templateCopilotV2LedgerSchema.parse({ ...first, facts: { ...first.facts, "workflow.name": { ...first.facts["workflow.name"], canonicalValue: " Invoice approval " } } });
  const equivalent = applyTemplateCopilotV2FactTransition({
    ledger: legacyWhitespace, factId: "workflow.name", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "document", sourceId: "document:requirements", sourceMessageIds: [], sha256: "a".repeat(64) }] } },
  });
  assert.equal(equivalent.facts["workflow.name"].status, "candidate");
  assert.equal(equivalent.facts["workflow.name"].canonicalValue, "Invoice approval");
  assert.equal(equivalent.facts["workflow.name"].provenance.length, 2);
  const conflicting = applyTemplateCopilotV2FactTransition({
    ledger: equivalent, factId: "workflow.name", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: "Expense approval", provenance: [{ kind: "message", sourceId: "message:second", sourceMessageIds: ["message:second"] }] } },
  });
  const fact = conflicting.facts["workflow.name"];
  assert.equal(fact.status, "conflicting");
  assert.deepEqual(fact.conflictValues, ["Invoice approval", "Expense approval"]);
  assert.deepEqual(fact.conflictEvidence?.map((evidence) => evidence.canonicalValue), ["Invoice approval", "Expense approval"]);
  assert.equal(fact.conflictEvidence?.[0].provenance.length, 2);
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: conflicting, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: "Third approval", provenance: [{ kind: "message", sourceId: "message:third", sourceMessageIds: ["message:third"] }] } } }));
});

test("dependencies and intrinsic conflicts remain visible in deterministic readiness", () => {
  const complete = committedLedger();
  const first = getTemplateCopilotReadiness(complete, { compilerValid: true, publishedRevisionMatches: true });
  assert.deepEqual(first, getTemplateCopilotReadiness(structuredClone(complete), { compilerValid: true, publishedRevisionMatches: true }));
  assert.deepEqual([first.draft, first.publication, first.activation], ["ready", "ready", "ready"]);
  const dependencyMissing = templateCopilotV2LedgerSchema.parse({ ...complete, facts: { ...complete.facts, "workflow.stages": { ...complete.facts["workflow.stages"], status: "unresolved", canonicalValue: undefined, originalWording: undefined, provenance: [], confirmation: undefined } } });
  const dependencyReadiness = getTemplateCopilotReadiness(dependencyMissing, { compilerValid: true, publishedRevisionMatches: true });
  assert.ok(dependencyReadiness.gaps.some((gap) => gap.factId === "workflow.rejection_policy" && gap.code === "dependency_unresolved"));
  const conflict = applyTemplateCopilotV2FactTransition({
    ledger: applyTemplateCopilotV2FactTransition({ ledger: createTemplateCopilotV2Ledger(scope, enabled), factId: "workflow.stages", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: "Manager approval stage", provenance: [{ kind: "message", sourceId: "message:manager", sourceMessageIds: ["message:manager"] }] } } }),
    factId: "workflow.stages", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: "Director approval stage", provenance: [{ kind: "message", sourceId: "message:director", sourceMessageIds: ["message:director"] }] } },
  });
  const readiness = getTemplateCopilotReadiness(conflict, { compilerValid: true, publishedRevisionMatches: true });
  assert.equal(readiness.draft, "blocked");
  assert.ok(readiness.gaps.some((gap) => gap.factId === "workflow.stages" && gap.code === "conflicting"));
  assert.equal(getTemplateCopilotReadiness(complete).publication, "not_ready");
  assert.equal(getTemplateCopilotReadiness(complete, { compilerValid: true }).activation, "not_ready");
  const conditionsConflict = applyTemplateCopilotV2FactTransition({
    ledger: applyTemplateCopilotV2FactTransition({ ledger: createTemplateCopilotV2Ledger(scope, enabled), factId: "workflow.conditions", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: "Route by amount", provenance: [{ kind: "message", sourceId: "message:amount", sourceMessageIds: ["message:amount"] }] } } }),
    factId: "workflow.conditions", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: "Route by supplier", provenance: [{ kind: "message", sourceId: "message:supplier", sourceMessageIds: ["message:supplier"] }] } },
  });
  const combined = templateCopilotV2LedgerSchema.parse({ ...conditionsConflict, facts: { ...conditionsConflict.facts, "workflow.stages": { ...conditionsConflict.facts["workflow.stages"], status: "unresolved", canonicalValue: undefined, originalWording: undefined, provenance: [], confirmation: undefined } } });
  const combinedReadiness = getTemplateCopilotReadiness(combined, { compilerValid: true, publishedRevisionMatches: true });
  assert.equal(combinedReadiness.publication, "blocked");
  assert.ok(combinedReadiness.gaps.some((gap) => gap.factId === "workflow.conditions" && gap.code === "dependency_unresolved"));
  assert.ok(combinedReadiness.gaps.some((gap) => gap.factId === "workflow.conditions" && gap.code === "conflicting"));
});

test("legacy preview is scope/revision/document/version bound and upgrade creates candidates only", () => {
  const legacy = createTemplateCopilotLedger(scope);
  legacy.sections.identity_scope = { status: "answered", summary: "Supplier onboarding", sourceMessageIds: ["message:legacy-identity"] };
  assert.equal(templateCopilotStoredLedgerSchema.safeParse(legacy).success, true);
  const preview = previewLegacyTemplateCopilotUpgrade({ legacyInput: legacy, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceRevision: 7 });
  const changedRevision = previewLegacyTemplateCopilotUpgrade({ legacyInput: legacy, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceRevision: 8 });
  assert.notEqual(preview.previewHash, changedRevision.previewHash);
  assert.throws(() => approveLegacyTemplateCopilotUpgrade({ legacyInput: legacy, preview, previewHash: "0".repeat(64), flag: enabled }));
  const upgraded = approveLegacyTemplateCopilotUpgrade({ legacyInput: legacy, preview, previewHash: preview.previewHash, flag: enabled });
  assert.equal(upgraded.facts["workflow.name"].status, "candidate");
  assert.equal(Object.values(upgraded.facts).some((fact) => fact.status === "committed"), false);
});

test("v2 routes/RPCs are flag-gated, locked, receipt-bound, and auditable", async () => {
  const startRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/route.ts", import.meta.url), "utf8");
  const factRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/facts/route.ts", import.meta.url), "utf8");
  const upgradeRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/upgrade/route.ts", import.meta.url), "utf8");
  const rpc = await readFile(new URL("../../supabase/migrations/20260726163240_template_copilot_v2_ledger.sql", import.meta.url), "utf8");
  assert.match(startRoute, /isTemplateCopilotV2Enabled\(\)/);
  assert.match(factRoute, /createApprovalServerContext\(request\)/);
  assert.match(factRoute, /templateCopilotV2FactTransitionSchema/);
  assert.match(factRoute, /classifyTemplateCopilotV2OperationError/);
  assert.match(upgradeRoute, /classifyTemplateCopilotV2OperationError/);
  assert.doesNotMatch(factRoute, /instanceof z\.ZodError/);
  assert.doesNotMatch(upgradeRoute, /instanceof z\.ZodError/);
  assert.match(upgradeRoute, /previewTemplateCopilotV1Upgrade/);
  assert.match(rpc, /pg_advisory_xact_lock/);
  assert.match(rpc, /command_hash <> p_command_hash/);
  assert.match(rpc, /template_copilot_v2_operation_receipts/);
  assert.match(rpc, /template_copilot_v2_audit_events/);
  assert.match(rpc, /before_revision/);
  assert.match(rpc, /status <> 'interviewing'/);
  assert.match(rpc, /status not in \('interviewing','ready'\)/);
  assert.match(rpc, /status = 'interviewing'/);
  assert.match(rpc, /on delete restrict/);
  assert.match(rpc, /evidence is immutable/);
  assert.match(rpc, /revoke all on function[\s\S]+to service_role/);
});

test("feature flag is server-safe, explicit, and testable", () => {
  assert.equal(getTemplateCopilotV2Flag({ TEMPLATE_COPILOT_V2: "true" }).enabled, true);
  assert.equal(getTemplateCopilotV2Flag({ TEMPLATE_COPILOT_V2: "TRUE" }).enabled, false);
  assert.equal(isTemplateCopilotV2Enabled({ TEMPLATE_COPILOT_V2: "false" }), false);
});
