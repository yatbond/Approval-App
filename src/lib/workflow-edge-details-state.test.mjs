import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowEdgeDetailsState } from "./workflow-edge-details-state.ts";

const baseEdge = {
  id: "edge-1",
  sourceId: "review-1",
  targetId: "approval-1",
  label: "Condition branch",
  branchType: "condition",
  blocking: true,
};

const fields = [
  {
    name: "invoice_total",
    label: "Invoice total",
    type: "number",
    required: true,
    source: "ai",
    instructions: "Extract total.",
  },
];

test("defaults a condition edge rule to the first workflow field", () => {
  const state = getWorkflowEdgeDetailsState({
    edge: baseEdge,
    workflowFields: fields,
  });

  assert.equal(state.showsRuleBuilder, true);
  assert.equal(state.ruleFieldValue, "invoice_total");
  assert.equal(state.ruleOperatorValue, "=");
  assert.equal(state.ruleValue, "");
});

test("disables blocking and shows guidance for for-information edges", () => {
  const state = getWorkflowEdgeDetailsState({
    edge: {
      ...baseEdge,
      label: "FYI",
      branchType: "for_information",
      blocking: false,
    },
    workflowFields: fields,
  });

  assert.equal(state.showsRuleBuilder, false);
  assert.equal(state.canBlockWorkflow, false);
  assert.equal(state.showsForInformationNote, true);
});

test("uses saved rule values when the edge already has a rule", () => {
  const state = getWorkflowEdgeDetailsState({
    edge: {
      ...baseEdge,
      rule: {
        field: "quantity",
        operator: ">=",
        value: "3",
      },
    },
    workflowFields: fields,
  });

  assert.equal(state.ruleFieldValue, "quantity");
  assert.equal(state.ruleOperatorValue, ">=");
  assert.equal(state.ruleValue, "3");
});
