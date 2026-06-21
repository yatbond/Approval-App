import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatPathNodeState,
  formatTaskAccessRole,
  findTemplateForTask,
  getPathNodeState,
} from "./task-display.ts";

const baseTask = {
  id: "task-1",
  title: "Invoice approval",
  workflow: "Finance",
  workflowTemplateId: "template-1",
  requester: "Mandy Chan",
  requesterEmail: "originator@example.com",
  currentOwner: "approver@example.com",
  currentStep: "Manager review",
  status: "pending",
  amount: "HKD 8,400",
  submittedAt: "2026-06-21",
  dueAt: "2026-06-22",
  participants: ["participant@example.com"],
  auditTrail: [
    {
      id: "audit-1",
      actor: "Earlier approver",
      actorEmail: "earlier@example.com",
      action: "approve",
      detail: "Approved earlier.",
      timestamp: "2026-06-21 08:00",
    },
  ],
  extracted: [],
};

test("resolves workflow path node state in priority order", () => {
  const node = { id: "review-1", kind: "review", label: "Manager review", x: 0, y: 0 };
  const approvedTask = {
    ...baseTask,
    nodeDecisions: { "review-1": "approved" },
    pendingNodeIds: ["review-1"],
  };
  const rejectedTask = {
    ...baseTask,
    nodeDecisions: { "review-1": "rejected" },
  };
  const pendingTask = {
    ...baseTask,
    pendingNodeIds: ["review-1"],
  };
  const currentTask = {
    ...baseTask,
    currentNodeId: "review-1",
  };
  const currentByStepTask = {
    ...baseTask,
    currentNodeId: "",
    currentStep: "Manager review",
  };
  const completedTask = {
    ...baseTask,
    currentStep: "Other step",
    completedNodeIds: ["review-1"],
  };
  const notifiedTask = {
    ...baseTask,
    currentStep: "Other step",
    notifiedNodeIds: ["review-1"],
  };

  assert.equal(getPathNodeState(approvedTask, node), "approved");
  assert.equal(getPathNodeState(rejectedTask, node), "rejected");
  assert.equal(getPathNodeState(pendingTask, node), "current");
  assert.equal(getPathNodeState(currentTask, node), "current");
  assert.equal(getPathNodeState(currentByStepTask, node), "current");
  assert.equal(getPathNodeState(completedTask, node), "completed");
  assert.equal(getPathNodeState(notifiedTask, node), "notified");
  assert.equal(getPathNodeState({ ...baseTask, currentStep: "Other step" }, node), "waiting");
});

test("formats path node state labels", () => {
  assert.equal(formatPathNodeState("current"), "Current");
  assert.equal(formatPathNodeState("approved"), "Approved");
  assert.equal(formatPathNodeState("rejected"), "Rejected");
  assert.equal(formatPathNodeState("completed"), "Done");
  assert.equal(formatPathNodeState("notified"), "FYI");
  assert.equal(formatPathNodeState("waiting"), "Waiting");
});

test("formats task access role for visible participants", () => {
  assert.equal(formatTaskAccessRole(baseTask, "originator@example.com"), "originator");
  assert.equal(formatTaskAccessRole(baseTask, "approver@example.com"), "current actor");
  assert.equal(formatTaskAccessRole(baseTask, "earlier@example.com"), "previous actor");
  assert.equal(formatTaskAccessRole(baseTask, "participant@example.com"), "participant");
});

test("finds a task template snapshot before falling back to template ids or names", () => {
  const snapshot = { id: "snapshot", name: "Snapshot template", steps: [], fields: [], documents: [] };
  assert.equal(
    findTemplateForTask({ ...baseTask, workflowTemplateSnapshot: snapshot }, []),
    snapshot,
  );
  assert.equal(
    findTemplateForTask(
      { ...baseTask, workflowTemplateId: "template-id", workflow: "Other" },
      [{ id: "template-id", name: "By id", steps: [], fields: [], documents: [] }],
    )?.name,
    "By id",
  );
  assert.equal(
    findTemplateForTask(
      { ...baseTask, workflowTemplateId: "missing", workflow: "By name" },
      [{ id: "template-name", name: "By name", steps: [], fields: [], documents: [] }],
    )?.id,
    "template-name",
  );
});
