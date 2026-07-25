import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasResetState } from "./workflow-canvas-reset-state.ts";

test("clears canvas selections and increments the reset nonce", () => {
  const result = getWorkflowCanvasResetState({ canvasViewResetNonce: 7 });

  assert.deepEqual(result, {
    selectedNodeId: null,
    selectedEdgeId: null,
    connectFromNodeId: null,
    conditionOutcomeCaseId: null,
    canvasViewResetNonce: 8,
  });
});
