import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalTasks, workflowTemplates } from "./mock-data.ts";
import { seededBusinessDirectory } from "./business-directory.ts";
import {
  createDefaultWorkspaceSnapshot,
  createWorkspaceSnapshotPatch,
  getInitialSelectedTaskId,
  shouldLoadRemoteWorkspace,
} from "./workspace-bootstrap.ts";

const activeUser = {
  name: "dpang",
  email: "dpang@chunwo.com",
  role: "superuser",
};

test("creates deterministic default workspace state from server and seed data", () => {
  const snapshot = createDefaultWorkspaceSnapshot({
    activeUser,
    approvalTasks,
    businessDirectory: seededBusinessDirectory,
    workflowTemplates,
  });

  assert.equal(snapshot.selectedTemplateId, workflowTemplates[0].id);
  assert.equal(snapshot.businessDirectory, seededBusinessDirectory);
  assert.equal(snapshot.workflowTemplates, workflowTemplates);
  assert.equal(snapshot.approvalTasks[0].currentOwner, activeUser.email);
  assert.ok(
    snapshot.userRoleAssignments.some(
      (assignment) =>
        assignment.email === activeUser.email &&
        assignment.businessId === seededBusinessDirectory[0].id,
    ),
  );
});

test("resolves selected task from request id, saved state, then seed fallback", () => {
  assert.equal(
    getInitialSelectedTaskId({
      requestId: "request-123",
      savedApprovalTasks: [{ id: "saved-task" }],
      seedApprovalTasks: approvalTasks,
    }),
    "request-123",
  );
  assert.equal(
    getInitialSelectedTaskId({
      requestId: "",
      savedApprovalTasks: [{ id: "saved-task" }],
      seedApprovalTasks: approvalTasks,
    }),
    "saved-task",
  );
  assert.equal(
    getInitialSelectedTaskId({
      requestId: "",
      savedApprovalTasks: [],
      seedApprovalTasks: approvalTasks,
    }),
    approvalTasks[0].id,
  );
});

test("loads remote workspace only after local readiness and without saved local state", () => {
  assert.equal(shouldLoadRemoteWorkspace({ localWorkspaceReady: false, savedWorkspaceState: null }), false);
  assert.equal(
    shouldLoadRemoteWorkspace({
      localWorkspaceReady: true,
      savedWorkspaceState: createDefaultWorkspaceSnapshot({
        activeUser,
        approvalTasks,
        businessDirectory: seededBusinessDirectory,
        workflowTemplates,
      }),
    }),
    false,
  );
  assert.equal(shouldLoadRemoteWorkspace({ localWorkspaceReady: true, savedWorkspaceState: null }), true);
});

test("creates persisted workspace patches without losing explicit empty template selection", () => {
  const current = createDefaultWorkspaceSnapshot({
    activeUser,
    approvalTasks,
    businessDirectory: seededBusinessDirectory,
    workflowTemplates,
  });

  const patched = createWorkspaceSnapshotPatch(current, {
    selectedTemplateId: "",
  });

  assert.equal(patched.selectedTemplateId, "");
  assert.equal(patched.approvalTasks, current.approvalTasks);
  assert.equal(patched.workflowTemplates, current.workflowTemplates);
});
