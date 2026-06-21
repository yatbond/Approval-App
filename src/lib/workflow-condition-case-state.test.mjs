import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowAddConditionCaseState,
  getWorkflowAddFallbackConditionCaseState,
} from "./workflow-condition-case-state.ts";

const graph = {
  nodes: [
    { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
    { id: "review-1", label: "Review 1", kind: "review", x: 200, y: 0, blocking: true },
    {
      id: "condition-1",
      label: "Condition 1",
      kind: "condition",
      x: 400,
      y: 0,
      blocking: true,
      conditionCases: [],
    },
  ],
  edges: [],
};

test("adds a condition case to a selected condition box with upstream defaults", () => {
  const result = getWorkflowAddConditionCaseState({
    graph,
    selectedNodeId: "condition-1",
    upstreamNodeIds: ["review-1"],
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Added condition");
  const conditionCases = result.graph.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases;
  assert.equal(conditionCases?.length, 1);
  assert.deepEqual(conditionCases?.[0].approvalRule?.upstreamNodeIds, ["review-1"]);
});

test("adds one fallback case and leaves existing fallback unchanged", () => {
  const added = getWorkflowAddFallbackConditionCaseState({
    graph,
    selectedNodeId: "condition-1",
    fallbackCaseId: "fallback-1",
  });

  assert.equal(added.didUpdate, true);
  assert.equal(added.label, "Added all other outcome");
  const conditionCases = added.graph.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases;
  assert.deepEqual(conditionCases?.[0], {
    id: "fallback-1",
    name: "All other conditions",
    isFallback: true,
    join: "and",
    targetNodeIds: [],
  });

  const second = getWorkflowAddFallbackConditionCaseState({
    graph: added.graph,
    selectedNodeId: "condition-1",
    fallbackCaseId: "fallback-2",
  });
  assert.equal(second.didUpdate, false);
  assert.equal(second.graph, added.graph);
});

test("does not update when the selected box is missing or not a condition", () => {
  assert.equal(
    getWorkflowAddConditionCaseState({
      graph,
      selectedNodeId: "review-1",
      upstreamNodeIds: ["start"],
    }).didUpdate,
    false,
  );
  assert.equal(
    getWorkflowAddFallbackConditionCaseState({
      graph,
      selectedNodeId: null,
      fallbackCaseId: "fallback-1",
    }).didUpdate,
    false,
  );
});
