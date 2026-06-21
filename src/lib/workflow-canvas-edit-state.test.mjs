import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowConnectNodesState,
  getWorkflowCreateNodeState,
} from "./workflow-canvas-edit-state.ts";

const graph = {
  nodes: [
    { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
    { id: "review-1", label: "Review 1", kind: "review", x: 240, y: 0, blocking: true },
  ],
  edges: [],
};

test("creates an owner-backed canvas box and selects it", () => {
  const result = getWorkflowCreateNodeState({ graph, kind: "approval" });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Added Approval box");
  assert.equal(result.selectedEdgeId, null);
  const created = result.graph.nodes.at(-1);
  assert.equal(result.selectedNodeId, created?.id);
  assert.equal(created?.blocking, true);
  assert.equal(created?.assigneeName, "New owner");
  assert.equal(created?.assigneeEmail, "owner@example.com");
});

test("places a new box to the right of the selected box", () => {
  const result = getWorkflowCreateNodeState({
    graph,
    kind: "approval",
    selectedNodeId: "review-1",
  });
  const created = result.graph.nodes.at(-1);

  assert.equal(created?.x, 500);
  assert.equal(created?.y, 40);
});

test("places a new box after the rightmost box when no box is selected", () => {
  const result = getWorkflowCreateNodeState({ graph, kind: "condition" });
  const created = result.graph.nodes.at(-1);

  assert.equal(created?.x, 500);
  assert.equal(created?.y, 0);
});

test("nudges new boxes away from occupied positions", () => {
  const crowdedGraph = {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: "approval-occupied",
        label: "Approval",
        kind: "approval",
        x: 500,
        y: 40,
        blocking: true,
      },
    ],
  };
  const result = getWorkflowCreateNodeState({
    graph: crowdedGraph,
    kind: "approval",
    selectedNodeId: "review-1",
  });
  const created = result.graph.nodes.at(-1);

  assert.equal(created?.x, 620);
  assert.equal(created?.y, 200);
});

test("creates nonblocking for-information and end boxes with the expected defaults", () => {
  const fyi = getWorkflowCreateNodeState({ graph, kind: "for_information" });
  const end = getWorkflowCreateNodeState({ graph, kind: "end" });

  assert.equal(fyi.graph.nodes.at(-1)?.blocking, false);
  assert.equal(fyi.graph.nodes.at(-1)?.assigneeName, "New owner");
  assert.equal(fyi.graph.nodes.at(-1)?.assigneeEmail, "owner@example.com");
  assert.equal(end.graph.nodes.at(-1)?.blocking, false);
  assert.equal(end.graph.nodes.at(-1)?.assigneeName, undefined);
  assert.equal(end.graph.nodes.at(-1)?.assigneeEmail, undefined);
});

test("connects different boxes and selects the created edge", () => {
  const result = getWorkflowConnectNodesState({
    graph,
    sourceId: "start",
    targetId: "review-1",
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Connected workflow boxes");
  assert.equal(result.connectFromNodeId, null);
  assert.equal(result.selectedNodeId, null);
  assert.equal(result.selectedEdgeId, result.graph.edges.at(-1)?.id);
  assert.deepEqual(result.graph.edges.at(-1), {
    id: result.selectedEdgeId,
    sourceId: "start",
    targetId: "review-1",
    branchType: "main",
    label: "Next",
    rule: undefined,
    blocking: true,
  });
});

test("does not connect a box to itself", () => {
  const result = getWorkflowConnectNodesState({
    graph,
    sourceId: "start",
    targetId: "start",
  });

  assert.equal(result.didUpdate, false);
  assert.equal(result.graph, graph);
  assert.equal(result.selectedNodeId, undefined);
  assert.equal(result.selectedEdgeId, undefined);
  assert.equal(result.connectFromNodeId, undefined);
});
