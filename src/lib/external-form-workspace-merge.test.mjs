import assert from "node:assert/strict";
import test from "node:test";
import { mergeExternalFormWorkspaceState } from "./external-form-workspace-merge.ts";

function task(id, withResponse = false) {
  return {
    id,
    title: id,
    workflow: "Workflow",
    requester: "Mandy",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Tomorrow",
    value: "",
    currentStep: "Manager",
    currentOwner: "manager@example.com",
    participants: ["mandy@example.com", "manager@example.com"],
    lastAction: withResponse ? "External form received" : "Submitted",
    extractedFields: withResponse ? { Amount: "100" } : {},
    attachments: withResponse
      ? [{ id: "form-r1-1", fileName: "invoice.pdf", documentType: "invoice", format: "ad_hoc", uploadedBy: "mandy@example.com", uploadedAt: "2026-07-14T00:00:00.000Z" }]
      : [],
    externalFormResponses: withResponse
      ? [{ provider: "microsoft_forms", formKey: "form", formVersion: 1, definitionId: "form-v1", externalResponseId: "r1", responseMode: "complete_node", status: "applied", answers: { Amount: "100" }, attachmentIds: ["form-r1-1"], submittedAt: "2026-07-14T00:00:00.000Z" }]
      : [],
    auditTrail: withResponse
      ? [{ id: `${id}-external`, action: "amended", actor: "Mandy", actorEmail: "mandy@example.com", timestamp: "2026-07-14T00:00:00.000Z", detail: "Response r1 received." }]
      : [],
  };
}

function snapshot(tasks) {
  return { selectedTemplateId: "", approvalTasks: tasks, businessDirectory: [], workflowTemplates: [], userRoleAssignments: [], adminAuditEvents: [], formLibrary: [] };
}

test("preserves externally started requests missing from a stale browser save", () => {
  const merged = mergeExternalFormWorkspaceState(snapshot([]), snapshot([task("APR-FORM", true)]));
  assert.equal(merged.approvalTasks[0].id, "APR-FORM");
});

test("preserves external values attachments responses and audit on an existing request", () => {
  const stale = task("APR-1", false);
  stale.extractedFields = { Comment: "Keep me" };
  const merged = mergeExternalFormWorkspaceState(snapshot([stale]), snapshot([task("APR-1", true)]));
  assert.deepEqual(merged.approvalTasks[0].extractedFields, { Comment: "Keep me", Amount: "100" });
  assert.equal(merged.approvalTasks[0].attachments.length, 1);
  assert.equal(merged.approvalTasks[0].externalFormResponses.length, 1);
  assert.equal(merged.approvalTasks[0].auditTrail.length, 1);
});
