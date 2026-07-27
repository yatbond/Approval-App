import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyTemplateCopilotV2FactTransition,
  applyTemplateCopilotV2AtomicDecision,
  approveLegacyTemplateCopilotUpgrade,
  classifyTemplateCopilotV2OperationError,
  createTemplateCopilotV2Ledger,
  previewLegacyTemplateCopilotUpgrade,
  templateCopilotFactIds,
  templateCopilotStoredLedgerSchema,
  templateCopilotV2LedgerSchema,
  TemplateCopilotFactTransitionError,
  templateCopilotV2AtomicDisplayPreview,
} from "./template-copilot-facts.ts";
import { templateCopilotV2SpecialEnvelopeSchema } from "./template-copilot-v2-special-contract.ts";
import { createTemplateCopilotLedger } from "./template-copilot-ledger.ts";
import { getTemplateCopilotReadiness } from "./template-copilot-readiness.ts";
import { getTemplateCopilotV2Flag, isTemplateCopilotV2Enabled, isTemplateCopilotV2Step4Enabled, isTemplateCopilotV2Step5EditingEnabled, TemplateCopilotV2DisabledError } from "./template-copilot-v2-feature.ts";
import { getTemplateCopilotQuestionLibrary, getTemplateCopilotV2InterviewState, validateTemplateCopilotQuestionLibrary } from "./template-copilot-question-library.ts";

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

test("Step 4 has an independent default-off server rollout gate", () => {
  assert.equal(isTemplateCopilotV2Step4Enabled({}), false);
  assert.equal(isTemplateCopilotV2Step4Enabled({ TEMPLATE_COPILOT_V2_STEP4: "false" }), false);
  assert.equal(isTemplateCopilotV2Step4Enabled({ TEMPLATE_COPILOT_V2_STEP4: "true" }), true);
});

test("Step 5 editing is independently default-off and requires an exact server flag", () => {
  assert.equal(isTemplateCopilotV2Step5EditingEnabled({}), false);
  assert.equal(isTemplateCopilotV2Step5EditingEnabled({ TEMPLATE_COPILOT_V2_STEP5_EDITING: "false" }), false);
  assert.equal(isTemplateCopilotV2Step5EditingEnabled({ TEMPLATE_COPILOT_V2_STEP5_EDITING: "true" }), true);
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

test("human correction transitions preserve a bounded stale correction trail", () => {
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  ledger = applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: payload("workflow.name") } });
  ledger = applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt: "2026-07-28T08:00:00.000Z", flag: enabled, transition: { operation: "human_replace", payload: { ...payload("workflow.name"), canonicalValue: "Corrected invoice approval" } } });
  assert.equal(ledger.facts["workflow.name"].staleHistory.at(-1).canonicalValue, "Invoice approval");
  assert.equal(ledger.facts["workflow.name"].staleHistory.at(-1).invalidatedBy, "workflow.name");
});

test("atomic text preserves up to 8000 canonical characters with a Unicode-safe bounded display preview", () => {
  for (const length of [499, 500, 501, 8000]) {
    const text = "x".repeat(length);
    const preview = templateCopilotV2AtomicDisplayPreview(text);
    assert.ok(preview.length <= 500);
    assert.equal(preview, length <= 500 ? text : `${"x".repeat(499)}…`);
  }
  const emojiAtBoundary = "a".repeat(499) + "😀";
  assert.equal(templateCopilotV2AtomicDisplayPreview(emojiAtBoundary), emojiAtBoundary);
  const cjkAndEmoji = "審".repeat(498) + "😀";
  assert.equal(templateCopilotV2AtomicDisplayPreview(cjkAndEmoji), cjkAndEmoji);
  const long = "x".repeat(8000);
  const ledger = applyTemplateCopilotV2AtomicDecision({ ledger: createTemplateCopilotV2Ledger(scope, enabled), decisionId: "decision.workflow.name.name", answer: { kind: "text", text: long }, provenance: [{ kind: "human_editor", sourceId: "answer:long", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
  assert.equal(ledger.atomicDecisions["decision.workflow.name.name"].answer, long);
  assert.equal(ledger.atomicDecisions["decision.workflow.name.name"].display, `${"x".repeat(499)}…`);
  const emoji8000 = "😀".repeat(8000);
  assert.equal(templateCopilotV2AtomicDisplayPreview(emoji8000), `${"😀".repeat(499)}…`);
  const emojiLedger = applyTemplateCopilotV2AtomicDecision({ ledger: createTemplateCopilotV2Ledger(scope, enabled), decisionId: "decision.workflow.name.name", answer: { kind: "text", text: emoji8000 }, provenance: [{ kind: "human_editor", sourceId: "answer:emoji", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled });
  assert.equal(Array.from(emojiLedger.atomicDecisions["decision.workflow.name.name"].answer).length, 8000);
  let invalid;
  assert.throws(() => applyTemplateCopilotV2AtomicDecision({ ledger: createTemplateCopilotV2Ledger(scope, enabled), decisionId: "decision.workflow.name.name", answer: { kind: "text", text: "x".repeat(8001) }, provenance: [{ kind: "human_editor", sourceId: "answer:too-long", sourceMessageIds: [] }], answeredAt: confirmedAt, flag: enabled }), (error) => { invalid = error; return error instanceof TemplateCopilotFactTransitionError; });
  assert.equal(classifyTemplateCopilotV2OperationError(invalid, "unavailable").status, 409);
});

test("atomic decision kinds reject forged cross-field combinations and enforce the Unicode N/A boundary", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const reason500 = "中🙂".repeat(250);
  const reason501 = `${reason500}界`;
  const common = {
    display: "Not applicable",
    provenance: [{ kind: "human_editor", sourceId: "special:not-applicable", sourceMessageIds: [] }],
    answeredAt: confirmedAt,
  };
  const withDecision = (value) => ({
    ...ledger,
    atomicDecisions: { "decision.workflow.scope.excluded": value },
  });
  const parses = (value) => templateCopilotV2LedgerSchema.safeParse(withDecision(value)).success;

  assert.equal(Array.from(reason500).length, 500);
  assert.ok(reason500.length > 500, "the boundary fixture must include astral UTF-16 surrogate pairs");
  const accepted = templateCopilotV2LedgerSchema.safeParse(withDecision({
    kind: "not_applicable",
    answer: "not_applicable",
    reason: reason500,
    ...common,
  }));
  assert.equal(accepted.success, true);
  assert.equal(accepted.data.atomicDecisions["decision.workflow.scope.excluded"].reason, reason500);
  assert.equal(Array.from(reason501).length, 501);
  assert.equal(parses({ kind: "not_applicable", answer: "not_applicable", reason: reason501, ...common }), false);
  const envelope = (reason) => ({ expectedRevision: 1, idempotencyKey: "special:boundary", command: { operation: "not_applicable", reason } });
  assert.equal(templateCopilotV2SpecialEnvelopeSchema.safeParse(envelope(reason500)).success, true);
  assert.equal(templateCopilotV2SpecialEnvelopeSchema.safeParse(envelope(reason501)).success, false);

  assert.equal(parses({ kind: "text", answer: "Text", ...common }), true);
  assert.equal(parses({ kind: "choice", answer: "yes", optionId: "yes", ...common }), true);
  assert.equal(parses({ kind: "unknown", answer: "unknown", ...common }), true);
  assert.equal(parses({ kind: "choice", answer: "no", optionId: "yes", ...common }), false, "choice answer must equal optionId");
  assert.equal(parses({ kind: "choice", answer: "yes", ...common }), false, "choice decisions require optionId");
  assert.equal(parses({ kind: "choice", answer: "yes", optionId: "yes", reason: "forged", ...common }), false, "choice decisions cannot contain a reason");
  assert.equal(parses({ kind: "text", answer: "Text", optionId: "yes", ...common }), false, "text decisions cannot contain optionId");
  assert.equal(parses({ kind: "text", answer: "Text", reason: "forged", ...common }), false, "text decisions cannot contain a reason");
  assert.equal(parses({ kind: "unknown", answer: "something_else", ...common }), false, "unknown has one canonical answer");
  assert.equal(parses({ kind: "unknown", answer: "unknown", optionId: "yes", ...common }), false, "unknown cannot contain optionId");
  assert.equal(parses({ kind: "unknown", answer: "unknown", reason: "forged", ...common }), false, "unknown cannot contain a reason");
  assert.equal(parses({ kind: "not_applicable", answer: "unknown", reason: "Reason", ...common }), false, "N/A has one canonical answer");
  assert.equal(parses({ kind: "not_applicable", answer: "not_applicable", ...common }), false, "N/A requires a reason");
  assert.equal(parses({ kind: "not_applicable", answer: "not_applicable", reason: "Reason", optionId: "yes", ...common }), false, "N/A cannot contain optionId");
  assert.equal(parses({ kind: "text", answer: "Text", extra: true, ...common }), false, "all kind shapes remain strict");
  assert.equal(parses({ kind: "text", answer: "Text", ...common, provenance: [] }), false, "provenance remains required");
  assert.equal(parses({ kind: "text", answer: "Text", ...common, answeredAt: "not-a-timestamp" }), false, "timestamp remains RFC3339");
});

test("explicit transition table protects saved facts from extraction candidates and reserves conflict resolution", () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const candidate = applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { ...payload("workflow.name"), canonicalValue: "Invoice approval" } } });
  const committed = applyTemplateCopilotV2FactTransition({ ledger: candidate, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: payload("workflow.name") } });
  assert.equal(committed.facts["workflow.name"].confirmation.actorId, actorId);
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: committed, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { ...payload("workflow.name"), canonicalValue: "Other" } } }));
  assert.equal(applyTemplateCopilotV2FactTransition({ ledger: committed, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "mark_unknown" } }).facts["workflow.name"].status, "unknown");
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "mark_not_applicable", reason: "skip" } }));
  assert.throws(() => applyTemplateCopilotV2FactTransition({ ledger: candidate, factId: "workflow.name", actorId, confirmedAt, flag: enabled, transition: { operation: "resolve_conflict", payload: payload("workflow.name") } }));
});

test("optional fact correction state/action matrix is executable and preserves every superseded state", () => {
  const factId = "attachments.requirements";
  const firstValue = [];
  const correctedValue = [{ label: "Invoice", required: true, formats: ["pdf"] }];
  const commandPayload = (canonicalValue) => ({ ...payload(factId), canonicalValue });
  const transition = (ledger, operation, canonicalValue = correctedValue, reason = "Does not apply") =>
    applyTemplateCopilotV2FactTransition({
      ledger,
      factId,
      actorId,
      confirmedAt: "2026-07-29T08:00:00.000Z",
      flag: enabled,
      transition: operation === "mark_unknown"
        ? { operation }
        : operation === "mark_not_applicable"
          ? { operation, reason }
          : { operation, payload: commandPayload(canonicalValue) },
    });
  const stateLedger = (state) => {
    const empty = createTemplateCopilotV2Ledger(scope, enabled);
    if (state === "unresolved") return empty;
    if (state === "candidate") return applyTemplateCopilotV2FactTransition({ ledger: empty, factId, actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: commandPayload(firstValue) } });
    if (state === "committed") return applyTemplateCopilotV2FactTransition({ ledger: empty, factId, actorId, confirmedAt, flag: enabled, transition: { operation: "human_commit", payload: commandPayload(firstValue) } });
    if (state === "unknown") return transition(empty, "mark_unknown");
    if (state === "not_applicable") return transition(empty, "mark_not_applicable", correctedValue, "Initial reason");
    const candidate = stateLedger("candidate");
    return applyTemplateCopilotV2FactTransition({ ledger: candidate, factId, actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: commandPayload(correctedValue) } });
  };
  const saveOperation = {
    unresolved: "human_commit",
    candidate: "human_commit",
    committed: "human_replace",
    unknown: "human_commit",
    not_applicable: "human_replace",
    conflicting: "resolve_conflict",
  };
  for (const state of Object.keys(saveOperation)) {
    const source = stateLedger(state);
    const save = transition(source, saveOperation[state]);
    assert.equal(save.facts[factId].status, "committed", `${state} -> save`);
    if (state !== "unresolved") assert.equal(save.facts[factId].staleHistory.at(-1).status, state, `${state} save history`);

    for (const [action, expectedStatus] of [["mark_unknown", "unknown"], ["mark_not_applicable", "not_applicable"]]) {
      if (state === "conflicting") {
        assert.throws(() => transition(source, action), TemplateCopilotFactTransitionError, `${state} -> ${action}`);
      } else {
        const corrected = transition(source, action, correctedValue, state === "not_applicable" ? "Corrected reason" : "Does not apply");
        assert.equal(corrected.facts[factId].status, expectedStatus, `${state} -> ${action}`);
        if (state !== "unresolved") assert.equal(corrected.facts[factId].staleHistory.at(-1).status, state, `${state} ${action} history`);
        if (action === "mark_not_applicable") assert.equal(corrected.facts[factId].notApplicableReason, state === "not_applicable" ? "Corrected reason" : "Does not apply");
      }
    }
  }
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
    ledger: applyTemplateCopilotV2FactTransition({ ledger: createTemplateCopilotV2Ledger(scope, enabled), factId: "workflow.stages", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: [{ label: "Manager approval", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 }], provenance: [{ kind: "message", sourceId: "message:manager", sourceMessageIds: ["message:manager"] }] } } }),
    factId: "workflow.stages", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: [{ label: "Director approval", kind: "approval", participant: { mode: "directory_position", value: "Director" }, sequence: 1 }], provenance: [{ kind: "message", sourceId: "message:director", sourceMessageIds: ["message:director"] }] } },
  });
  const readiness = getTemplateCopilotReadiness(conflict, { compilerValid: true, publishedRevisionMatches: true });
  assert.equal(readiness.draft, "blocked");
  assert.ok(readiness.gaps.some((gap) => gap.factId === "workflow.stages" && gap.code === "conflicting"));
  assert.equal(getTemplateCopilotReadiness(complete).publication, "not_ready");
  assert.equal(getTemplateCopilotReadiness(complete, { compilerValid: true }).activation, "not_ready");
  const conditionsConflict = applyTemplateCopilotV2FactTransition({
    ledger: applyTemplateCopilotV2FactTransition({ ledger: createTemplateCopilotV2Ledger(scope, enabled), factId: "workflow.conditions", actorId, confirmedAt, flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: [{ field: "Amount", operator: ">", value: 50000, matchingRoute: "Director", otherwiseRoute: "Manager" }], provenance: [{ kind: "message", sourceId: "message:amount", sourceMessageIds: ["message:amount"] }] } } }),
    factId: "workflow.conditions", actorId, confirmedAt, flag: enabled,
    transition: { operation: "record_candidate", payload: { canonicalValue: [{ field: "Supplier", operator: "contains", value: "strategic", matchingRoute: "Director", otherwiseRoute: "Manager" }], provenance: [{ kind: "message", sourceId: "message:supplier", sourceMessageIds: ["message:supplier"] }] } },
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
  const identityMapping = preview.mappings.find((mapping) => mapping.sectionId === "identity_scope");
  assert.deepEqual(identityMapping?.factIds, ["workflow.name", "workflow.purpose"]);
  assert.ok(preview.unresolvedFactIds.includes("workflow.scope"));
  assert.throws(() => approveLegacyTemplateCopilotUpgrade({ legacyInput: legacy, preview, previewHash: "0".repeat(64), flag: enabled }));
  const upgraded = approveLegacyTemplateCopilotUpgrade({ legacyInput: legacy, preview, previewHash: preview.previewHash, flag: enabled });
  assert.equal(upgraded.facts["workflow.name"].status, "candidate");
  assert.equal(upgraded.facts["workflow.scope"].status, "unresolved");
  assert.equal(Object.values(upgraded.facts).some((fact) => fact.status === "committed"), false);
});

test("v2 routes/RPCs are flag-gated, locked, receipt-bound, and auditable", async () => {
  const startRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/route.ts", import.meta.url), "utf8");
  const sessionRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/route.ts", import.meta.url), "utf8");
  const factRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/facts/route.ts", import.meta.url), "utf8");
  const answerRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts", import.meta.url), "utf8");
  const specialRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/special/route.ts", import.meta.url), "utf8");
  const specialReconcileRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/special/reconcile/route.ts", import.meta.url), "utf8");
  const specialContract = await readFile(new URL("./template-copilot-v2-special-contract.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  const upgradeRoute = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/upgrade/route.ts", import.meta.url), "utf8");
  const rpc = await readFile(new URL("../../supabase/migrations/20260726163240_template_copilot_v2_ledger.sql", import.meta.url), "utf8");
  const atomicRpc = await readFile(new URL("../../supabase/migrations/20260727190000_template_copilot_v2_atomic_decisions.sql", import.meta.url), "utf8");
  const specialRpc = await readFile(new URL("../../supabase/migrations/20260727210000_template_copilot_v2_special_decisions.sql", import.meta.url), "utf8");
  const startClient = client.slice(
    client.indexOf("async function start()"),
    client.indexOf("async function reconcileV2("),
  );
  const answerClient = client.slice(
    client.indexOf("async function submitV2("),
    client.indexOf("function releaseV2AfterRollback()"),
  );
  const rollbackClient = client.slice(
    client.indexOf("function releaseV2AfterRollback()"),
    client.indexOf("async function reconcileV2Special("),
  );
  assert.match(startRoute, /isTemplateCopilotV2Enabled\(\)/);
  assert.match(startRoute, /X-Template-Copilot-Schema-Version/);
  assert.match(startRoute, /withTemplateCopilotStartSchemaVersion/);
  assert.match(sessionRoute, /isTemplateCopilotV2Enabled\(\)/);
  assert.match(sessionRoute, /getTemplateCopilotV2InterviewState/);
  assert.match(factRoute, /createApprovalServerContext\(request\)/);
  assert.match(answerRoute, /applyTemplateCopilotV2AtomicAnswer/);
  assert.match(answerRoute, /code: "v2_unavailable"/);
  assert.match(specialRoute, /applyTemplateCopilotV2SpecialDecision/);
  assert.match(specialRoute, /code: "v2_unavailable"/);
  assert.match(specialRoute, /templateCopilotV2SpecialEnvelopeSchema/);
  assert.match(specialContract, /not_applicable/);
  assert.match(specialContract, /templateCopilotUnicodeCodePointCount/);
  assert.match(specialReconcileRoute, /reconcileTemplateCopilotV2SpecialDecision/);
  assert.match(specialReconcileRoute, /code: "v2_unavailable"/);
  assert.match(specialReconcileRoute, /templateCopilotV2SpecialEnvelopeSchema/);
  assert.match(answerRoute, /classifyTemplateCopilotV2OperationError/);
  assert.doesNotMatch(answerRoute, /factId: parsed\.data/);
  assert.match(client, /\/answers/);
  assert.match(client, /isV2State\(state\)/);
  assert.match(client, /async function submitV2/);
  assert.match(client, /pendingV2Command/);
  assert.match(client, /pendingV2StartRef/);
  assert.match(client, /sessionStorage/);
  assert.match(client, /v2StartInFlightRef/);
  assert.match(client, /Retry previous answer/);
  assert.match(client, /reconcileV2/);
  assert.match(client, /nextQuestion\?\.options/);
  assert.match(client, /getTemplateCopilotV2InputMode/);
  assert.match(client, /v2InputMode === "complete"/);
  assert.match(client, /v2InputMode === "blocked"/);
  assert.match(client, /previousAnswerSaved/);
  assert.match(client, /reconcileV2\(lifecycle, state\.sessionId, command, status !== 409\)/);
  assert.match(client, /resolveTemplateCopilotV2ExplicitConflict/);
  assert.match(client, /v2SubmitInFlightRef/);
  assert.match(client, /latestV2StateRef/);
  assert.match(client, /installV2State/);
  assert.match(client, /useEffect\(\(\) => \{[\s\S]+loadPendingTemplateCopilotV2Special/);
  assert.match(client, /discoverTemplateCopilotV2Recovery/);
  assert.match(client, /useEffectEvent\(releaseV2AfterRollback\)/);
  assert.match(client, /releaseLoadedV2AfterRollback: releaseV2AfterRollbackFromEffect/);
  assert.match(startClient, /releaseLoadedV2AfterRollback: releaseV2AfterRollback/);
  assert.match(client, /templateCopilotApiErrorCode\(caught\) === "v2_unavailable"[\s\S]+releaseV2AfterRollback\(\)/);
  assert.match(client, /selectTemplateCopilotStartIntent/);
  assert.ok(
    startClient.indexOf("discoverTemplateCopilotV2Recovery") >= 0
      && startClient.indexOf("discoverTemplateCopilotV2Recovery")
        < startClient.indexOf("loadPendingTemplateCopilotV2Special"),
    "Start must complete the server capability probe before its lazy v2 special-store loader can run.",
  );
  assert.match(
    answerClient,
    /status === 404 && templateCopilotApiErrorCode\(caught\) === "v2_unavailable"[\s\S]+releaseV2AfterRollback\(\)/,
  );
  assert.match(rollbackClient, /installPendingV2Start\(cleanupLifecycle, null\)/);
  assert.match(rollbackClient, /installPendingV2Special\(cleanupLifecycle, null\)/);
  assert.match(rollbackClient, /releaseTemplateCopilotV2ClientAfterRollback/);
  assert.match(rollbackClient, /advanceLifecycleEpoch:[\s\S]+v2LifecycleEpochRef\.current!\.invalidateCurrent\(\)/);
  assert.match(rollbackClient, /v2ClientResidueRef\.current = false/);
  assert.match(rollbackClient, /setPendingV2Command\(\(current\) => cleanupLifecycle\.isCurrent\(\) \? null : current\)/);
  assert.match(rollbackClient, /draftGenerationRef\.current = 0/);
  assert.match(rollbackClient, /v2CommandDraftGenerationRef\.current\.clear\(\)/);
  assert.match(rollbackClient, /resolvedV2CommandKeys\.current\.clear\(\)/);
  assert.match(rollbackClient, /latestV2StateRef\.current = null/);
  assert.match(rollbackClient, /setMessages\(\(current\) => cleanupLifecycle\.isCurrent\(\) \? \[\] : current\)/);
  assert.match(rollbackClient, /v2SubmitInFlightRef\.current = false/);
  assert.match(rollbackClient, /v2SpecialInFlightRef\.current = false/);
  assert.match(rollbackClient, /v2StartInFlightRef\.current = false/);
  assert.match(client, /async function recoverStoredV2Special/);
  assert.match(client, /onClick=\{\(\) => void recoverStoredV2Special\(\)\}/);
  assert.match(client, /disabled=\{busy \|\| Boolean\(pendingV2SpecialCommand\) \|\| !businessUnitId \|\| !departmentName\}/);
  assert.match(client, /isV2State\(state\)\) return;/);
  assert.match(client, /!isV2State\(state\) && <>/);
  assert.doesNotMatch(client, /Retry previous answer<\/button>/);
  assert.match(client, /copy\.startInterviewInvalid/);
  assert.match(client, /copy\.invalidInterviewUpdate/);
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
  assert.match(atomicRpc, /pg_advisory_xact_lock/);
  assert.match(atomicRpc, /p_ledger - 'atomicDecisions'/);
  assert.match(atomicRpc, /idempotency_conflict/);
  assert.match(atomicRpc, /p_user_message/);
  assert.match(atomicRpc, /p_assistant_message/);
  assert.match(atomicRpc, /template_copilot_messages/);
  assert.match(atomicRpc, /client_message_id.*p_idempotency_key/s);
  assert.match(atomicRpc, /appliedRevision/);
  assert.doesNotMatch(atomicRpc, /values\(p_session_id,p_idempotency_key,p_command_hash,response\)/);
  assert.match(atomicRpc, /octet_length\(p_ledger::text\) > 12582912/);
  assert.match(atomicRpc, /p_user_message is distinct from decision_answer/);
  assert.match(atomicRpc, /p_user_message is distinct from decision_display/);
  assert.match(atomicRpc, /attempt','stale_revision/);
  assert.match(sessionRoute, /messageDirection/);
  assert.match(sessionRoute, /decodeTemplateCopilotMessageCursor/);
  assert.match(client, /messageDirection=tail/);
  assert.match(client, /createTemplateCopilotClientChatMessage\(\{[\s\S]{0,500}?clientMessageId: started\.clientMessageId/);
  assert.match(client, /message\.id !== command\.idempotencyKey && message\.id !== `\$\{command\.idempotencyKey\}-assistant`/);
  assert.match(client, /fieldset className="contents"/);
  assert.doesNotMatch(client, /role="radiogroup"/);
  assert.match(atomicRpc, /revoke all on function[\s\S]+to service_role/);
  assert.match(atomicRpc, /drop constraint if exists template_copilot_v2_audit_events_operation_check/);
  assert.match(atomicRpc, /'atomic_answer'/);
  assert.match(atomicRpc, /end;\s*\$\$;/);
  assert.match(specialRpc, /pg_advisory_xact_lock/);
  assert.match(specialRpc, /template_copilot_v2_operation_receipts/);
  assert.match(specialRpc, /client_message_id,role,content[\s\S]+p_idempotency_key,'user'/);
  assert.match(specialRpc, /assistant_created_at<=user_created_at[\s\S]+interval '1 microsecond'/);
  assert.match(specialRpc, /p_user_detail,user_created_at[\s\S]+p_assistant_detail,assistant_created_at/);
  assert.match(specialRpc, /revoke all on function[\s\S]+to service_role/);
});

test("the visible example composition adds its localized label exactly once", () => {
  const source = getTemplateCopilotQuestionLibrary("v2.0");
  const exampleQuestion = source.questions.find((question) => question.example);
  const pinned = validateTemplateCopilotQuestionLibrary({
    ...source,
    questions: [
      { ...exampleQuestion, priority: 1 },
      ...source.questions.filter((question) => question !== exampleQuestion).map((question, index) => ({ ...question, priority: index + 1000 })),
    ],
  });
  const interview = getTemplateCopilotV2InterviewState(createTemplateCopilotV2Ledger({ ...scope, locale: "en" }, enabled), pinned);
  assert.equal(interview.state, "question");
  const visible = `${interview.nextQuestion?.exampleLabel}: ${interview.nextQuestion?.example}`;
  assert.match(visible, /^Example: (?!Example:)/);
});

test("Step 2 visible recovery and control copy is complete in all three supported locales", async () => {
  const client = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  const keys = ["chooseListedOption", "previousAnswerSaved", "retrySameAnswer", "retryPreviousAnswer", "interviewComplete", "interviewCompleteNextAction", "interviewBlocked", "interviewBlockedSupport", "concurrentChangeSuperseded", "concurrentChangeConflict", "validationAnswerError", "answerLength", "currentDecision", "requestError", "startInterviewInvalid", "reloadInterviewError", "invalidInterviewUpdate", "retryPreviousRequired", "temporaryAnswerError", "staleAnswerRebased", "staleAnswerNeedsReview", "recoveryTranscriptNotice"];
  for (const key of keys) assert.equal((client.match(new RegExp(`\\b${key}:`, "g")) || []).length, 4, `${key} must have a type and all three locales`);
  assert.match(client, /\? copy\.currentDecision :/);
  assert.match(client, /getTemplateCopilotAnswerLimit/);
  assert.match(client, /maxLength=\{answerLimit\}/);
  assert.match(client, /template-copilot-answer-length/);
  assert.doesNotMatch(client, /\? "Current decision"/);
  assert.doesNotMatch(client, /The guided interview did not return|Could not reload the latest|returned an invalid update/);
});

test("v2 hides the v1-only document action and keeps typed API errors out of v2-visible recovery copy", async () => {
  const client = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  assert.match(client, /async function upload\(file: File\) \{\s+if \(!state \|\| busy \|\| isV2State\(state\)\) return;/s);
  assert.match(client, /\{!isV2State\(state\) && <>[\s\S]*?copy\.addFile[\s\S]*?<\/>\}/);
  assert.match(client, /\{!isV2State\(state\) && <p[\s\S]*?copy\.fileBoundary/);
  assert.match(client, /copy\.temporaryAnswerError.*copy\.retrySameAnswer/s);
});

test("v1 calls retain the pre-v2 route error contract while start uses a server-owned schema marker", async () => {
  const client = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
  assert.match(client, /async function legacyApi\(/);
  assert.match(client, /error\?\.message === "string" \? error\.message : "The Template Copilot request failed\."/);
  assert.match(client, /const response = await startApi\("\/api\/template-authoring\/copilot\/sessions"/);
  assert.match(client, /response\.headers\.get\("X-Template-Copilot-Schema-Version"\) === "1"/);
  assert.match(client, /const response = await legacyApi\([\s\S]*?\/messages/s);
  assert.match(client, /const response = await legacyApi\([\s\S]*?\/documents/s);
  assert.match(client, /const response = await legacyApi\([\s\S]*?create-draft/s);
});

test("feature flag is server-safe, explicit, and testable", () => {
  assert.equal(getTemplateCopilotV2Flag({ TEMPLATE_COPILOT_V2: "true" }).enabled, true);
  assert.equal(getTemplateCopilotV2Flag({ TEMPLATE_COPILOT_V2: "TRUE" }).enabled, false);
  assert.equal(isTemplateCopilotV2Enabled({ TEMPLATE_COPILOT_V2: "false" }), false);
});
