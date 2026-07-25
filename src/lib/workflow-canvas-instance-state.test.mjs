import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowCanvasInstanceKey } from "./workflow-canvas-instance-state.ts";

test("builds a stable canvas key from workflow identity and explicit reset only", () => {
  const key = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 2,
  });

  assert.equal(key, "workflow-1:reset-2");
});

test("uses the empty workflow identity when no workflow is selected", () => {
  const key = getWorkflowCanvasInstanceKey({
    workflowId: "",
    resetNonce: 0,
  });

  assert.equal(key, "empty:reset-0");
});

test("changes the canvas key only when an explicit reset is requested", () => {
  const baseKey = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 0,
  });
  const resetKey = getWorkflowCanvasInstanceKey({
    workflowId: "workflow-1",
    resetNonce: 1,
  });

  assert.notEqual(resetKey, baseKey);
});
