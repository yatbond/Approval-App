import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowDocumentSample,
  buildWorkflowDocumentSavedSampleFields,
  clearWorkflowDocumentSampleTrainingDraft,
  findWorkflowDocumentSampleFieldExample,
  getSamplePageImages,
  getSamplePreviewPages,
  saveWorkflowDocumentSampleTrainingDraft,
  sanitizeWorkflowDocumentSample,
} from "./workflow-document-sample-state.ts";

test("builds a durable workflow document sample from uploaded PDF preview data", () => {
  const sample = buildWorkflowDocumentSample({
    file: {
      name: "sample.pdf",
      type: "application/pdf",
    },
    previewPages: [
      {
        id: "pdf-page-1",
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "preview-page",
        dataUrl: "data:image/png;base64,preview-page",
        pageText: "Subcontractor Ming Kee",
      },
    ],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page",
        pageText: "Subcontractor Ming Kee",
      },
    ],
    savedAt: "2026-06-29T01:00:00.000Z",
  });

  assert.deepEqual(sample, {
    fileName: "sample.pdf",
    mimeType: "application/pdf",
    previewPages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        pageText: "Subcontractor Ming Kee",
      },
    ],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page",
        pageText: "Subcontractor Ming Kee",
      },
    ],
    savedAt: "2026-06-29T01:00:00.000Z",
  });
});

test("restores preview pages from saved OCR page images", () => {
  const sample = {
    fileName: "sample.pdf",
    mimeType: "application/pdf",
    previewPages: [],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page",
        pageText: "Subcontractor Ming Kee",
      },
    ],
    savedAt: "2026-06-29T01:00:00.000Z",
  };

  assert.deepEqual(getSamplePreviewPages(sample), [
    {
      id: "pdf-page-1",
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "ocr-page",
      dataUrl: "data:image/png;base64,ocr-page",
      pageText: "Subcontractor Ming Kee",
    },
  ]);
  assert.deepEqual(getSamplePageImages(sample), [
    {
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "ocr-page",
      pageText: "Subcontractor Ming Kee",
    },
  ]);
});

test("uses OCR page images and omits high-resolution PDF preview images", () => {
  const sample = buildWorkflowDocumentSample({
    file: {
      name: "large-sample.pdf",
      type: "application/pdf",
    },
    previewPages: [
      {
        id: "pdf-page-1",
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "x".repeat(2_000_000),
        dataUrl: `data:image/png;base64,${"x".repeat(2_000_000)}`,
        pageText: "Visible typed text",
      },
    ],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page",
        pageText: "Visible typed text",
      },
    ],
    savedAt: "2026-06-29T01:00:00.000Z",
  });

  assert.equal(JSON.stringify(sample).includes("x".repeat(100)), false);
  assert.equal(sample.pageImages?.[0].imageBase64, "ocr-page");
  assert.ok(JSON.stringify(sample).length < 1000);
});

test("caps oversized workflow sample OCR page images", () => {
  const sample = buildWorkflowDocumentSample({
    file: {
      name: "large-sample.pdf",
      type: "application/pdf",
    },
    previewPages: [],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "y".repeat(3_000_000),
        pageText: "Visible typed text",
      },
    ],
    savedAt: "2026-06-29T01:00:00.000Z",
  });

  assert.equal(JSON.stringify(sample).includes("y".repeat(100)), false);
  assert.deepEqual(sample.pageImages, [
    {
      pageNumber: 1,
      mimeType: "image/png",
      pageText: "Visible typed text",
    },
  ]);
});

test("persists the in-progress sample training draft with the uploaded sample", () => {
  const sample = buildWorkflowDocumentSample({
    file: {
      name: "sample.pdf",
      type: "application/pdf",
    },
    previewPages: [],
    pageImages: [],
    savedAt: "2026-06-29T01:00:00.000Z",
  });

  const withDraft = saveWorkflowDocumentSampleTrainingDraft(sample, {
    selectedFieldName: "payment_amount",
    newFieldLabel: "",
    instructions: "extract payment amount",
    value: "HKD 500,000.00",
    evidence: "Amount due section",
    anchor: {
      pageNumber: 1,
      rect: {
        x: 10,
        y: 20,
        width: 30,
        height: 8,
      },
      nearbyText: "Amount due section",
    },
  });

  assert.deepEqual(withDraft.trainingDraft, {
    selectedFieldName: "payment_amount",
    newFieldLabel: "",
    instructions: "extract payment amount",
    value: "HKD 500,000.00",
    evidence: "Amount due section",
    anchor: {
      pageNumber: 1,
      rect: {
        x: 10,
        y: 20,
        width: 30,
        height: 8,
      },
      nearbyText: "Amount due section",
    },
  });
});

test("keeps the sample training draft through sample sanitization", () => {
  const sample = saveWorkflowDocumentSampleTrainingDraft(
    {
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      previewPages: [],
      pageImages: [],
      savedAt: "2026-06-29T01:00:00.000Z",
    },
    {
      selectedFieldName: "subcontractor_name",
      newFieldLabel: "",
      instructions: "extract name of subcontractor",
      value: "Ming Kee Construction",
      evidence: "recognized vendor line",
      anchor: null,
    },
  );

  assert.deepEqual(sanitizeWorkflowDocumentSample(sample).trainingDraft, {
    selectedFieldName: "subcontractor_name",
    newFieldLabel: "",
    instructions: "extract name of subcontractor",
    value: "Ming Kee Construction",
    evidence: "recognized vendor line",
  });
});

test("clears the in-progress training draft after the sample field is saved", () => {
  const sample = saveWorkflowDocumentSampleTrainingDraft(
    {
      fileName: "sample.pdf",
      mimeType: "application/pdf",
      previewPages: [],
      pageImages: [],
      savedAt: "2026-06-29T01:00:00.000Z",
    },
    {
      selectedFieldName: "payment_amount",
      newFieldLabel: "",
      instructions: "extract payment amount",
      value: "500,000.00",
      evidence: "",
      anchor: null,
    },
  );

  assert.equal(clearWorkflowDocumentSampleTrainingDraft(sample).trainingDraft, undefined);
});

test("finds the saved sample example for a selected workflow field", () => {
  const example = findWorkflowDocumentSampleFieldExample({
    field: {
      name: "total_value_of_work_done",
      label: "Total Value of Work Done",
      type: "text",
      required: true,
      source: "ai",
      instructions: "extract total value of work done",
      documentId: "payment-cert",
    },
    examples: [
      {
        id: "template-sample-payment-cert-total_value_of_work_done-sample",
        templateId: "template-1",
        documentId: "payment-cert",
        documentType: "Payment Cert",
        fieldLabel: "Total Value of Work Done",
        originalValue: "",
        correctedValue: "HKD 1,000,000.00",
        evidence: "total line",
        sourceFileName: "sample.pdf",
        createdByEmail: "owner@example.com",
        createdAt: "2026-06-29T01:00:00.000Z",
      },
    ],
  });

  assert.equal(example?.correctedValue, "HKD 1,000,000.00");
  assert.equal(example?.evidence, "total line");
});

test("builds saved sample field summaries from persisted extraction examples", () => {
  const savedFields = buildWorkflowDocumentSavedSampleFields({
    fields: [
      {
        name: "payment_amount",
        label: "Payment Amount",
        type: "text",
        required: true,
        source: "ai",
        instructions: "extract payment amount",
        documentId: "payment-cert",
      },
    ],
    examples: [
      {
        id: "template-sample-payment-cert-payment_amount-sample",
        templateId: "template-1",
        documentId: "payment-cert",
        documentType: "Payment Cert",
        fieldLabel: "Payment Amount",
        originalValue: "",
        correctedValue: "500,000.00",
        evidence: "",
        anchor: {
          pageNumber: 1,
          rect: {
            x: 10,
            y: 20,
            width: 30,
            height: 8,
          },
        },
        sourceFileName: "sample.pdf",
        createdByEmail: "owner@example.com",
        createdAt: "2026-06-29T01:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(savedFields, [
    {
      fieldName: "payment_amount",
      label: "Payment Amount",
      value: "500,000.00",
      hasAnchor: true,
    },
  ]);
});
