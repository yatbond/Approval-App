import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasDeleteState } from "./workflow-canvas-delete-state.ts";

const graph = {
  nodes: [
    { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
    { id: "review-1", label: "Review 1", kind: "review", x: 200, y: 0, blocking: true },
    { id: "end", label: "End", kind: "end", x: 400, y: 0, blocking: false },
  ],
  edges: [
    {
      id: "edge-1",
      sourceId: "review-1",
      targetId: "end",
      label: "Approved",
      branchType: "main",
      blocking: true,
    },
  ],
};

test("deletes a selected non-start node and clears related selection state", () => {
  const result = getWorkflowCanvasDeleteState({
    graph,
    selectedNodeId: "review-1",
    selectedEdgeId: "edge-1",
    connectFromNodeId: "review-1",
  });

  assert.equal(result.didDelete, true);
  assert.equal(result.label, "Deleted Review 1");
  assert.equal(result.selectedNodeId, null);
  assert.equal(result.selectedEdgeId, "edge-1");
  assert.equal(result.connectFromNodeId, null);
  assert.deepEqual(
    result.graph.nodes.map((node) => node.id),
    ["start", "end"],
  );
  assert.deepEqual(result.graph.edges, []);
});

test("protects the start node and can delete the selected edge instead", () => {
  const result = getWorkflowCanvasDeleteState({
    graph,
    selectedNodeId: "start",
    selectedEdgeId: "edge-1",
    connectFromNodeId: "start",
  });

  assert.equal(result.didDelete, true);
  assert.equal(result.label, "Deleted Approved branch");
  assert.equal(result.selectedNodeId, "start");
  assert.equal(result.selectedEdgeId, null);
  assert.equal(result.connectFromNodeId, "start");
  assert.deepEqual(
    result.graph.nodes.map((node) => node.id),
    ["start", "review-1", "end"],
  );
  assert.deepEqual(result.graph.edges, []);
});

test("protects the default end node and can delete the selected edge instead", () => {
  const result = getWorkflowCanvasDeleteState({
    graph,
    selectedNodeId: "end",
    selectedEdgeId: "edge-1",
    connectFromNodeId: "end",
  });

  assert.equal(result.didDelete, true);
  assert.equal(result.label, "Deleted Approved branch");
  assert.equal(result.selectedNodeId, "end");
  assert.equal(result.selectedEdgeId, null);
  assert.equal(result.connectFromNodeId, "end");
  assert.deepEqual(
    result.graph.nodes.map((node) => node.id),
    ["start", "review-1", "end"],
  );
  assert.deepEqual(result.graph.edges, []);
});

test("does not delete the default end node when no branch is selected", () => {
  const result = getWorkflowCanvasDeleteState({
    graph,
    selectedNodeId: "end",
    selectedEdgeId: null,
    connectFromNodeId: "review-1",
  });

  assert.equal(result.didDelete, false);
  assert.equal(result.label, "");
  assert.equal(result.graph, graph);
  assert.equal(result.selectedNodeId, "end");
  assert.equal(result.selectedEdgeId, null);
  assert.equal(result.connectFromNodeId, "review-1");
});

test("returns unchanged state when no deletable selection exists", () => {
  const result = getWorkflowCanvasDeleteState({
    graph,
    selectedNodeId: "start",
    selectedEdgeId: null,
    connectFromNodeId: "review-1",
  });

  assert.equal(result.didDelete, false);
  assert.equal(result.label, "");
  assert.equal(result.graph, graph);
  assert.equal(result.selectedNodeId, "start");
  assert.equal(result.selectedEdgeId, null);
  assert.equal(result.connectFromNodeId, "review-1");
});
