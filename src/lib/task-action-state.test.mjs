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
