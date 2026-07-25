import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasSelectionState } from "./workflow-canvas-selection-state.ts";

const graph = {
  nodes: [
    { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
    {
      id: "condition-1",
      kind: "condition",
      label: "Condition 1",
      x: 100,
      y: 0,
      conditionCases: [
        {
          id: "case-1",
          name: "Condition 1",
          join: "and",
          targetNodeIds: ["approval-1", "fyi-1"],
        },
      ],
    },
    { id: "approval-1", kind: "approval", label: "Approval", x: 200, y: 0 },
  ],
  edges: [
    {
      id: "edge-1",
      sourceId: "start",
      targetId: "condition-1",
      label: "Next",
      branchType: "main",
    },
  ],
};

test("resolves selected node, edge, connect source, and active outcome targets", () => {
  const state = getWorkflowCanvasSelectionState({
    graph,
    selectedNodeId: "condition-1",
    selectedEdgeId: "edge-1",
    connectFromNodeId: "start",
    conditionOutcomeCaseId: "case-1",
  });

  assert.equal(state.selectedGraphNode?.id, "condition-1");
  assert.equal(state.selectedGraphEdge?.id, "edge-1");
  assert.equal(state.connectFromNode?.id, "start");
  assert.deepEqual([...state.activeOutcomeTargetIds].sort(), [
    "approval-1",
    "fyi-1",
  ]);
});

test("returns empty outcome targets when no condition case is selected", () => {
  const state = getWorkflowCanvasSelectionState({
    graph,
    selectedNodeId: "condition-1",
    selectedEdgeId: null,
    connectFromNodeId: null,
    conditionOutcomeCaseId: null,
  });

  assert.deepEqual([...state.activeOutcomeTargetIds], []);
});

test("returns null selected items for missing ids", () => {
  const state = getWorkflowCanvasSelectionState({
    graph,
    selectedNodeId: "missing-node",
    selectedEdgeId: "missing-edge",
    connectFromNodeId: "missing-connect",
    conditionOutcomeCaseId: "case-1",
  });

  assert.equal(state.selectedGraphNode, null);
  assert.equal(state.selectedGraphEdge, null);
  assert.equal(state.connectFromNode, null);
  assert.deepEqual([...state.activeOutcomeTargetIds], []);
});
