import assert from "node:assert/strict";
import { test } from "node:test";
import { saveCollaborationMirrorState } from "./collaboration-mirror-store.ts";

const task = {
  id: "APR-1001",
  title: "Invoice approval",
  workflow: "General approval",
  workflowTemplateId: "template-1",
  requester: "Mandy Chan",
  requesterEmail: "mandy@example.com",
  department: "Finance",
  status: "pending",
  due: "Due today",
  value: "HKD 8,400",
  currentStep: "Review",
  currentOwner: "reviewer@example.com",
  participants: ["mandy@example.com", "reviewer@example.com", "site@example.com"],
  lastAction: "Submitted by Mandy Chan",
  extractedFields: {},
  auditTrail: [],
  collaborationRequests: [
    {
      id: "APR-1001-collab-1",
      contributorName: "QS Team",
      contributorEmail: "qs@example.com",
      requestedByName: "Reviewer",
      requestedByEmail: "reviewer@example.com",
      requestNote: "Upload QS assessment.",
      dueAt: "2026-06-28T10:00",
      blocksApproval: true,
      status: "submitted",
      createdAt: "2026-06-26 10:15",
      submittedAt: "2026-06-26 12:00",
    },
  ],
  sharedFulfillments: [
    {
      id: "APR-1001-shared-1",
      taskId: "APR-1001",
      requirementNodeId: "submit-site",
      documentId: "doc-delivery",
      documentType: "Delivery Note",
      assignedSubmitterEmail: "site@example.com",
      assignedSubmitterName: "Site Team",
      uploaderEmail: "contractor@example.com",
      uploaderName: "Contractor",
      attachmentId: "attachment-1",
      required: true,
      status: "pending_confirmation",
      submittedAt: "2026-06-26 11:00",
    },
  ],
  correctionRequests: [
    {
      id: "APR-1001-correction-1",
      taskId: "APR-1001",
      sharedFulfillmentId: "APR-1001-shared-1",
      requestedByEmail: "reviewer@example.com",
      requestedByName: "Reviewer",
      assignedSubmitterEmail: "site@example.com",
      uploaderEmail: "contractor@example.com",
      rejectionNote: "Missing stamp.",
      status: "requested",
      blocksApproval: true,
      createdAt: "2026-06-26 11:40",
    },
  ],
};

const notifications = [
  {
    id: "APR-1001-notify-shared-site@example.com",
    title: "Shared upload needs confirmation",
    body: "Delivery Note was uploaded by contractor@example.com and needs confirmation.",
    time: "Due today",
    unread: true,
    requestId: "APR-1001",
    recipientEmail: "site@example.com",
    kind: "collaboration_update",
  },
];

test("mirrors contributor requests, shared fulfillments, corrections, and notifications", async () => {
  const supabase = new FakeSupabase();

  await saveCollaborationMirrorState(supabase, task, notifications);

  assert.deepEqual(
    supabase.operations.map((operation) => operation.table),
    [
      "workflow_collaboration_requests",
      "workflow_shared_fulfillments",
      "workflow_correction_requests",
      "workflow_notification_events",
    ],
  );
  assert.equal(supabase.operations[0].rows[0].id, "APR-1001-collab-1");
  assert.equal(supabase.operations[0].rows[0].approval_request_no, "APR-1001");
  assert.equal(supabase.operations[1].rows[0].status, "pending_confirmation");
  assert.equal(supabase.operations[2].rows[0].blocks_approval, true);
  assert.equal(supabase.operations[3].rows[0].recipient_email, "site@example.com");
});

test("throws when a mirror upsert fails", async () => {
  const supabase = new FakeSupabase({
    failTable: "workflow_shared_fulfillments",
  });

  await assert.rejects(
    () => saveCollaborationMirrorState(supabase, task, notifications),
    /workflow_shared_fulfillments mirror failed: boom/i,
  );
});

test("skips empty mirror payloads without touching Supabase", async () => {
  const supabase = new FakeSupabase();

  await saveCollaborationMirrorState(
    supabase,
    {
      ...task,
      collaborationRequests: [],
      sharedFulfillments: [],
      correctionRequests: [],
    },
    [],
  );

  assert.deepEqual(supabase.operations, []);
});

class FakeSupabase {
  constructor({ failTable = "" } = {}) {
    this.failTable = failTable;
    this.operations = [];
  }

  from(table) {
    return {
      upsert: async (rows, options) => {
        this.operations.push({ table, rows, options });
        if (table === this.failTable) {
          return { error: { message: "boom" } };
        }
        return { error: null };
      },
    };
  }
}
