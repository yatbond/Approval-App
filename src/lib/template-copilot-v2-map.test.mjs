import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateCopilotV2Ledger, applyTemplateCopilotV2FactTransition } from "./template-copilot-facts.ts";
import { projectTemplateCopilotV2Map } from "./template-copilot-v2-map.ts";
const flag = { enabled: true };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts" };
test("map is a stable authoritative projection containing every fact in readable groups", () => {
  const ledger = createTemplateCopilotV2Ledger({ ...scope, locale: "en", questionLibraryVersion: "v2.1" }, flag);
  const first = projectTemplateCopilotV2Map(ledger); const second = projectTemplateCopilotV2Map(ledger);
  assert.deepEqual(first, second); assert.equal(first.sections.flatMap((section) => section.rows).length, 16);
  assert.equal(first.sections.find((section) => section.id === "routing").rows[0].label, "Ordered or simultaneous steps and people");
  const committed = applyTemplateCopilotV2FactTransition({ ledger, factId: "workflow.name", transition: { operation: "human_commit", payload: { canonicalValue: "Purchase approval", provenance: [{ kind: "human_editor", sourceId: "test", sourceMessageIds: [] }] } }, actorId: "33333333-3333-4333-8333-333333333333", confirmedAt: "2026-07-27T00:00:00Z", flag });
  assert.equal(projectTemplateCopilotV2Map(committed).sections[0].rows[0].state, "committed");
});
test("map distinguishes candidate, conflict, unknown, N/A, and unresolved in all locales", () => {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) { const map = projectTemplateCopilotV2Map(createTemplateCopilotV2Ledger({ ...scope, locale, questionLibraryVersion: "v2.1" }, flag)); assert.ok(map.sections[0].label.length > 0); assert.equal(map.sections[0].rows[0].state, "unresolved"); }
});
test("a consequential replacement reopens the complete dependent closure without touching unrelated facts", () => {
  const actorId = "33333333-3333-4333-8333-333333333333";
  const at = "2026-07-27T00:00:00Z";
  const commit = (ledger, factId, canonicalValue, operation = "human_commit") => applyTemplateCopilotV2FactTransition({ ledger, factId, transition: { operation, payload: { canonicalValue, provenance: [{ kind: "human_editor", sourceId: `test:${factId}`, sourceMessageIds: [] }] } }, actorId, confirmedAt: at, flag });
  let ledger = createTemplateCopilotV2Ledger({ ...scope, locale: "en", questionLibraryVersion: "v2.1" }, flag);
  ledger = commit(ledger, "workflow.name", "Purchase approval");
  ledger = commit(ledger, "request.initiator_policy", { mode: "any_employee", description: "Employees" });
  ledger = commit(ledger, "request.fields", [{ label: "Amount", type: "currency", required: true, options: [] }]);
  ledger = commit(ledger, "workflow.stages", [{ label: "Manager", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 }]);
  ledger = commit(ledger, "workflow.conditions", [{ field: "Amount", operator: ">", value: 1000, matchingRoute: "Manager", otherwiseRoute: "Manager" }]);
  ledger = commit(ledger, "request.initiator_policy", { mode: "directory_role", description: "Finance employees" }, "human_replace");
  assert.equal(ledger.facts["request.initiator_policy"].status, "committed");
  for (const id of ["request.fields", "attachments.requirements", "workflow.stages", "workflow.conditions", "workflow.rejection_policy", "collaboration.policy", "timing.rules", "visibility.policy", "notifications.rules"]) assert.equal(ledger.facts[id].status, "unresolved", id);
  assert.equal(ledger.facts["workflow.stages"].staleHistory[0].canonicalValue[0].label, "Manager", "invalidated decisions retain their prior reviewed value");
  assert.equal(ledger.facts["workflow.name"].status, "committed", "unrelated facts remain authoritative");
  const map = projectTemplateCopilotV2Map(ledger);
  assert.match(map.sections[0].rows.find((row) => row.factId === "request.initiator_policy").impact, /does not block/);
  assert.deepEqual(map.sections[0].rows.find((row) => row.factId === "request.initiator_policy").dependentFactIds.slice(0, 2), ["request.fields", "attachments.requirements"]);
});
