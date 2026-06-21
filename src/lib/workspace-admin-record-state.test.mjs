import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminRecordDeleteFailureState,
  getAdminRecordDeleteSyncState,
  getUpdatedBusinessDirectoryRecordState,
  getUpdatedRoleAssignmentRecordState,
} from "./workspace-admin-record-state.ts";

const businessDirectory = [
  {
    id: "business-1",
    name: "Asia Allied Infrastructure",
    departments: ["Finance"],
  },
];

const roleAssignments = [
  {
    email: "approver@example.com",
    name: "Approver",
    role: "approver",
    businessId: "business-1",
    department: "Finance",
  },
];

test("updates role assignment records with the supplied updater", () => {
  const state = getUpdatedRoleAssignmentRecordState({
    roleAssignments,
    updater: (items) => [
      ...items,
      {
        email: "reviewer@example.com",
        name: "Reviewer",
        role: "reviewer",
        businessId: "business-1",
        department: "Finance",
      },
    ],
  });

  assert.equal(state.roleAssignments.length, 2);
  assert.equal(state.roleAssignments[1].email, "reviewer@example.com");
  assert.equal(roleAssignments.length, 1);
});

test("updates business directory records with the supplied updater", () => {
  const state = getUpdatedBusinessDirectoryRecordState({
    businessDirectory,
    updater: (items) =>
      items.map((business) =>
        business.id === "business-1"
          ? { ...business, departments: [...business.departments, "Legal"] }
          : business,
      ),
  });

  assert.deepEqual(state.businessDirectory[0].departments, ["Finance", "Legal"]);
  assert.deepEqual(businessDirectory[0].departments, ["Finance"]);
});

test("blocks admin deletes while workspace sync mode is still loading", () => {
  const state = getAdminRecordDeleteSyncState({ workspaceSyncMode: "loading" });

  assert.equal(state.canContinue, false);
  assert.equal(state.shouldDeactivateRemote, false);
  assert.match(state.error, /still syncing/i);
});

test("requires remote deactivation only in supabase sync mode", () => {
  assert.deepEqual(
    getAdminRecordDeleteSyncState({ workspaceSyncMode: "supabase" }),
    {
      canContinue: true,
      shouldDeactivateRemote: true,
      error: "",
    },
  );
  assert.deepEqual(
    getAdminRecordDeleteSyncState({ workspaceSyncMode: "local" }),
    {
      canContinue: true,
      shouldDeactivateRemote: false,
      error: "",
    },
  );
});

test("allows local template delete when the remote template row is already missing", () => {
  const state = getAdminRecordDeleteFailureState({
    record: {
      type: "template",
      templateKey: "missing-template",
      versionNumber: 10,
    },
    reason:
      "PATCH failed: 503 - No active template version matched this delete request.",
  });

  assert.equal(state.canContinue, true);
  assert.match(state.error, /already missing/i);
});

test("allows local template delete when the remote template soft-delete is blocked by RLS", () => {
  const state = getAdminRecordDeleteFailureState({
    record: {
      type: "template",
      templateKey: "template-finance",
      versionNumber: 1,
    },
    reason:
      'PATCH failed: 503 - new row violates row-level security policy for table "workflow_template_versions"',
  });

  assert.equal(state.canContinue, true);
  assert.match(state.error, /row-level security/i);
});

test("blocks local delete for other remote deactivation failures", () => {
  const state = getAdminRecordDeleteFailureState({
    record: {
      type: "business",
      businessId: "business-aai-db",
    },
    reason: "PATCH failed: 503 - database timeout",
  });

  assert.equal(state.canContinue, false);
  assert.equal(state.error, "PATCH failed: 503 - database timeout");
});
