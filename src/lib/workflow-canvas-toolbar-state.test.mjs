import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasToolbarState } from "./workflow-canvas-toolbar-state.ts";

test("formats connect-from prompt for an active source box", () => {
  const state = getWorkflowCanvasToolbarState({
    connectFromNode: { id: "review-1", label: "Review 1", kind: "review" },
    selectedNode: undefined,
    conditionOutcomeCaseId: null,
  });

  assert.equal(
    state.connectMessage,
    "Connecting from Review 1. Click another box to create the branch.",
  );
  assert.equal(state.outcomeMessage, "");
});

test("formats condition outcome prompt only for a selected condition box", () => {
  const state = getWorkflowCanvasToolbarState({
    connectFromNode: undefined,
    selectedNode: { id: "condition-1", label: "Condition 1", kind: "condition" },
    conditionOutcomeCaseId: "case-1",
  });

  assert.equal(state.connectMessage, "");
  assert.equal(
    state.outcomeMessage,
    "Assigning outcomes for Condition 1. Click downstream boxes to add them to the selected condition case.",
  );
});

test("does not show condition outcome prompt for non-condition boxes", () => {
  const state = getWorkflowCanvasToolbarState({
    connectFromNode: undefined,
    selectedNode: { id: "review-1", label: "Review 1", kind: "review" },
    conditionOutcomeCaseId: "case-1",
  });

  assert.equal(state.outcomeMessage, "");
});
