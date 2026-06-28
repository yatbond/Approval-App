import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialWorkspaceTab,
  workspaceNavigationTabIds,
  workspaceTabIds,
} from "./workspace-tabs-state.ts";

test("keeps upload as an internal request creation route", () => {
  assert.deepEqual(workspaceTabIds, [
    "queue",
    "tracking",
    "upload",
    "drafts",
    "workflow",
    "admin",
  ]);
});

test("omits upload from the main navigation because new request opens it", () => {
  assert.deepEqual(workspaceNavigationTabIds, [
    "queue",
    "tracking",
    "drafts",
    "workflow",
    "admin",
  ]);
});

test("resolves requested workspace tabs with a queue fallback", () => {
  assert.equal(getInitialWorkspaceTab("upload"), "upload");
  assert.equal(getInitialWorkspaceTab("drafts"), "drafts");
  assert.equal(getInitialWorkspaceTab("workflow"), "workflow");
  assert.equal(getInitialWorkspaceTab("missing"), "queue");
  assert.equal(getInitialWorkspaceTab(), "queue");
});
