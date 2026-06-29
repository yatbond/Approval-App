import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowDocumentSample,
  getSamplePageImages,
  getSamplePreviewPages,
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
