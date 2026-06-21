import assert from "node:assert/strict";
import test from "node:test";
import { getApprovalWorkspaceTaskState } from "./approval-workspace-task-state.ts";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Invoice approval",
    workflow: "Finance invoice approval",
    requester: "Mandy Chan",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Today",
    value: "HKD 1,000",
    currentStep: "Department review",
    currentOwner: "derrick@example.com",
    participants: ["mandy@example.com", "derrick@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    attachments: [],
    auditTrail: [],
    ...overrides,
  };
}

const template = {
  id: "finance-invoice",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-pdf",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "Department review",
        x: 100,
        y: 0,
        documentIds: ["invoice-pdf"],
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "start",
        targetId: "review-1",
        label: "Next",
        branchType: "main",
      },
    ],
  },
};

test("derives actionable, tracking, selected task, template, and missing current documents", () => {
  const selected = makeTask({
    id: "task-selected",
    workflowTemplateId: "finance-invoice",
    currentNodeId: "review-1",
  });
  const originatorOnly = makeTask({
    id: "task-originator",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });
  const hidden = makeTask({
    id: "task-hidden",
    currentOwner: "someone@example.com",
    participants: ["someone@example.com"],
  });

  const state = getApprovalWorkspaceTaskState({
    tasks: [originatorOnly, selected, hidden],
    templates: [template],
    selectedTaskId: "task-selected",
    activeUserEmail: "derrick@example.com",
  });

  assert.deepEqual(
    state.actionableTasks.map((task) => task.id),
    ["task-selected"],
  );
  assert.deepEqual(
    state.trackingTasks.map((task) => task.id),
    ["task-originator", "task-selected"],
  );
  assert.equal(state.selectedTask?.id, "task-selected");
  assert.equal(state.selectedTaskTemplate?.id, "finance-invoice");
  assert.deepEqual(
    state.selectedTaskMissingDocuments.map((document) => document.id),
    ["invoice-pdf"],
  );
});

test("falls back to first actionable task before tracking-only tasks", () => {
  const trackingOnly = makeTask({
    id: "tracking-only",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });
  const actionable = makeTask({ id: "actionable" });

  const state = getApprovalWorkspaceTaskState({
    tasks: [trackingOnly, actionable],
    templates: [template],
    selectedTaskId: "missing",
    activeUserEmail: "derrick@example.com",
  });

  assert.equal(state.selectedTask?.id, "actionable");
});

test("honors a selected tracking-only task when nothing is actionable", () => {
  const trackingOnly = makeTask({
    id: "tracking-only",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });

  const state = getApprovalWorkspaceTaskState({
    tasks: [trackingOnly],
    templates: [template],
    selectedTaskId: "tracking-only",
    activeUserEmail: "derrick@example.com",
  });

  assert.deepEqual(state.actionableTasks, []);
  assert.equal(state.selectedTask?.id, "tracking-only");
});
