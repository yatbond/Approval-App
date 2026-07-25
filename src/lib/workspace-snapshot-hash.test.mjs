import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceSnapshotHash } from "./workspace-snapshot-hash.ts";

function createSnapshot() {
  return {
    selectedTemplateId: "template-1",
    approvalTasks: [],
    businessDirectory: [],
    workflowTemplates: [],
    userRoleAssignments: [],
    adminAuditEvents: [],
    formLibrary: [],
  };
}

test("creates a stable SHA-256 hash for an unchanged workspace", () => {
  const snapshot = createSnapshot();

  assert.equal(
    createWorkspaceSnapshotHash(snapshot),
    createWorkspaceSnapshotHash(structuredClone(snapshot)),
  );
  assert.match(createWorkspaceSnapshotHash(snapshot), /^[a-f0-9]{64}$/);
});

test("changes the hash when persisted workspace content changes", () => {
  const snapshot = createSnapshot();
  const changedSnapshot = {
    ...snapshot,
    selectedTemplateId: "template-2",
  };

  assert.notEqual(
    createWorkspaceSnapshotHash(snapshot),
    createWorkspaceSnapshotHash(changedSnapshot),
  );
});
