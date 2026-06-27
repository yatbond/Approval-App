import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCollaborationNotifications } from "./collaboration-notification-state.ts";
import { buildTaskNotifications, mergeTaskNotifications } from "./workflow-system.ts";

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
  participants: [
    "mandy@example.com",
    "reviewer@example.com",
    "site@example.com",
    "contractor@example.com",
  ],
  lastAction: "Submitted by Mandy Chan",
  extractedFields: {},
  auditTrail: [],
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

test("notifies only directly involved people for pending confirmation", () => {
  const notifications = buildCollaborationNotifications({
    task,
    event: {
      type: "shared_pending_confirmation",
      fulfillmentId: "APR-1001-shared-1",
    },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["site@example.com", "reviewer@example.com"],
  );
  assert.equal(notifications[0].kind, "collaboration_update");
  assert.equal(notifications[0].title, "Shared upload needs confirmation");
});

test("notifies uploader and requester when shared upload is rejected", () => {
  const notifications = buildCollaborationNotifications({
    task,
    event: { type: "shared_rejected", fulfillmentId: "APR-1001-shared-1" },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["contractor@example.com", "mandy@example.com"],
  );
  assert.match(notifications[0].body, /Delivery Note/);
});

test("notifies uploader, assigned submitter, and requester when shared upload is confirmed", () => {
  const notifications = buildCollaborationNotifications({
    task: {
      ...task,
      requesterEmail: "MANDY@example.com",
      sharedFulfillments: [
        {
          ...task.sharedFulfillments[0],
          uploaderEmail: " Contractor@example.com ",
          assignedSubmitterEmail: "contractor@example.com",
        },
      ],
    },
    event: { type: "shared_confirmed", fulfillmentId: "APR-1001-shared-1" },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["contractor@example.com", "mandy@example.com"],
  );
  assert.equal(notifications[0].title, "Shared upload confirmed");
});

test("returns no shared fulfillment notifications when the event target is missing", () => {
  assert.deepEqual(
    buildCollaborationNotifications({
      task,
      event: { type: "shared_confirmed", fulfillmentId: "missing" },
    }),
    [],
  );
});

test("notifies uploader and assigned submitter when correction is created", () => {
  const notifications = buildCollaborationNotifications({
    task,
    event: {
      type: "correction_created",
      correctionRequestId: "APR-1001-correction-1",
    },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["contractor@example.com", "site@example.com"],
  );
  assert.equal(notifications[0].title, "Correction requested");
});

test("notifies requester and correction requester when correction is resolved", () => {
  const notifications = buildCollaborationNotifications({
    task,
    event: {
      type: "correction_resolved",
      correctionRequestId: "APR-1001-correction-1",
    },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["reviewer@example.com", "mandy@example.com"],
  );
  assert.equal(notifications[0].title, "Correction resolved");
});

test("returns no correction notifications when the request is missing", () => {
  assert.deepEqual(
    buildCollaborationNotifications({
      task,
      event: {
        type: "correction_created",
        correctionRequestId: "missing",
      },
    }),
    [],
  );
});

test("notifies requester and originator when contributor input is submitted", () => {
  const notifications = buildCollaborationNotifications({
    task: {
      ...task,
      collaborationRequests: [
        {
          id: "contributor-1",
          taskId: "APR-1001",
          requestedByEmail: "reviewer@example.com",
          requestedByName: "Reviewer",
          contributorEmail: "vendor@example.com",
          contributorName: "",
          requestNote: "Please upload the vendor quote.",
          status: "submitted",
          createdAt: "2026-06-26 12:00",
          blocksApproval: true,
        },
      ],
    },
    event: {
      type: "contributor_submitted",
      collaborationRequestId: "contributor-1",
    },
  });

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["reviewer@example.com", "mandy@example.com"],
  );
  assert.match(notifications[0].body, /vendor@example.com submitted/);
});

test("returns no contributor notification when the request is missing", () => {
  assert.deepEqual(
    buildCollaborationNotifications({
      task,
      event: {
        type: "contributor_submitted",
        collaborationRequestId: "missing",
      },
    }),
    [],
  );
});

test("dedupes collaboration notifications with existing task notifications", () => {
  const existing = buildTaskNotifications([task]);
  const collaboration = buildCollaborationNotifications({
    task,
    event: {
      type: "shared_pending_confirmation",
      fulfillmentId: "APR-1001-shared-1",
    },
  });
  const merged = mergeTaskNotifications([...collaboration, ...existing]);

  assert.deepEqual(
    merged.map((notification) => notification.recipientEmail),
    [
      "site@example.com",
      "reviewer@example.com",
      "mandy@example.com",
      "contractor@example.com",
    ],
  );
  assert.equal(
    merged.find((notification) => notification.recipientEmail === "reviewer@example.com")
      ?.kind,
    "collaboration_update",
  );
});
