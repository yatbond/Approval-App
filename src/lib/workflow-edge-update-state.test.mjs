import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowUpdateSelectedEdgeRuleState,
  getWorkflowUpdateSelectedEdgeState,
} from "./workflow-edge-update-state.ts";

const graph = {
  nodes: [
    { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
    { id: "review-1", label: "Review 1", kind: "review", x: 200, y: 0, blocking: true },
  ],
  edges: [
    {
      id: "edge-1",
      sourceId: "start",
      targetId: "review-1",
      label: "Main route",
      branchType: "main",
      blocking: true,
    },
  ],
};

const workflowFields = [
  {
    name: "invoice_total",
    label: "Invoice total",
    type: "number",
    required: true,
    source: "ai",
    instructions: "Extract total.",
  },
];

test("updates a selected workflow edge and returns the branch label", () => {
  const selectedEdge = graph.edges[0];

  const result = getWorkflowUpdateSelectedEdgeState({
    graph,
    selectedEdge,
    patch: { label: "Approved route", branchType: "approved" },
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Updated Main route branch");
  const edge = result.graph.edges.find((item) => item.id === "edge-1");
  assert.equal(edge?.label, "Approved route");
  assert.equal(edge?.branchType, "approved");
});

test("for-information edge updates are nonblocking and get a default label", () => {
  const selectedEdge = graph.edges[0];

  const result = getWorkflowUpdateSelectedEdgeState({
    graph,
    selectedEdge,
    patch: { branchType: "for_information", label: "", blocking: true },
  });

  assert.equal(result.didUpdate, true);
  const edge = result.graph.edges.find((item) => item.id === "edge-1");
  assert.equal(edge?.branchType, "for_information");
  assert.equal(edge?.blocking, false);
  assert.equal(edge?.label, "For information");
});

test("updates one rule field while preserving or defaulting the rest", () => {
  const selectedEdge = {
    ...graph.edges[0],
    rule: {
      field: "invoice_total",
      operator: ">=",
      value: "3000",
    },
  };
  const graphWithRule = {
    ...graph,
    edges: [selectedEdge],
  };

  const result = getWorkflowUpdateSelectedEdgeRuleState({
    graph: graphWithRule,
    selectedEdge,
    workflowFields,
    key: "operator",
    value: "<",
  });

  assert.equal(result.didUpdate, true);
  assert.deepEqual(result.graph.edges[0].rule, {
    field: "invoice_total",
    operator: "<",
    value: "3000",
  });

  const defaulted = getWorkflowUpdateSelectedEdgeRuleState({
    graph,
    selectedEdge: graph.edges[0],
    workflowFields,
    key: "value",
    value: "10000",
  });
  assert.deepEqual(defaulted.graph.edges[0].rule, {
    field: "invoice_total",
    operator: "=",
    value: "10000",
  });
});

test("does not update when no workflow edge is selected", () => {
  const result = getWorkflowUpdateSelectedEdgeState({
    graph,
    selectedEdge: null,
    patch: { label: "Updated" },
  });

  assert.equal(result.didUpdate, false);
  assert.equal(result.graph, graph);
  assert.equal(result.label, "");
});
