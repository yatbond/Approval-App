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

test("builds a stable canvas key from workflow graph and runtime identity", () => {
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

  assert.match(key, /^workflow-1:/);
  const payload = JSON.parse(key.slice(key.indexOf(":") + 1));
  assert.equal(payload.reset, 2);
  assert.deepEqual(payload.nodes, [
    {
      id: "review-1",
      kind: "review",
      label: "Review",
      assigneeEmail: "reviewer@example.com",
      documentIds: ["doc-1"],
    },
  ]);
  assert.deepEqual(payload.runtime, {
    taskId: "task-1",
    currentNodeId: "review-1",
    completedNodeIds: ["start"],
    notifiedNodeIds: ["fyi-1"],
  });
});

test("uses empty workflow and runtime identity when there is no workflow or runtime task", () => {
  const key = getWorkflowCanvasInstanceKey({
    workflowId: "",
    resetNonce: 0,
    graph: { nodes: [], edges: [] },
    runtimeTask: null,
  });

  assert.equal(
    key,
    'empty:{"reset":0,"nodes":[],"edges":[],"runtime":{}}',
  );
});
