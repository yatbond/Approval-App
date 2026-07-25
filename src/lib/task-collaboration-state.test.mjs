import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getTaskContributorRequestState,
  getTaskContributorUploadState,
} from "./task-collaboration-state.ts";

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
  participants: ["mandy@example.com", "reviewer@example.com"],
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

test("adds a contributor request and keeps it visible to all participants", () => {
  const result = getTaskContributorRequestState({
    task: baseTask,
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    contributorEmail: " site@example.com ",
    contributorName: "Site Team",
    requestNote: "Please upload the site report and delivery note.",
    dueAt: "2026-06-28T10:00",
    now: new Date("2026-06-26T10:15:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.errorMessage, "");
  assert.equal(result.task.collaborationRequests.length, 1);
  assert.deepEqual(result.task.collaborationRequests[0], {
    id: "APR-1001-collab-1",
    contributorName: "Site Team",
    contributorEmail: "site@example.com",
    requestedByName: "Reviewer",
    requestedByEmail: "reviewer@example.com",
    requestNote: "Please upload the site report and delivery note.",
    dueAt: "2026-06-28T10:00",
    blocksApproval: true,
    status: "requested",
    createdAt: "2026-06-26 10:15",
  });
  assert.deepEqual(result.task.participants, [
    "mandy@example.com",
    "reviewer@example.com",
    "site@example.com",
  ]);
  assert.equal(result.task.lastAction, "Requested input from site@example.com");
  assert.equal(result.task.auditTrail.at(-1).action, "contribution_requested");
  assert.equal(
    result.task.auditTrail.at(-1).detail,
    "Requested input from site@example.com: Please upload the site report and delivery note.",
  );
});

test("marks a contributor request submitted with attachment and parsed fields", () => {
  const requested = getTaskContributorRequestState({
    task: baseTask,
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    contributorEmail: "site@example.com",
    contributorName: "Site Team",
    requestNote: "Upload delivery note.",
    dueAt: "",
    now: new Date("2026-06-26T10:15:00+08:00"),
  }).task;
  const result = getTaskContributorUploadState({
    task: requested,
    collaborationRequestId: "APR-1001-collab-1",
    actor: { name: "Site Team", email: "site@example.com" },
    attachment: {
      id: "attachment-1",
      fileName: "delivery-note.pdf",
      documentType: "Contributor upload",
      format: "ad_hoc",
      uploadedBy: "site@example.com",
      uploadedAt: "2026-06-26T11:00:00.000Z",
      storagePath: "site/delivery-note.pdf",
    },
    extractedFields: {
      "Delivery note number": "DN-7788",
      Quantity: "20",
    },
    now: new Date("2026-06-26T11:00:00+08:00"),
  });

  assert.equal(result.didApply, true);
  assert.equal(result.errorMessage, "");
  assert.equal(result.task.collaborationRequests[0].status, "submitted");
  assert.equal(result.task.collaborationRequests[0].submittedAt, "2026-06-26 11:00");
  assert.deepEqual(result.task.collaborationRequests[0].attachmentIds, ["attachment-1"]);
  assert.deepEqual(result.task.collaborationRequests[0].extractedFields, {
    "Delivery note number": "DN-7788",
    Quantity: "20",
  });
  assert.equal(result.task.attachments[0].id, "attachment-1");
  assert.equal(
    result.task.extractedFields["Contributor Site Team - Delivery note number"],
    "DN-7788",
  );
  assert.equal(result.task.lastAction, "Contributor input submitted by Site Team");
  assert.equal(result.task.auditTrail.at(-1).action, "contribution_submitted");
});

test("rejects upload for an unknown contributor request", () => {
  const result = getTaskContributorUploadState({
    task: baseTask,
    collaborationRequestId: "missing",
    actor: { name: "Site Team", email: "site@example.com" },
    attachment: {
      id: "attachment-1",
      fileName: "delivery-note.pdf",
      documentType: "Contributor upload",
      format: "ad_hoc",
      uploadedBy: "site@example.com",
      uploadedAt: "2026-06-26T11:00:00.000Z",
    },
    extractedFields: {},
    now: new Date("2026-06-26T11:00:00+08:00"),
  });

  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "Contributor request was not found.");
  assert.equal(result.task, baseTask);
});

test("rejects contributor requests without an email or note", () => {
  const result = getTaskContributorRequestState({
    task: baseTask,
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    contributorEmail: "",
    contributorName: "",
    requestNote: " ",
    dueAt: "",
    now: new Date("2026-06-26T10:15:00+08:00"),
  });

  assert.equal(result.didApply, false);
  assert.equal(result.errorMessage, "Enter a contributor email and request note.");
  assert.equal(result.task, baseTask);
});
