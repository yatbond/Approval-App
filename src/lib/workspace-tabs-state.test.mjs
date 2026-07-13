import assert from "node:assert/strict";
import test from "node:test";
import {
  getNewRequestHref,
  getInitialWorkspaceTab,
  getWorkspaceNavigationActiveTab,
  isNewRequestStartRequested,
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

test("marks plus new as a fresh request instead of a draft resume", () => {
  assert.equal(getNewRequestHref(), "/?tab=upload&new=1");
  assert.equal(isNewRequestStartRequested("1"), true);
  assert.equal(isNewRequestStartRequested("true"), true);
  assert.equal(isNewRequestStartRequested("0"), false);
  assert.equal(isNewRequestStartRequested(), false);
});

test("keeps Drafts highlighted while editing a resumed draft", () => {
  assert.equal(
    getWorkspaceNavigationActiveTab({ activeTab: "upload", isNewRequest: false }),
    "drafts",
  );
  assert.equal(
    getWorkspaceNavigationActiveTab({ activeTab: "upload", isNewRequest: true }),
    "upload",
  );
  assert.equal(
    getWorkspaceNavigationActiveTab({ activeTab: "tracking", isNewRequest: false }),
    "tracking",
  );
});
