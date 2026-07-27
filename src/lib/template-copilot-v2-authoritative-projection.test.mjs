import assert from "node:assert/strict";
import test from "node:test";
import { applyTemplateCopilotV2FactTransition, createTemplateCopilotV2Ledger, templateCopilotFactIds } from "./template-copilot-facts.ts";
import { projectTemplateCopilotV2AuthoritativeLedger } from "./template-copilot-v2-authoritative-projection.ts";

const flag = { enabled: true };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts" };
const values = {
  "workflow.name": "Purchase approval", "workflow.purpose": "Approve purchases including a deliberately long CJK proof: 這是一段很長的繁體中文說明，這是一段很長的简体中文说明。", "workflow.scope": { description: "Purchases", rules: ["Exclude emergencies"] }, "request.initiator_policy": { mode: "directory_role", description: "Finance staff" }, "request.fields": [{ label: "Amount", type: "currency", required: true, options: ["HKD", "USD"] }], "attachments.requirements": [{ label: "Invoice", required: true, formats: ["pdf", "image"], stage: "Finance" }], "workflow.stages": [{ label: "Manager", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 }], "workflow.conditions": [{ field: "Amount", operator: ">", value: 1000, matchingRoute: "Manager", otherwiseRoute: "Finance" }], "workflow.rejection_policy": { action: "route_to_stage", route: "Requester" }, "collaboration.policy": { description: "Correct errors", rules: ["Retain audit"] }, "timing.rules": { defaultDueHours: 24, escalation: { description: "Escalate", rules: ["Tell Finance"] } }, "visibility.policy": { description: "Participants", rules: [] }, "notifications.rules": [{ event: "Assigned", recipients: ["Requester"], channel: "email" }], "governance.owner": "Finance", "governance.policies": ["Quarterly review"], "governance.retention": { period: "7 years", rationale: "Audit" },
};

function projectedLedger(locale) {
  const ledger = createTemplateCopilotV2Ledger({ ...scope, locale }, flag);
  for (const factId of templateCopilotFactIds) ledger.facts[factId] = { ...ledger.facts[factId], status: "committed", canonicalValue: values[factId], provenance: [{ kind: "human_editor", sourceId: "map:review", sourceMessageIds: ["m1"] }], confirmation: { actorId: "33333333-3333-4333-8333-333333333333", confirmedAt: "2026-07-28T00:00:00Z", operation: "human_confirm" } };
  return ledger;
}

test("the authoritative projection presents all sixteen typed schemas losslessly in every supported locale", () => {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const projection = projectTemplateCopilotV2AuthoritativeLedger(projectedLedger(locale));
    assert.equal(projection.facts.length, templateCopilotFactIds.length);
    for (const factId of templateCopilotFactIds) {
      const row = projection.facts.find((fact) => fact.factId === factId);
      assert.ok(row.label.length > 0, `${locale} ${factId} label`);
      assert.ok(row.lines.join(" ").length > 0, `${locale} ${factId} value`);
      assert.ok(row.provenance.join(" ").includes("m1"), `${locale} ${factId} provenance`);
    }
    const condition = projection.facts.find((fact) => fact.factId === "workflow.conditions");
    assert.match(condition.lines.join(" "), /1000/, "numeric values remain visible as numbers");
    assert.doesNotMatch(condition.lines.join(" "), /workflow\.conditions|directory_position|route_to_stage/, "stored enum and fact tokens never reach the presentation");
  }
});

test("candidate, conflict, unresolved, unknown, N/A, stale evidence, and readiness remain distinct and localized", () => {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const ledger = projectedLedger(locale);
    const entries = ledger.facts;
    entries["workflow.name"] = { ...entries["workflow.name"], status: "candidate", confirmation: undefined, originalWording: "Original candidate wording" };
    entries["workflow.purpose"] = { ...entries["workflow.purpose"], status: "conflicting", confirmation: undefined, originalWording: "Conflicting source wording", conflictValues: [values["workflow.purpose"], "Other purpose"], conflictEvidence: [{ canonicalValue: values["workflow.purpose"], provenance: [{ kind: "message", sourceId: "source-one", sourceMessageIds: ["message-one"], excerpt: "first alternative" }] }, { canonicalValue: "Other purpose", provenance: [{ kind: "document", sourceId: "source-two", sourceMessageIds: [], sha256: "a".repeat(64), excerpt: "second alternative" }] }] };
    entries["workflow.scope"] = { ...entries["workflow.scope"], status: "unresolved", canonicalValue: undefined, confirmation: undefined };
    entries["request.initiator_policy"] = { ...entries["request.initiator_policy"], status: "unknown", canonicalValue: undefined, confirmation: undefined };
    entries["attachments.requirements"] = { ...entries["attachments.requirements"], status: "not_applicable", canonicalValue: undefined, notApplicableReason: "No documents are needed", staleHistory: [
      { invalidatedBy: "request.fields", invalidatedAt: "2026-07-28T00:00:00Z", status: "not_applicable", notApplicableReason: "Earlier N/A decision", originalWording: "No invoice requested", provenance: [{ kind: "message", sourceId: "source-na", sourceMessageIds: ["message-na"], excerpt: "no documents" }], confirmation: entries["attachments.requirements"].confirmation },
      { invalidatedBy: "request.fields", invalidatedAt: "2026-07-28T00:01:00Z", status: "conflicting", canonicalValue: values["attachments.requirements"], originalWording: "Earlier conflicting documents", provenance: [{ kind: "human_editor", sourceId: "source-conflict", sourceMessageIds: [] }], conflictValues: [values["attachments.requirements"], [{ label: "Receipt", required: false, formats: ["image"] }]], conflictEvidence: [{ canonicalValue: values["attachments.requirements"], provenance: [{ kind: "message", sourceId: "source-history-one", sourceMessageIds: ["history-one"] }] }, { canonicalValue: [{ label: "Receipt", required: false, formats: ["image"] }], provenance: [{ kind: "document", sourceId: "source-history-two", sourceMessageIds: [], sha256: "b".repeat(64) }] }] },
    ] };
    const projection = projectTemplateCopilotV2AuthoritativeLedger(ledger);
    for (const row of projection.facts) assert.doesNotMatch(row.stateLabel, /candidate|conflicting|unresolved|unknown|not_applicable/, `${locale} state token in ${row.factId}`);
    const conflict = projection.facts.find((row) => row.factId === "workflow.purpose");
    const attachments = projection.facts.find((row) => row.factId === "attachments.requirements");
    assert.equal(conflict.conflictAlternatives.length, 2, `${locale} current conflict preserves both alternatives`);
    assert.match(conflict.conflictAlternatives.flatMap((item) => item.provenance).join(" "), /source-one.*message-one.*source-two/s, `${locale} current conflict preserves evidence source coordinates`);
    assert.equal(attachments.history.length, 2, `${locale} history keeps every invalidated value`);
    assert.equal(attachments.history[0].notApplicableReason, "Earlier N/A decision", `${locale} historical N/A reason`);
    assert.match(attachments.history[0].confirmation || "", /33333333/, `${locale} historical confirmation`);
    assert.match(attachments.history[0].provenance.join(" "), /source-na.*message-na/s, `${locale} historical provenance/source`);
    assert.equal(attachments.history[1].conflictAlternatives.length, 2, `${locale} historical conflict preserves both alternatives`);
    assert.match(attachments.history[1].conflictAlternatives.flatMap((item) => item.provenance).join(" "), /source-history-one.*source-history-two/s, `${locale} historical conflict evidence`);
    assert.match(attachments.lines.join(" "), /No documents are needed/);
    assert.ok(projection.readiness.gaps.some((gap) => gap.code === "candidate_requires_confirmation"));
    assert.ok(projection.readiness.gaps.some((gap) => gap.code === "conflicting"));
  }
});

test("a genuine committed correction projects the new value and the complete superseded map history", () => {
  let ledger = createTemplateCopilotV2Ledger({ ...scope, locale: "en" }, flag);
  const mutate = (operation, canonicalValue, confirmedAt) => applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", transition: { operation, payload: { canonicalValue, originalWording: `source says ${canonicalValue}`, provenance: [{ kind: "message", sourceId: `source-${canonicalValue}`, sourceMessageIds: [`message-${canonicalValue}`], excerpt: canonicalValue }] } }, actorId: "33333333-3333-4333-8333-333333333333", confirmedAt, flag });
  ledger = mutate("human_commit", "Initial committed name", "2026-07-28T00:00:00Z");
  ledger = mutate("human_replace", "Corrected committed name", "2026-07-28T00:01:00Z");
  const row = projectTemplateCopilotV2AuthoritativeLedger(ledger).facts.find((fact) => fact.factId === "workflow.name");
  assert.deepEqual(row.lines, ["Corrected committed name"]);
  assert.equal(row.originalWording, "source says Corrected committed name");
  assert.equal(row.history.length, 1);
  assert.deepEqual(row.history[0].lines, ["Initial committed name"]);
  assert.equal(row.history[0].originalWording, "source says Initial committed name");
  assert.match(row.history[0].confirmation, /33333333.*2026-07-28T00:00:00Z/s);
  assert.match(row.history[0].provenance.join(" "), /source-Initial committed name.*message-Initial committed name/s);
});
