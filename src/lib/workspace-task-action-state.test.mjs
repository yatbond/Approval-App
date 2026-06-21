import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceRecordTaskActionState,
  getWorkspaceRunnerTaskActionState,
} from "./workspace-task-action-state.ts";

const activeUser = {
  name: "Derrick Pang",
  email: "derrick@example.com",
};

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
      id: "approval-upload",
      documentType: "Approval support",
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
        documentIds: ["approval-upload"],
      },
    ],
    edges: [
      {
        id: "edge-start-review",
        sourceId: "start",
        targetId: "review-1",
        label: "Submit",
        branchType: "main",
      },
    ],
  },
};

test("records a user task action and returns the next task list", () => {
  const selectedTask = makeTask();
  const nextState = getWorkspaceRecordTaskActionState({
    tasks: [selectedTask, makeTask({ id: "task-2", currentOwner: "other@example.com" })],
    selectedTask,
    templates: [],
    activeUser,
    action: "reject_with_comment",
    comment: "Missing receipt",
    targetEmail: "",
  });

  assert.equal(nextState.didApply, true);
  assert.equal(nextState.actionError, "");
  assert.equal(nextState.shouldClearInputs, true);
  assert.equal(nextState.tasks[0].status, "returned");
  assert.equal(nextState.tasks[0].currentOwner, "mandy@example.com");
  assert.match(nextState.tasks[0].lastAction, /Rejected/);
  assert.ok(
    nextState.tasks[0].auditTrail.some((event) =>
      event.detail.includes("Missing receipt"),
    ),
  );
  assert.equal(nextState.tasks[1].id, "task-2");
});

test("blocks approval when the current workflow box still requires documents", () => {
  const selectedTask = makeTask({
    workflowTemplateId: "finance-invoice",
    currentNodeId: "review-1",
  });
  const nextState = getWorkspaceRecordTaskActionState({
    tasks: [selectedTask],
    selectedTask,
    templates: [template],
    activeUser,
    action: "approve",
    comment: "",
    targetEmail: "",
  });

  assert.equal(nextState.didApply, false);
  assert.equal(nextState.shouldClearInputs, false);
  assert.equal(
    nextState.actionError,
    "Upload required document(s) before approving: Approval support.",
  );
  assert.equal(nextState.tasks[0], selectedTask);
});

test("runs a workflow simulation action with the task owner as actor", () => {
  const task = makeTask({
    currentOwner: "owner@example.com",
    participants: ["mandy@example.com", "owner@example.com"],
  });
  const nextState = getWorkspaceRunnerTaskActionState({
    tasks: [task],
    templates: [],
    taskId: "task-1",
    action: "approve",
    fallbackEmail: "active@example.com",
  });

  assert.equal(nextState.didApply, true);
  assert.equal(nextState.selectedTaskId, "task-1");
  assert.equal(nextState.tasks[0].status, "pending");
  assert.equal(nextState.tasks[0].currentOwner, "next.approver@example.com");
  assert.ok(
    nextState.tasks[0].auditTrail.some(
      (event) =>
        event.action === "approved" && event.actorEmail === "owner@example.com",
    ),
  );
});
