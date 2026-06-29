import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowRunnerActionActor } from "./workflow-runner-action-state.ts";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Invoice approval",
    workflow: "Finance",
    requester: "Mandy Chan",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Today",
    value: "HKD 1,000",
    currentStep: "Review",
    currentOwner: "owner@example.com",
    participants: ["mandy@example.com", "owner@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    auditTrail: [],
    ...overrides,
  };
}

test("uses the requester as actor for amend and cancel actions", () => {
  assert.deepEqual(
    getWorkflowRunnerActionActor({
      task: makeTask(),
      action: "amend_resubmit",
      fallbackEmail: "active@example.com",
    }),
    { email: "mandy@example.com", name: "Mandy Chan" },
  );
  assert.deepEqual(
    getWorkflowRunnerActionActor({
      task: makeTask(),
      action: "cancel",
      fallbackEmail: "active@example.com",
    }),
    { email: "mandy@example.com", name: "Mandy Chan" },
  );
});

test("uses current owner, then pending owner, then active user for normal actions", () => {
  assert.deepEqual(
    getWorkflowRunnerActionActor({
      task: makeTask({ currentOwner: "owner@example.com" }),
      action: "approve",
      fallbackEmail: "active@example.com",
    }),
    { email: "owner@example.com", name: "owner@example.com" },
  );
  assert.deepEqual(
    getWorkflowRunnerActionActor({
      task: makeTask({ currentOwner: "", pendingOwners: ["pending@example.com"] }),
      action: "approve",
      fallbackEmail: "active@example.com",
    }),
    { email: "pending@example.com", name: "pending@example.com" },
  );
  assert.deepEqual(
    getWorkflowRunnerActionActor({
      task: makeTask({ currentOwner: "", pendingOwners: [] }),
      action: "approve",
      fallbackEmail: "active@example.com",
    }),
    { email: "active@example.com", name: "active@example.com" },
  );
});
