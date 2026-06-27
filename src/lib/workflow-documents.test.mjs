import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptForDocumentFormat,
  createAttachmentRecord,
  documentInputModeOptions,
  documentFormatOptions,
  fieldSourceForDocumentFormat,
  formatDocumentInputMode,
  formatDocumentFormat,
  getDocumentInputMode,
  isManualFormRequirement,
} from "./workflow-documents.ts";

const template = {
  id: "template-finance",
  name: "Finance approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: [],
  documents: [
    {
      id: "document-invoice",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "Review",
        x: 160,
        y: 0,
        documentIds: ["document-invoice"],
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "start",
        targetId: "review-1",
        branchType: "main",
        label: "Next",
      },
    ],
  },
};

test("lists document formats in the UI order", () => {
  assert.deepEqual(documentFormatOptions, [
    { value: "text", label: "Text" },
    { value: "pdf", label: "PDF" },
    { value: "image", label: "Image" },
    { value: "excel_csv", label: "Excel/CSV" },
  ]);
});

test("lists and normalizes document input modes", () => {
  assert.deepEqual(documentInputModeOptions, [
    { value: "upload", label: "OCR upload" },
    { value: "manual_form", label: "Manual form" },
  ]);
  assert.equal(getDocumentInputMode({}), "upload");
  assert.equal(getDocumentInputMode({ inputMode: "manual_form" }), "manual_form");
  assert.equal(isManualFormRequirement({ inputMode: "manual_form" }), true);
  assert.equal(isManualFormRequirement({ inputMode: "upload" }), false);
  assert.equal(formatDocumentInputMode("manual_form"), "Manual form");
});

test("formats document labels and accepted upload extensions", () => {
  assert.equal(formatDocumentFormat("text"), "Text");
  assert.equal(formatDocumentFormat("pdf"), "PDF");
  assert.equal(formatDocumentFormat("image"), "Image");
  assert.equal(formatDocumentFormat("excel_csv"), "Excel/CSV");
  assert.equal(formatDocumentFormat("unknown"), "Document");

  assert.equal(acceptForDocumentFormat("text"), ".txt,.md,.rtf");
  assert.equal(acceptForDocumentFormat("pdf"), ".pdf");
  assert.equal(acceptForDocumentFormat("image"), ".png,.jpg,.jpeg,.webp");
  assert.equal(acceptForDocumentFormat("excel_csv"), ".xlsx,.xls,.csv");
});

test("maps document formats to extraction field sources", () => {
  assert.equal(fieldSourceForDocumentFormat("excel_csv"), "excel");
  assert.equal(fieldSourceForDocumentFormat("image"), "ai");
  assert.equal(fieldSourceForDocumentFormat("text"), "manual");
  assert.equal(fieldSourceForDocumentFormat("pdf"), "ocr");
});

test("creates an attachment record linked to the workflow box requiring the document", () => {
  const attachment = createAttachmentRecord({
    file: { name: "invoice.pdf" },
    documentRequirement: template.documents[0],
    template,
    uploadedBy: "mandy@example.com",
    storagePath: "approval-documents/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
    idPrefix: "attachment-123",
    uploadedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.deepEqual(attachment, {
    id: "attachment-123-invoice.pdf",
    fileName: "invoice.pdf",
    documentId: "document-invoice",
    documentType: "Invoice",
    format: "pdf",
    workflowNodeId: "review-1",
    storagePath: "approval-documents/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
    uploadedBy: "mandy@example.com",
    uploadedAt: "2026-06-21T00:00:00.000Z",
  });
});

test("creates an ad hoc attachment when no document requirement is supplied", () => {
  const attachment = createAttachmentRecord({
    file: { name: "supporting-note.txt" },
    template,
    uploadedBy: "reviewer@example.com",
    idPrefix: "attachment-456",
    uploadedAt: "2026-06-21T01:00:00.000Z",
  });

  assert.equal(attachment.id, "attachment-456-supporting-note.txt");
  assert.equal(attachment.fileName, "supporting-note.txt");
  assert.equal(attachment.documentType, "Ad hoc document");
  assert.equal(attachment.format, "ad_hoc");
  assert.equal(attachment.workflowNodeId, undefined);
  assert.equal(attachment.uploadedBy, "reviewer@example.com");
  assert.equal(attachment.uploadedAt, "2026-06-21T01:00:00.000Z");
});
