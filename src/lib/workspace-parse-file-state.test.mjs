import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceParseFileStartState,
  getWorkspaceParseFileStoredAttachmentState,
  getWorkspaceParseFileSuccessState,
} from "./workspace-parse-file-state.ts";

function makeFile(name = "invoice.pdf") {
  return new File(["hello"], name, { type: "application/pdf" });
}

const activeUser = {
  name: "Derrick Pang",
  email: "derrick@example.com",
};

const documentRequirement = {
  id: "invoice-pdf",
  documentType: "Invoice",
  format: "pdf",
  required: true,
  fields: [],
};

const template = {
  id: "finance-invoice",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [documentRequirement],
  languages: ["English"],
  fields: [],
  steps: [],
};

test("starts parsing by resetting stale parse state", () => {
  assert.deepEqual(getWorkspaceParseFileStartState(makeFile("receipt.png")), {
    fileName: "receipt.png",
    parseError: "",
    submissionMessage: "",
    isParsing: true,
    parseResult: null,
    editedFields: {},
  });
});

test("adds a stored attachment when a selected template exists", () => {
  const previousAttachment = {
    id: "existing",
    fileName: "existing.pdf",
    documentId: "other",
    documentType: "Other",
    format: "pdf",
    uploadedBy: "derrick@example.com",
    uploadedAt: "2026-06-21 09:00",
  };

  const nextState = getWorkspaceParseFileStoredAttachmentState({
    uploadedAttachments: [previousAttachment],
    selectedTemplate: template,
    file: makeFile(),
    documentRequirement,
    activeUser,
    storagePath: "user/invoice-pdf/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
  });

  assert.equal(nextState.uploadedAttachments.length, 2);
  assert.equal(nextState.uploadedAttachments[0], previousAttachment);
  assert.equal(nextState.uploadedAttachments[1].fileName, "invoice.pdf");
  assert.equal(nextState.uploadedAttachments[1].documentId, "invoice-pdf");
  assert.equal(nextState.uploadedAttachments[1].documentType, "Invoice");
  assert.equal(nextState.uploadedAttachments[1].uploadedBy, "derrick@example.com");
  assert.equal(nextState.uploadedAttachments[1].storagePath, "user/invoice-pdf/invoice.pdf");
  assert.equal(nextState.uploadedAttachments[1].publicUrl, "https://example.com/invoice.pdf");
});

test("leaves attachments unchanged when no template is selected", () => {
  const uploadedAttachments = [];
  const nextState = getWorkspaceParseFileStoredAttachmentState({
    uploadedAttachments,
    selectedTemplate: undefined,
    file: makeFile(),
    documentRequirement,
    activeUser,
    storagePath: "user/invoice-pdf/invoice.pdf",
  });

  assert.equal(nextState.uploadedAttachments, uploadedAttachments);
});

test("maps parse success into parse result and editable fields", () => {
  const payload = {
    strategy: "image-ai",
    fields: { amount: "1000", vendor: "Northstar" },
    confidence: { amount: "high" },
    notes: [],
  };

  assert.deepEqual(getWorkspaceParseFileSuccessState(payload), {
    parseResult: payload,
    editedFields: { amount: "1000", vendor: "Northstar" },
    isParsing: false,
  });
});
