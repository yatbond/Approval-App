import assert from "node:assert/strict";
import test from "node:test";
import { getTaskActionPreflightState } from "./task-action-state.ts";

test("blocks reassign and delegate actions without a target email", () => {
  assert.deepEqual(
    getTaskActionPreflightState({
      action: "reassign",
      targetEmail: " ",
      missingCurrentDocuments: [],
    }),
    { canProceed: false, errorMessage: "" },
  );

  assert.deepEqual(
    getTaskActionPreflightState({
      action: "delegate",
      targetEmail: "",
      missingCurrentDocuments: [],
    }),
    { canProceed: false, errorMessage: "" },
  );
});

test("blocks approval when current-node required documents are missing", () => {
  const state = getTaskActionPreflightState({
    action: "approve_with_comment",
    targetEmail: "",
    missingCurrentDocuments: [
      { id: "doc-1", documentType: "Invoice", format: "pdf", required: true, fields: [] },
      { id: "doc-2", documentType: "Doctor slip", format: "image", required: true, fields: [] },
    ],
  });

  assert.equal(state.canProceed, false);
  assert.equal(
    state.errorMessage,
    "Upload required document(s) before approving: Invoice, Doctor slip.",
  );

  assert.equal(
    getTaskActionPreflightState({
      action: "approve",
      targetEmail: "",
      missingCurrentDocuments: [
        { id: "doc-1", documentType: "Invoice", format: "pdf", required: true, fields: [] },
      ],
    }).canProceed,
    false,
  );
});

test("blocks approval when blocking contributor requests are still pending", () => {
  const state = getTaskActionPreflightState({
    action: "approve",
    targetEmail: "",
    missingCurrentDocuments: [],
    pendingBlockingContributorRequests: [
      {
        id: "collab-1",
        contributorName: "Site Team",
        contributorEmail: "site@example.com",
        requestedByName: "Reviewer",
        requestedByEmail: "reviewer@example.com",
        requestNote: "Upload site report.",
        dueAt: "",
        blocksApproval: true,
        status: "requested",
        createdAt: "2026-06-26 10:15",
      },
    ],
  });

  assert.equal(state.canProceed, false);
  assert.equal(
    state.errorMessage,
    "Resolve contributor request(s) before approving: site@example.com.",
  );
});

test("blocks approval when shared fulfillment confirmation is pending", () => {
  const state = getTaskActionPreflightState({
    action: "approve",
    targetEmail: "",
    missingCurrentDocuments: [],
    pendingSharedFulfillments: [
      {
        id: "shared-1",
        taskId: "APR-1",
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
  });

  assert.equal(state.canProceed, false);
  assert.equal(
    state.errorMessage,
    "Resolve shared fulfillment confirmation(s) before approving: Delivery Note.",
  );
});

test("blocks approval when correction requests are unresolved", () => {
  const state = getTaskActionPreflightState({
    action: "approve_with_comment",
    targetEmail: "",
    missingCurrentDocuments: [],
    pendingCorrectionRequests: [
      {
        id: "correction-1",
        taskId: "APR-1",
        sharedFulfillmentId: "shared-1",
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
  });

  assert.equal(state.canProceed, false);
  assert.equal(
    state.errorMessage,
    "Resolve correction request(s) before approving: correction-1.",
  );
});

test("allows non-approval actions without document checks", () => {
  const state = getTaskActionPreflightState({
    action: "reject",
    targetEmail: "",
    missingCurrentDocuments: [
      { id: "doc-1", documentType: "Invoice", format: "pdf", required: true, fields: [] },
    ],
  });

  assert.deepEqual(state, { canProceed: true, errorMessage: "" });
});
