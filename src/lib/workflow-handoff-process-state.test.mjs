import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorkflowHandoffProcessPatch,
  getNextWorkflowHandoffProcessId,
} from "./workflow-handoff-process-state.ts";

test("creates the next unused handoff process id", () => {
  assert.equal(getNextWorkflowHandoffProcessId([]), "handoff-check-1");
  assert.equal(
    getNextWorkflowHandoffProcessId([
      {
        id: "handoff-check-3",
        type: "comparison",
        label: "Compare",
        leftField: "Amount",
        operator: "=",
        rightField: "Invoice total",
      },
      {
        id: "handoff-check-4",
        type: "calculation",
        label: "Difference",
        leftField: "Amount",
        calculation: "difference",
        rightField: "Invoice total",
      },
    ]),
    "handoff-check-5",
  );
});

test("changes a comparison into a calculation with a safe default", () => {
  assert.deepEqual(
    applyWorkflowHandoffProcessPatch(
      {
        id: "handoff-check-1",
        type: "comparison",
        label: "Compare",
        leftField: "Amount",
        operator: ">",
        rightField: "Invoice total",
      },
      { type: "calculation" },
    ),
    {
      id: "handoff-check-1",
      type: "calculation",
      label: "Compare",
      leftField: "Amount",
      calculation: "difference",
      rightField: "Invoice total",
    },
  );
});

test("changes a calculation into a comparison with a safe default", () => {
  assert.deepEqual(
    applyWorkflowHandoffProcessPatch(
      {
        id: "handoff-check-1",
        type: "calculation",
        label: "Difference",
        leftField: "Amount",
        calculation: "percentage_difference",
        rightField: "Invoice total",
      },
      { type: "comparison", label: "Validate" },
    ),
    {
      id: "handoff-check-1",
      type: "comparison",
      label: "Validate",
      leftField: "Amount",
      operator: "=",
      rightField: "Invoice total",
    },
  );
});

test("patches fields while preserving the active process mode", () => {
  assert.deepEqual(
    applyWorkflowHandoffProcessPatch(
      {
        id: "handoff-check-2",
        type: "comparison",
        label: "Compare",
        leftField: "Amount",
        operator: "=",
        rightField: "Invoice total",
      },
      { leftField: "Payment amount", operator: ">=" },
    ),
    {
      id: "handoff-check-2",
      type: "comparison",
      label: "Compare",
      leftField: "Payment amount",
      operator: ">=",
      rightField: "Invoice total",
    },
  );
});
