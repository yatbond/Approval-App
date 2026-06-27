import assert from "node:assert/strict";
import test from "node:test";
import {
  describeConditionCase,
  getConditionDisplayName,
  getConditionNickname,
  getConditionRoutingState,
} from "./condition-routing-state.ts";

const context = {
  upstreamNodes: [
    { id: "review-1", label: "Review 1" },
    { id: "review-2", label: "Review 2" },
    { id: "review-3", label: "Review 3" },
  ],
  numericFields: [{ name: "invoice_total", label: "Invoice total" }],
};

const graph = {
  nodes: [
    { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
    { id: "condition", kind: "condition", label: "Condition", x: 100, y: 100 },
    { id: "review-1", kind: "review", label: "Review 1", x: 200, y: 100 },
    { id: "return", kind: "return_reject", label: "Return", x: 300, y: 100 },
  ],
  edges: [],
};

test("orders numbered condition cases before fallback and numbers display names", () => {
  const fallback = {
    id: "fallback",
    name: "Fallback",
    isFallback: true,
    join: "and",
    targetNodeIds: ["return"],
  };
  const first = {
    id: "case-1",
    name: "High value",
    join: "and",
    targetNodeIds: ["review-1"],
  };
  const conditionNode = {
    id: "condition",
    kind: "condition",
    label: "Condition",
    x: 0,
    y: 0,
    conditionCases: [fallback, first],
  };

  const state = getConditionRoutingState({ graph, conditionNode });

  assert.deepEqual(
    state.conditionCases.map((conditionCase) => conditionCase.id),
    ["case-1", "fallback"],
  );
  assert.equal(getConditionDisplayName(state.conditionCases, first), "Condition 1");
  assert.equal(
    getConditionDisplayName(state.conditionCases, fallback),
    "Fallback",
  );
});

test("hides default condition names while preserving nicknames", () => {
  assert.equal(
    getConditionNickname({
      id: "case-1",
      name: "Condition 1",
      join: "and",
      targetNodeIds: [],
    }),
    "",
  );
  assert.equal(
    getConditionNickname({
      id: "case-2",
      name: "High value route",
      join: "and",
      targetNodeIds: [],
    }),
    "High value route",
  );
});

test("describes approval count and numeric rules with labels", () => {
  const description = describeConditionCase({
    conditionCase: {
      id: "case-1",
      name: "Condition 1",
      isApprovalCount: true,
      approvalRule: {
        upstreamNodeIds: ["review-1", "review-2", "review-3"],
        minimumApproved: 2,
        mode: "at_least",
      },
      numericRule: {
        field: "invoice_total",
        operator: ">=",
        value: "5000",
      },
      join: "and",
      targetNodeIds: ["review-1"],
    },
    context,
  });

  assert.equal(
    description,
    "At least 2 of 3 approve (Review 1, Review 2, Review 3) AND Invoice total >= 5000",
  );
});

test("describes exact approval counts and OR numeric joins", () => {
  const description = describeConditionCase({
    conditionCase: {
      id: "case-1",
      name: "Condition 1",
      isApprovalCount: true,
      approvalRule: {
        upstreamNodeIds: ["review-1", "review-2"],
        minimumApproved: 1,
        mode: "exactly",
      },
      numericRule: {
        field: "invoice_total",
        operator: ">",
        value: "3000",
      },
      join: "or",
      targetNodeIds: ["review-1"],
    },
    context,
  });

  assert.equal(
    description,
    "Exactly 1 of 2 approve (Review 1, Review 2) OR Invoice total > 3000",
  );
});

test("describes fallback and empty numbered conditions", () => {
  assert.equal(
    describeConditionCase({
      conditionCase: {
        id: "fallback",
        name: "Fallback",
        isFallback: true,
        join: "and",
        targetNodeIds: ["return"],
      },
      context,
    }),
    "Else route.",
  );

  assert.equal(
    describeConditionCase({
      conditionCase: {
        id: "case-1",
        name: "Condition 1",
        join: "and",
        targetNodeIds: [],
      },
      context,
    }),
    "No rule yet.",
  );
});

test("lists only non-start non-condition nodes as available targets", () => {
  const state = getConditionRoutingState({
    graph,
    conditionNode: {
      id: "condition",
      kind: "condition",
      label: "Condition",
      x: 0,
      y: 0,
      conditionCases: [],
    },
  });

  assert.deepEqual(
    state.availableTargets.map((node) => node.id),
    ["review-1", "return"],
  );
});
