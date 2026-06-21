import assert from "node:assert/strict";
import test from "node:test";
import { workflowPublishAction } from "./workflow-publish-action-state.ts";

test("labels publishing as a completion action for the canvas", () => {
  assert.equal(workflowPublishAction.label, "Publish");
  assert.equal(workflowPublishAction.placement, "canvas-footer");
  assert.match(workflowPublishAction.title, /finished editing/i);
});
