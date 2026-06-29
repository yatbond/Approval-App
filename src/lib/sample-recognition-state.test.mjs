import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSampleRecognitionPageImages,
  getSampleRecognitionFailureMessage,
  readRecognizedSampleField,
} from "./sample-recognition-state.ts";

const subcontractorField = {
  name: "subcontractor_name",
  label: "Subcontractor name",
  type: "text",
  required: true,
  source: "ai",
  instructions: "Extract the subcontractor name.",
};

test("reads recognized sample value from requested fields", () => {
  const result = readRecognizedSampleField(
    {
      fields: {
        "Subcontractor name": "Ming Kee Construction",
      },
      confidence: {},
      evidence: {
        "Subcontractor name": "Subcontractor: Ming Kee Construction",
      },
      notes: [],
      strategy: "pdf-ocr",
    },
    subcontractorField,
  );

  assert.deepEqual(result, {
    value: "Ming Kee Construction",
    evidence: "Subcontractor: Ming Kee Construction",
  });
});

test("falls back to a matching suggested field when requested fields are empty", () => {
  const result = readRecognizedSampleField(
    {
      fields: {},
      confidence: {},
      suggestedFields: [
        {
          name: "suggested_subcontractor",
          label: "Subcontractor",
          value: "Ming Kee Construction",
          confidence: "high",
          evidence: "Subcontractor Ming Kee Construction",
          instructions: "Extract the subcontractor name.",
        },
      ],
      notes: [],
      strategy: "pdf-ocr",
    },
    subcontractorField,
  );

  assert.deepEqual(result, {
    value: "Ming Kee Construction",
    evidence: "Subcontractor Ming Kee Construction",
  });
});

test("prefers the selected OCR page image for sample AI recognition", () => {
  const result = buildSampleRecognitionPageImages({
    selectedPreviewPage: {
      id: "pdf-page-2",
      pageNumber: 2,
      mimeType: "image/png",
      imageBase64: "selected-preview-page",
      dataUrl: "data:image/png;base64,selected-preview-page",
    },
    samplePageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page-one",
      },
      {
        pageNumber: 2,
        mimeType: "image/png",
        imageBase64: "ocr-page-two",
        pageText: "Subcontractor: Ming Kee Construction",
      },
    ],
  });

  assert.deepEqual(result, [
    {
      pageNumber: 2,
      mimeType: "image/png",
      imageBase64: "ocr-page-two",
      pageText: "Subcontractor: Ming Kee Construction",
    },
  ]);
});

test("falls back to the selected preview page when no matching OCR page exists", () => {
  const result = buildSampleRecognitionPageImages({
    selectedPreviewPage: {
      id: "pdf-page-2",
      pageNumber: 2,
      mimeType: "image/png",
      imageBase64: "selected-preview-page",
      dataUrl: "data:image/png;base64,selected-preview-page",
    },
    samplePageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "ocr-page-one",
      },
    ],
  });

  assert.deepEqual(result, [
    {
      pageNumber: 2,
      mimeType: "image/png",
      imageBase64: "selected-preview-page",
    },
  ]);
});

test("falls back to stored OCR page images when no preview page is selected", () => {
  const samplePageImages = [
    {
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "ocr-page-one",
    },
  ];

  const result = buildSampleRecognitionPageImages({
    selectedPreviewPage: null,
    samplePageImages,
  });

  assert.equal(result, samplePageImages);
});

test("explains provider setup failures instead of reporting low recognition", () => {
  const result = getSampleRecognitionFailureMessage({
    fields: {},
    confidence: {},
    notes: [
      "Qwen page OCR: OPENROUTER_API_KEY is not configured yet.",
      "Main page parser: OPENROUTER_API_KEY is not configured yet.",
      "OPENROUTER_API_KEY is not configured yet.",
    ],
    strategy: "pdf-ocr",
    diagnostics: {
      requestId: "parse-123",
    },
  });

  assert.equal(
    result,
    "AI provider is not configured for this deployment. Missing OPENROUTER_API_KEY. Diagnostic ID: parse-123.",
  );
});
