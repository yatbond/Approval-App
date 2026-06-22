import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUploadRequestDraft,
  clearUploadRequestDraft,
  createEmptyUploadRequestDraftStatus,
  parseUploadRequestDraft,
  serializeUploadRequestDraft,
  shouldRestoreUploadRequestDraftHighlightState,
} from "./upload-request-draft-state.ts";

const attachment = {
  id: "attachment-1",
  fileName: "invoice.pdf",
  documentId: "invoice-doc",
  documentType: "Invoice",
  format: "pdf",
  storagePath: "user/ad-hoc/invoice.pdf",
  publicUrl: "https://example.test/invoice.pdf",
  uploadedBy: "dpang@chunwo.com",
  uploadedAt: "2026-06-23T00:00:00.000Z",
};

const parseResult = {
  strategy: "pdf-ocr",
  fields: {
    Vendor: "Gleneagles",
    Amount: "500,000.00",
  },
  confidence: {
    Vendor: "high",
    Amount: "medium",
  },
  evidence: {
    Amount: "OUTSTANDING BALANCE 500,000.00",
  },
  suggestedFields: [
    {
      name: "suggested_project",
      label: "Project",
      value: "Hospital Works",
      confidence: "medium",
      evidence: "Project Hospital Works",
      instructions: "Extract Project.",
    },
  ],
  notes: ["Parsed with visual model."],
};

const highlightGroups = [
  {
    id: "highlight-field-1",
    fieldLabel: "Payment milestones",
    boxes: [
      {
        id: "highlight-value-box-1",
        pageId: "pdf-page-1",
        pageNumber: 1,
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
        value: "100,000.00",
        confidence: "high",
        evidence: "Milestone 1 100,000.00",
        status: "done",
      },
    ],
  },
];

test("builds a recoverable upload request draft without raw file data", () => {
  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital", Amount: "500,000.00" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  assert.equal(draft.selectedTemplateId, "template-finance");
  assert.equal(draft.fileName, "invoice.pdf");
  assert.deepEqual(draft.uploadedAttachments, [attachment]);
  assert.equal(draft.parseResult?.fields.Amount, "500,000.00");
  assert.equal(draft.highlightGroups[0].boxes[0].value, "100,000.00");
  assert.equal(JSON.stringify(draft).includes("File"), false);
});

test("round trips a valid upload request draft through storage serialization", () => {
  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult,
    editedFields: { Vendor: "Gleneagles Hospital" },
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups,
    activeHighlightGroupId: "highlight-field-1",
    highlightBoxCounter: 2,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  const restored = parseUploadRequestDraft(serializeUploadRequestDraft(draft));

  assert.deepEqual(restored, draft);
});

test("rejects malformed or obsolete upload request drafts", () => {
  assert.equal(parseUploadRequestDraft("not-json"), null);
  assert.equal(
    parseUploadRequestDraft(
      JSON.stringify({
        version: 999,
        selectedTemplateId: "template-finance",
        uploadedAttachments: [],
        editedFields: {},
      }),
    ),
    null,
  );
  assert.equal(
    parseUploadRequestDraft(
      JSON.stringify({
        version: 1,
        selectedTemplateId: 42,
        uploadedAttachments: [],
        editedFields: {},
      }),
    ),
    null,
  );
});

test("reports whether a draft contains recoverable request work", () => {
  assert.deepEqual(createEmptyUploadRequestDraftStatus(null), {
    hasDraft: false,
    label: "No request draft",
  });

  const draft = buildUploadRequestDraft({
    selectedTemplateId: "template-finance",
    fileName: "invoice.pdf",
    parseResult: null,
    editedFields: {},
    uploadedAttachments: [attachment],
    parsedDocumentId: "invoice-doc",
    highlightGroups: [],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
    savedAt: "2026-06-23T00:01:00.000Z",
  });

  assert.deepEqual(createEmptyUploadRequestDraftStatus(draft), {
    hasDraft: true,
    label: "Autosaved 1 attachment",
  });
});

test("clears upload request draft state after submit or discard", () => {
  assert.deepEqual(clearUploadRequestDraft(), {
    fileName: "",
    parseResult: null,
    editedFields: {},
    uploadedAttachments: [],
    parsedDocumentId: undefined,
    highlightGroups: [],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
  });
});

test("restores upload highlight state only once for a draft restore token", () => {
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "",
      lastRestoredToken: "",
    }),
    false,
  );
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "2026-06-23T00:01:00.000Z",
      lastRestoredToken: "",
    }),
    true,
  );
  assert.equal(
    shouldRestoreUploadRequestDraftHighlightState({
      restoreToken: "2026-06-23T00:01:00.000Z",
      lastRestoredToken: "2026-06-23T00:01:00.000Z",
    }),
    false,
  );
});
