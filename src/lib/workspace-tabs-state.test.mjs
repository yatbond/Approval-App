import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialWorkspaceTab,
  workspaceTabIds,
} from "./workspace-tabs-state.ts";

test("includes drafts as a first-class workspace tab after upload", () => {
  assert.deepEqual(workspaceTabIds, [
    "queue",
    "tracking",
    "upload",
    "drafts",
    "workflow",
    "admin",
  ]);
});

test("resolves requested workspace tabs with a queue fallback", () => {
  assert.equal(getInitialWorkspaceTab("drafts"), "drafts");
  assert.equal(getInitialWorkspaceTab("workflow"), "workflow");
  assert.equal(getInitialWorkspaceTab("missing"), "queue");
  assert.equal(getInitialWorkspaceTab(), "queue");
});
