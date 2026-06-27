import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWorkflowPathStages,
  formatPathNodeState,
  formatTaskAccessRole,
  findTemplateForTask,
  getPathNodeHistoryEvents,
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

test("groups workflow path cards into numbered stages with parallel suffixes", () => {
  const graph = {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "department", kind: "approval", label: "Department review", x: 200, y: 0 },
      {
        id: "supervisor",
        kind: "approval",
        label: "Supervisor endorsement",
        x: 420,
        y: 0,
      },
      { id: "cfo", kind: "approval", label: "CFO approval", x: 420, y: 160 },
      { id: "end", kind: "end", label: "End", x: 650, y: 80 },
    ],
    edges: [
      { id: "edge-1", sourceId: "start", targetId: "department", label: "Start", branchType: "main" },
      { id: "edge-2", sourceId: "department", targetId: "supervisor", label: "Supervisor", branchType: "main" },
      { id: "edge-3", sourceId: "department", targetId: "cfo", label: "CFO", branchType: "main" },
      { id: "edge-4", sourceId: "supervisor", targetId: "end", label: "End", branchType: "main" },
      { id: "edge-5", sourceId: "cfo", targetId: "end", label: "End", branchType: "main" },
    ],
  };

  const stages = buildWorkflowPathStages(graph);

  assert.deepEqual(
    stages.map((stage) => ({
      stageNumber: stage.stageNumber,
      isParallel: stage.isParallel,
      nodeLabels: stage.nodes.map((node) => node.label),
      pathLabels: stage.nodes.map((node) => node.pathLabel),
    })),
    [
      {
        stageNumber: 1,
        isParallel: false,
        nodeLabels: ["Department review"],
        pathLabels: ["1"],
      },
      {
        stageNumber: 2,
        isParallel: true,
        nodeLabels: ["Supervisor endorsement", "CFO approval"],
        pathLabels: ["2A", "2B"],
      },
      {
        stageNumber: 3,
        isParallel: false,
        nodeLabels: ["End"],
        pathLabels: ["3"],
      },
    ],
  );
});

test("ignores workflow path edges that cannot advance from a reachable source", () => {
  const graph = {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "review", kind: "review", label: "Review", x: 200, y: 0 },
      { id: "orphan", kind: "approval", label: "Orphan", x: 400, y: 0 },
    ],
    edges: [
      { id: "edge-valid", sourceId: "start", targetId: "review", label: "Review", branchType: "main" },
      { id: "edge-missing-source", sourceId: "missing", targetId: "orphan", label: "Missing", branchType: "main" },
      { id: "edge-missing-target", sourceId: "start", targetId: "missing", label: "Missing", branchType: "main" },
      { id: "edge-back-to-start", sourceId: "review", targetId: "start", label: "Back", branchType: "main" },
    ],
  };

  const stages = buildWorkflowPathStages(graph);

  assert.deepEqual(
    stages.map((stage) => ({
      stageNumber: stage.stageNumber,
      nodeLabels: stage.nodes.map((node) => node.label),
    })),
    [
      { stageNumber: 1, nodeLabels: ["Review"] },
      { stageNumber: 2, nodeLabels: ["Orphan"] },
    ],
  );
});

test("assigns audit history to the matching workflow path box", () => {
  const firstNode = {
    id: "department-review",
    kind: "approval",
    label: "Department review",
    x: 0,
    y: 0,
    assigneeEmail: "approver@example.com",
  };
  const laterNode = {
    id: "cfo",
    kind: "approval",
    label: "CFO approval",
    x: 200,
    y: 0,
    assigneeEmail: "cfo@example.com",
  };
  const task = {
    ...baseTask,
    auditTrail: [
      {
        id: "submitted",
        actor: "Mandy Chan",
        actorEmail: "mandy@example.com",
        action: "submitted",
        detail: "Request submitted.",
        timestamp: "2026-06-21 08:00",
      },
      {
        id: "assigned-department",
        actor: "System",
        actorEmail: "system@example.com",
        action: "assigned",
        detail: "Assigned to Derrick Pang for department review.",
        timestamp: "2026-06-21 08:01",
        targetEmail: "approver@example.com",
      },
      {
        id: "assigned-cfo",
        actor: "System",
        actorEmail: "system@example.com",
        action: "assigned",
        detail: "Assigned to CFO for approval.",
        timestamp: "2026-06-21 09:00",
        targetEmail: "cfo@example.com",
      },
    ],
  };

  assert.deepEqual(
    getPathNodeHistoryEvents(task, firstNode, { isFirstPathNode: true }).map(
      (event) => event.id,
    ),
    ["submitted", "assigned-department"],
  );
  assert.deepEqual(
    getPathNodeHistoryEvents(task, laterNode, { isFirstPathNode: false }).map(
      (event) => event.id,
    ),
    ["assigned-cfo"],
  );
});

test("assigns audit history by target email when text does not name the path box", () => {
  const node = {
    id: "legal-review",
    kind: "review",
    label: "Legal review",
    x: 0,
    y: 0,
    assigneeEmail: "legal@example.com",
  };
  const task = {
    ...baseTask,
    auditTrail: [
      {
        id: "target-only",
        actor: "System",
        actorEmail: "system@example.com",
        action: "assigned",
        detail: "Assigned to the next owner.",
        timestamp: "2026-06-21 10:00",
        targetEmail: "legal@example.com",
      },
    ],
  };

  assert.deepEqual(
    getPathNodeHistoryEvents(task, node).map((event) => event.id),
    ["target-only"],
  );
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
