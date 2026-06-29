import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceShellState } from "./workspace-shell-state.ts";

test("combines seed and workflow notification unread counts", () => {
  const state = getWorkspaceShellState({
    baseNotifications: [{ unread: true }, { unread: false }],
    draftItemCount: 2,
    taskNotifications: [{ unread: true }, { unread: true }],
    workspaceSyncMode: "supabase",
  });

  assert.equal(state.unreadCount, 3);
  assert.equal(state.draftItemCount, 2);
});

test("sanitizes negative or fractional draft item counts for badges", () => {
  assert.equal(
    getWorkspaceShellState({
      baseNotifications: [],
      draftItemCount: -1,
      taskNotifications: [],
      workspaceSyncMode: "supabase",
    }).draftItemCount,
    0,
  );
  assert.equal(
    getWorkspaceShellState({
      baseNotifications: [],
      draftItemCount: 2.9,
      taskNotifications: [],
      workspaceSyncMode: "supabase",
    }).draftItemCount,
    2,
  );
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
