import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceShellState } from "./workspace-shell-state.ts";

test("combines seed and workflow notification unread counts", () => {
  const state = getWorkspaceShellState({
    baseNotifications: [{ unread: true }, { unread: false }],
    taskNotifications: [{ unread: true }, { unread: true }],
    workspaceSyncMode: "supabase",
  });

  assert.equal(state.unreadCount, 3);
});

test("formats workspace sync status labels", () => {
  assert.equal(
    getWorkspaceShellState({
      baseNotifications: [],
      taskNotifications: [],
      workspaceSyncMode: "loading",
    }).syncLabel,
    "Sync checking",
  );
  assert.equal(
    getWorkspaceShellState({
      baseNotifications: [],
      taskNotifications: [],
      workspaceSyncMode: "supabase",
    }).syncLabel,
    "Saved to Supabase",
  );
  assert.equal(
    getWorkspaceShellState({
      baseNotifications: [],
      taskNotifications: [],
      workspaceSyncMode: "local",
    }).syncLabel,
    "Saved locally",
  );
});
