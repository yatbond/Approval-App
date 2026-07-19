import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalApprovalTask,
  computeApprovalTransition,
  getAvailableApprovalActions,
} from "./approval-runtime.ts";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "actor@example.com",
  fullName: "Active Approver",
  role: "approver",
  isAdmin: false,
  isActive: true,
};

function makeRow(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    request_no: "APR-RUNTIME-1",
    requester_id: "00000000-0000-4000-8000-000000000002",
    requester_name: "Request Owner",
    requester_email: "requester@example.com",
    title: "Runtime test",
    workflow_name: "Runtime workflow",
    department_name: "Finance",
    status: "pending",
    due_label: "Tomorrow",
    due_at: "2026-07-20T00:00:00.000Z",
    value_label: "HKD 100",
    current_step: "Approval",
    current_node_id: "approval-1",
    current_owner_id: actor.id,
    current_owner_email: actor.email,
    pending_node_ids: ["approval-1"],
    pending_owner_emails: [actor.email],
    completed_node_ids: ["start"],
    notified_node_ids: [],
    node_decisions: {},
    active_branch_id: null,
    extracted_fields: {},
    participants: ["requester@example.com", actor.email],
    last_action: "Submitted",
    task_snapshot: {},
    pinned_template_snapshot: {
      id: "runtime-template",
      name: "Runtime workflow",
      business: "Test business",
      department: "Finance",
      documentTypes: [],
      documents: [],
      languages: ["English"],
      fields: [],
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "approval-1",
            kind: "approval",
            label: "Approval",
            x: 100,
            y: 0,
            assigneeName: actor.fullName,
            assigneeEmail: actor.email,
          },
          { id: "end", kind: "end", label: "Done", x: 200, y: 0 },
        ],
        edges: [
          {
            id: "approved-edge",
            sourceId: "approval-1",
            targetId: "end",
            branchType: "approved",
            label: "Approved",
          },
        ],
      },
    },
    state_version: 0,
    submitted_at: "2026-07-19T00:00:00.000Z",
    updated_at: "2026-07-19T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

test("canonical task overlays mutable database columns over a stale snapshot", () => {
  const task = buildCanonicalApprovalTask(
    makeRow({ task_snapshot: { status: "approved", currentOwner: "forged@example.com" } }),
  );
  assert.equal(task.status, "pending");
  assert.equal(task.currentOwner, actor.email);
});

test("only the current owner receives decision and handoff actions", () => {
  const task = buildCanonicalApprovalTask(makeRow());
  assert.deepEqual(getAvailableApprovalActions(task, actor), [
    "approve",
    "approve_with_comment",
    "reject",
    "reject_with_comment",
    "reassign",
    "delegate",
  ]);
  assert.deepEqual(
    getAvailableApprovalActions(task, { ...actor, id: "other", email: "other@example.com" }),
    [],
  );
});

test("a reassignment candidate can accept or decline but cannot approve", () => {
  const task = buildCanonicalApprovalTask(
    makeRow({
      task_snapshot: {
        reassignmentRequests: [
          {
            id: "reassignment-1",
            fromEmail: actor.email,
            toEmail: "candidate@example.com",
            status: "requested",
            requestedAt: "2026-07-19T00:00:00Z",
          },
        ],
      },
      participants: [actor.email, "candidate@example.com"],
    }),
  );
  assert.deepEqual(
    getAvailableApprovalActions(task, { ...actor, email: "candidate@example.com" }),
    ["accept_reassignment", "decline_reassignment"],
  );
});

test("server transition derives state, audit action, timestamp, and notifications", () => {
  const transition = computeApprovalTransition({
    row: makeRow(),
    actor,
    command: {
      action: "approve",
      expectedVersion: 0,
      idempotencyKey: "runtime-approve-1",
    },
    now: new Date("2026-07-19T01:00:00Z"),
  });
  assert.ok(transition);
  assert.equal(transition.task.status, "approved");
  assert.equal(transition.event.action, "approved");
  assert.equal(transition.nextState.completedAt, "2026-07-19T01:00:00.000Z");
  assert.deepEqual(transition.notificationEmails, ["requester@example.com"]);
  assert.equal(transition.nextState.taskSnapshot.auditTrail.length, 0);
});
