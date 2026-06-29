import assert from "node:assert/strict";
import test from "node:test";
import {
  getRuntimeActionItems,
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
    "Invoice request is at Finance review",
  );
  assert.equal(
    getRuntimeStatusLabel(undefined),
    "no active request is linked to this template yet",
  );
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
