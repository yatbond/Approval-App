import assert from "node:assert/strict";
import test from "node:test";
import {
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
