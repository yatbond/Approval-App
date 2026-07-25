import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowMoveNodeState,
  getWorkflowUpdateSelectedNodeState,
} from "./workflow-node-patch-state.ts";

const graph = {
  nodes: [
    { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
    { id: "review-1", label: "Review 1", kind: "review", x: 100, y: 100, blocking: true },
  ],
  edges: [],
};

test("moves a workflow box and returns the move label", () => {
  const result = getWorkflowMoveNodeState({
    graph,
    nodeId: "review-1",
    x: 240,
    y: 360,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Moved workflow box");
  const moved = result.graph.nodes.find((node) => node.id === "review-1");
  assert.equal(moved?.x, 240);
  assert.equal(moved?.y, 360);
});

test("updates a selected workflow box and returns the selected node label", () => {
  const result = getWorkflowUpdateSelectedNodeState({
    graph,
    selectedNode: graph.nodes[1],
    patch: { label: "Updated review", blocking: false },
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Updated Review 1");
  const updated = result.graph.nodes.find((node) => node.id === "review-1");
  assert.equal(updated?.label, "Updated review");
  assert.equal(updated?.blocking, false);
});

test("does not update when no selected workflow box exists", () => {
  const result = getWorkflowUpdateSelectedNodeState({
    graph,
    selectedNode: null,
    patch: { label: "Updated review" },
  });

  assert.equal(result.didUpdate, false);
  assert.equal(result.graph, graph);
  assert.equal(result.label, "");
});
