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
