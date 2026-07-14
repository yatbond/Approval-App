import assert from "node:assert/strict";
import test from "node:test";
import {
  getRuntimeActionItems,
  getRuntimeNextActionLabel,
  getRuntimeStatusLabel,
  getSelectedRuntimeTask,
} from "./workflow-runtime-panel-state.ts";

const tasks = [
  {
    id: "task-1",
    title: "Invoice request",
    currentStep: "Finance review",
    currentOwner: "owner@example.com",
    currentNodeId: "review-1",
    status: "pending",
    auditTrail: [{ detail: "Submitted" }],
    lastAction: "Submitted",
  },
  {
    id: "task-2",
    title: "Leave request",
    currentStep: "Supervisor review",
    currentOwner: "supervisor@example.com",
    status: "pending",
    auditTrail: [],
    lastAction: "Created",
  },
];

test("selects requested runtime task and falls back to the first task", () => {
  assert.equal(getSelectedRuntimeTask(tasks, "task-2")?.id, "task-2");
  assert.equal(getSelectedRuntimeTask(tasks, "missing")?.id, "task-1");
  assert.equal(getSelectedRuntimeTask([], "missing"), undefined);
});

test("formats runtime status for linked and unlinked templates", () => {
  assert.equal(
    getRuntimeStatusLabel(tasks[0]),
    "task-1 is at Finance review",
  );
  assert.equal(
    getRuntimeStatusLabel(undefined),
    "No test has been started for this workflow.",
  );
  assert.equal(
    getRuntimeNextActionLabel(tasks[0]),
    "Review the current position and choose Approve or Reject.",
  );
});

test("uses plain action labels and only shows actions valid for the current state", () => {
  const pendingActions = getRuntimeActionItems({
    runtimeTask: { ...tasks[0], id: "TEST-1" },
    missingDocuments: [{ documentType: "Invoice PDF" }],
  });
  const returnedActions = getRuntimeActionItems({
    runtimeTask: { ...tasks[0], id: "TEST-2", status: "returned" },
    missingDocuments: [],
  });
  const completedActions = getRuntimeActionItems({
    runtimeTask: { ...tasks[0], id: "TEST-3", status: "approved" },
    missingDocuments: [],
  });

  assert.deepEqual(pendingActions.map((item) => item.label), [
    "Approve test step",
    "Reject test step",
  ]);
  assert.equal(pendingActions[0].disabled, false);
  assert.deepEqual(returnedActions.map((item) => item.label), [
    "Resubmit test",
    "Cancel test",
  ]);
  assert.deepEqual(completedActions, []);
});

test("blocks approve action when current node has missing documents", () => {
  const actions = getRuntimeActionItems({
    runtimeTask: tasks[0],
    missingDocuments: [
      { id: "doc-1", documentType: "Invoice PDF" },
      { id: "doc-2", documentType: "Delivery note" },
    ],
  });

  const approveAction = actions.find((action) => action.action === "approve");
  const rejectAction = actions.find(
    (action) => action.action === "reject_with_comment",
  );

  assert.equal(approveAction?.disabled, true);
  assert.equal(
    approveAction?.title,
    "Upload Invoice PDF, Delivery note before approving.",
  );
  assert.equal(rejectAction?.disabled, false);
});

test("returns no runtime actions when there is no runtime task", () => {
  assert.deepEqual(
    getRuntimeActionItems({ runtimeTask: undefined, missingDocuments: [] }),
    [],
  );
});
