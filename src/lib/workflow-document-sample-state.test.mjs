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
    dataUrl: "data:application/pdf;base64,pdf-data",
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
    dataUrl: "data:application/pdf;base64,pdf-data",
    previewPages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "preview-page",
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

test("restores preview pages and parser page images from a saved workflow document sample", () => {
  const sample = {
    fileName: "sample.pdf",
    mimeType: "application/pdf",
    dataUrl: "data:application/pdf;base64,pdf-data",
    previewPages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "preview-page",
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
      imageBase64: "preview-page",
      dataUrl: "data:image/png;base64,preview-page",
      pageText: "Subcontractor Ming Kee",
    },
  ]);
  assert.deepEqual(getSamplePageImages(sample), [
    {
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "preview-page",
      pageText: "Subcontractor Ming Kee",
    },
  ]);
});
