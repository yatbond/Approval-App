import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowAddConditionCaseState,
  getWorkflowAddFallbackConditionCaseState,
  getWorkflowAddOutcomeTargetState,
  getWorkflowDeleteConditionCaseState,
  getWorkflowUpdateConditionCaseState,
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

test("updates a selected condition case", () => {
  const graphWithCase = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === "condition-1"
        ? {
            ...node,
            conditionCases: [
              {
                id: "case-1",
                name: "Condition 1",
                join: "and",
                targetNodeIds: [],
              },
            ],
          }
        : node,
    ),
  };

  const result = getWorkflowUpdateConditionCaseState({
    graph: graphWithCase,
    selectedNodeId: "condition-1",
    caseId: "case-1",
    patch: { join: "or", name: "High value" },
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Updated condition");
  const conditionCase = result.graph.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases?.[0];
  assert.equal(conditionCase?.join, "or");
  assert.equal(conditionCase?.name, "High value");
});

test("deletes a selected condition case and clears the active outcome case when needed", () => {
  const graphWithCases = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === "condition-1"
        ? {
            ...node,
            conditionCases: [
              {
                id: "case-1",
                name: "Condition 1",
                join: "and",
                targetNodeIds: [],
              },
              {
                id: "case-2",
                name: "Condition 2",
                join: "and",
                targetNodeIds: [],
              },
            ],
          }
        : node,
    ),
  };

  const result = getWorkflowDeleteConditionCaseState({
    graph: graphWithCases,
    selectedNodeId: "condition-1",
    caseId: "case-1",
    activeOutcomeCaseId: "case-1",
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Deleted condition");
  assert.equal(result.activeOutcomeCaseId, null);
  assert.deepEqual(
    result.graph.nodes.find((node) => node.id === "condition-1")?.conditionCases,
    [
      {
        id: "case-2",
        name: "Condition 2",
        join: "and",
        targetNodeIds: [],
      },
    ],
  );
});

test("deleting an inactive condition case preserves the active outcome case", () => {
  const graphWithCases = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === "condition-1"
        ? {
            ...node,
            conditionCases: [
              {
                id: "case-1",
                name: "Condition 1",
                join: "and",
                targetNodeIds: [],
              },
              {
                id: "case-2",
                name: "Condition 2",
                join: "and",
                targetNodeIds: [],
              },
            ],
          }
        : node,
    ),
  };

  const result = getWorkflowDeleteConditionCaseState({
    graph: graphWithCases,
    selectedNodeId: "condition-1",
    caseId: "case-1",
    activeOutcomeCaseId: "case-2",
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.activeOutcomeCaseId, "case-2");
});

test("adds a clicked outcome target to the active condition case once", () => {
  const graphWithTarget = {
    nodes: [
      ...graph.nodes,
      { id: "approval-1", label: "Approval", kind: "approval", x: 600, y: 0, blocking: true },
    ].map((node) =>
      node.id === "condition-1"
        ? {
            ...node,
            conditionCases: [
              {
                id: "case-1",
                name: "Condition 1",
                join: "and",
                targetNodeIds: ["approval-1"],
              },
            ],
          }
        : node,
    ),
    edges: [],
  };

  const invalid = getWorkflowAddOutcomeTargetState({
    graph: graphWithTarget,
    selectedNodeId: "condition-1",
    activeOutcomeCaseId: "case-1",
    targetNodeId: "start",
  });
  assert.equal(invalid.didUpdate, false);

  const result = getWorkflowAddOutcomeTargetState({
    graph: graphWithTarget,
    selectedNodeId: "condition-1",
    activeOutcomeCaseId: "case-1",
    targetNodeId: "approval-1",
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Updated condition");
  assert.deepEqual(
    result.graph.nodes.find((node) => node.id === "condition-1")?.conditionCases?.[0]
      .targetNodeIds,
    ["approval-1"],
  );
});
