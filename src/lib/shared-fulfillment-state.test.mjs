import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getTaskCorrectionUploadState,
  getTaskSharedFulfillmentDecisionState,
  getTaskSharedFulfillmentSubmitState,
} from "./shared-fulfillment-state.ts";

const baseTask = {
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
  auditTrail: [
    {
      id: "APR-1001-event-1",
      action: "submitted",
      actor: "Mandy Chan",
      actorEmail: "mandy@example.com",
      timestamp: "2026-06-26 09:00",
      detail: "Request submitted.",
    },
  ],
};

const attachment = {
  id: "attachment-1",
  fileName: "delivery-note.pdf",
  documentId: "doc-delivery",
  documentType: "Delivery Note",
  format: "pdf",
  workflowNodeId: "submit-site",
  uploadedBy: "contractor@example.com",
  uploadedAt: "2026-06-26T11:00:00.000Z",
  storagePath: "contractor/delivery-note.pdf",
};

function submitPendingFulfillment(overrides = {}) {
  return getTaskSharedFulfillmentSubmitState({
    task: baseTask,
    actor: { name: "Contractor", email: "contractor@example.com" },
    attachment,
    requirementNodeId: "submit-site",
    documentId: "doc-delivery",
    documentType: "Delivery Note",
    assignedSubmitterEmail: "site@example.com",
    assignedSubmitterName: "Site Team",
    required: true,
    requiresConfirmation: true,
    extractedFields: {
      "Delivery note number": "DN-7788",
    },
    now: new Date("2026-06-26T11:00:00+08:00"),
    ...overrides,
  }).task;
}

test("creates a pending shared fulfillment when confirmation is required", () => {
  const result = getTaskSharedFulfillmentSubmitState({
    task: baseTask,
    actor: { name: "Contractor", email: "contractor@example.com" },
    attachment,
    requirementNodeId: "submit-site",
    documentId: "doc-delivery",
    documentType: "Delivery Note",
    assignedSubmitterEmail: "site@example.com",
    assignedSubmitterName: "Site Team",
    required: true,
    requiresConfirmation: true,
    extractedFields: {
      "Delivery note number": "DN-7788",
    },
    now: new Date("2026-06-26T11:00:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.errorMessage, "");
  assert.equal(result.task.sharedFulfillments.length, 1);
  assert.deepEqual(result.task.sharedFulfillments[0], {
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
  });
  assert.equal(result.task.attachments[0].id, "attachment-1");
  assert.equal(
    result.task.extractedFields["Shared Delivery Note - Delivery note number"],
    "DN-7788",
  );
  assert.equal(result.task.lastAction, "Shared fulfillment submitted by Contractor");
  assert.equal(result.task.auditTrail.at(-1).action, "shared_fulfillment_submitted");
});

test("confirms pending fulfillment by current reviewer", () => {
  const task = submitPendingFulfillment();
  const result = getTaskSharedFulfillmentDecisionState({
    task,
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "confirm",
    now: new Date("2026-06-26T11:30:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.task.sharedFulfillments[0].status, "confirmed");
  assert.equal(result.task.sharedFulfillments[0].decidedAt, "2026-06-26 11:30");
  assert.equal(result.task.sharedFulfillments[0].decidedByEmail, "reviewer@example.com");
  assert.equal(result.task.sharedFulfillments[0].decisionRole, "current_actor");
  assert.equal(result.task.auditTrail.at(-1).action, "shared_fulfillment_confirmed");
});

test("confirms pending fulfillment by assigned submitter", () => {
  const task = submitPendingFulfillment();
  const result = getTaskSharedFulfillmentDecisionState({
    task,
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Site Team", email: "site@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "confirm",
    now: new Date("2026-06-26T11:35:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.task.sharedFulfillments[0].status, "confirmed");
  assert.equal(result.task.sharedFulfillments[0].decisionRole, "assigned_submitter");
});

test("rejects fulfillment with note and creates blocking correction", () => {
  const task = submitPendingFulfillment();
  const result = getTaskSharedFulfillmentDecisionState({
    task,
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "reject",
    note: "Missing signed receiving stamp.",
    now: new Date("2026-06-26T11:40:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.task.sharedFulfillments[0].status, "rejected");
  assert.equal(result.task.sharedFulfillments[0].decisionNote, "Missing signed receiving stamp.");
  assert.equal(result.task.sharedFulfillments[0].correctionRequestId, "APR-1001-correction-1");
  assert.deepEqual(result.task.correctionRequests[0], {
    id: "APR-1001-correction-1",
    taskId: "APR-1001",
    sharedFulfillmentId: "APR-1001-shared-1",
    requestedByEmail: "reviewer@example.com",
    requestedByName: "Reviewer",
    assignedSubmitterEmail: "site@example.com",
    uploaderEmail: "contractor@example.com",
    rejectionNote: "Missing signed receiving stamp.",
    status: "requested",
    blocksApproval: true,
    createdAt: "2026-06-26 11:40",
  });
  assert.equal(result.task.auditTrail.at(-1).action, "correction_requested");
});

test("requires a rejection note", () => {
  const task = submitPendingFulfillment();
  const result = getTaskSharedFulfillmentDecisionState({
    task,
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "reject",
    note: " ",
    now: new Date("2026-06-26T11:40:00+08:00"),
  });

  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "Enter a rejection note.");
  assert.equal(result.task, task);
});

test("prevents a second decision after first decision wins", () => {
  const confirmed = getTaskSharedFulfillmentDecisionState({
    task: submitPendingFulfillment(),
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "confirm",
    now: new Date("2026-06-26T11:30:00+08:00"),
  }).task;

  const result = getTaskSharedFulfillmentDecisionState({
    task: confirmed,
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Site Team", email: "site@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "reject",
    note: "Changed mind.",
    now: new Date("2026-06-26T11:35:00+08:00"),
  });

  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "Shared fulfillment has already been decided.");
  assert.equal(result.task, confirmed);
});

test("submits correction by original uploader or assigned submitter", () => {
  const rejected = getTaskSharedFulfillmentDecisionState({
    task: submitPendingFulfillment(),
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "reject",
    note: "Missing signed receiving stamp.",
    now: new Date("2026-06-26T11:40:00+08:00"),
  }).task;

  const result = getTaskCorrectionUploadState({
    task: rejected,
    correctionRequestId: "APR-1001-correction-1",
    actor: { name: "Site Team", email: "site@example.com" },
    attachment: {
      ...attachment,
      id: "attachment-2",
      fileName: "delivery-note-corrected.pdf",
      uploadedBy: "site@example.com",
    },
    extractedFields: {
      "Delivery note number": "DN-7788-R1",
    },
    now: new Date("2026-06-26T12:10:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.task.correctionRequests[0].status, "submitted");
  assert.equal(result.task.correctionRequests[0].submittedAt, "2026-06-26 12:10");
  assert.equal(result.task.correctionRequests[0].resolvedByFulfillmentId, "APR-1001-shared-2");
  assert.equal(result.task.sharedFulfillments[1].status, "pending_confirmation");
  assert.equal(result.task.sharedFulfillments[1].attachmentId, "attachment-2");
  assert.equal(result.task.auditTrail.at(-1).action, "correction_submitted");
});

test("rejects correction uploads from unrelated users", () => {
  const rejected = getTaskSharedFulfillmentDecisionState({
    task: submitPendingFulfillment(),
    fulfillmentId: "APR-1001-shared-1",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    currentOwnerEmail: "reviewer@example.com",
    decision: "reject",
    note: "Missing signed receiving stamp.",
    now: new Date("2026-06-26T11:40:00+08:00"),
  }).task;

  const result = getTaskCorrectionUploadState({
    task: rejected,
    correctionRequestId: "APR-1001-correction-1",
    actor: { name: "Other User", email: "other@example.com" },
    attachment: { ...attachment, id: "attachment-2" },
    extractedFields: {},
    now: new Date("2026-06-26T12:10:00+08:00"),
  });

  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "You cannot resolve this correction request.");
  assert.equal(result.task, rejected);
});
