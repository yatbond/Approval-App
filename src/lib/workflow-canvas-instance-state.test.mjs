import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasInstanceKey } from "./workflow-canvas-instance-state.ts";

const graph = {
  nodes: [
    {
      id: "review-1",
      kind: "review",
      label: "Review",
      x: 10,
      y: 20,
      assigneeEmail: "reviewer@example.com",
      documentIds: ["doc-1"],
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
};

test("builds a stable canvas key from workflow identity and explicit reset only", () => {
  const key = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 2,
    graph,
    runtimeTask: {
      id: "task-1",
      currentNodeId: "review-1",
      completedNodeIds: ["start"],
      notifiedNodeIds: ["fyi-1"],
    },
  });

  assert.equal(key, "workflow-1:reset-2");
});

test("uses empty workflow and runtime identity when there is no workflow or runtime task", () => {
  const key = getWorkflowCanvasInstanceKey({
    workflowId: "",
    resetNonce: 0,
    graph: { nodes: [], edges: [] },
    runtimeTask: null,
  });

  assert.equal(key, "empty:reset-0");
});

test("does not change the canvas key when graph content or runtime state changes", () => {
  const baseKey = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 0,
    graph,
    runtimeTask: null,
  });
  const changedKey = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 0,
    graph: {
      nodes: [
        ...graph.nodes,
        {
          id: "approval-1",
          kind: "approval",
          label: "Approval",
          x: 400,
          y: 20,
        },
      ],
      edges: graph.edges,
    },
    runtimeTask: {
      id: "task-2",
      currentNodeId: "approval-1",
      completedNodeIds: ["review-1"],
      notifiedNodeIds: [],
    },
  });

  assert.equal(changedKey, baseKey);
});
