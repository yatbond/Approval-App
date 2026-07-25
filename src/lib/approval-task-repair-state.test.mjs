import assert from "node:assert/strict";
import test from "node:test";
import { repairApprovalTaskState } from "./approval-task-repair-state.ts";

function makeTask(overrides = {}) {
  return {
    id: "APR-1048",
    title: "Cloud subscription invoice",
    workflow: "Finance invoice approval",
    requester: "Mandy Chan",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Today",
    value: "HKD 8,400",
    currentStep: "Next approver review",
    currentOwner: "next.approver@example.com",
    pendingNodeIds: [],
    pendingOwners: [],
    participants: [
      "mandy@example.com",
      "dpang@example.com",
      "next.approver@example.com",
    ],
    lastAction: "Approved by dpang",
    extractedFields: {},
    auditTrail: [
      {
        id: "APR-1048-event-1",
        action: "submitted",
        actor: "Mandy Chan",
        actorEmail: "mandy@example.com",
        timestamp: "2026-06-17 09:10",
        detail: "Request submitted.",
      },
      {
        id: "APR-1048-event-2",
        action: "assigned",
        actor: "System",
        actorEmail: "system@example.com",
        timestamp: "2026-06-17 09:12",
        detail: "Assigned to Derrick Pang for department review.",
      },
      {
        id: "APR-1048-event-3",
        action: "assigned",
        actor: "System",
        actorEmail: "system@example.com",
        timestamp: "2026-06-29 23:32",
        targetEmail: "next.approver@example.com",
        detail: "Assigned to next.approver@example.com for Next approver review.",
      },
      {
        id: "APR-1048-event-4",
        action: "approved",
        actor: "dpang",
        actorEmail: "dpang@example.com",
        timestamp: "2026-06-29 23:32",
        detail: "Approved and sent to the next approver. Comment: Looks fine",
      },
      {
        id: "APR-1048-event-5",
        action: "assigned",
        actor: "System",
        actorEmail: "system@example.com",
        timestamp: "2026-06-29 23:32",
        detail: "Assigned to next.approver@example.com for Next approver review.",
      },
      {
        id: "APR-1048-event-6",
        action: "approved",
        actor: "dpang",
        actorEmail: "dpang@example.com",
        timestamp: "2026-06-29 23:33",
        detail: "Approved and sent to the next approver.",
      },
    ],
    ...overrides,
  };
}

test("repairs the obsolete next-approver loop while preserving the first decision", () => {
  const repaired = repairApprovalTaskState(makeTask());

  assert.equal(repaired.status, "approved");
  assert.equal(repaired.currentOwner, "");
  assert.equal(repaired.currentStep, "Approved");
  assert.deepEqual(repaired.pendingNodeIds, []);
  assert.deepEqual(repaired.pendingOwners, []);
  assert.equal(repaired.auditTrail.length, 3);
  assert.match(repaired.auditTrail.at(-1).detail, /completed the legacy workflow/);
  assert.match(repaired.auditTrail.at(-1).detail, /Looks fine/);
  assert.equal(repaired.participants.includes("next.approver@example.com"), false);
});

test("leaves legitimate workflow tasks unchanged", () => {
  const currentNodeTask = makeTask({ currentNodeId: "approval-2" });
  const assignedTask = makeTask({ currentOwner: "real.approver@example.com" });

  assert.equal(repairApprovalTaskState(currentNodeTask), currentNodeTask);
  assert.equal(repairApprovalTaskState(assignedTask), assignedTask);
});

test("repairs completed local copies that contain stale fallback children", () => {
  const completedCopy = makeTask({
    status: "approved",
    currentStep: "Approved",
    currentOwner: "",
    auditTrail: [
      ...makeTask().auditTrail,
      {
        id: "APR-1048-event-13",
        action: "approved",
        actor: "dpang",
        actorEmail: "dpang@example.com",
        timestamp: "2026-06-29 23:32",
        detail: "Approved and completed the legacy workflow.",
      },
    ],
  });

  const repaired = repairApprovalTaskState(completedCopy);

  assert.deepEqual(
    repaired.auditTrail.map((event) => event.id),
    ["APR-1048-event-1", "APR-1048-event-2", "APR-1048-event-4"],
  );
  assert.equal(
    repaired.auditTrail.some((event) =>
      event.detail.includes("next.approver@example.com"),
    ),
    false,
  );
});
