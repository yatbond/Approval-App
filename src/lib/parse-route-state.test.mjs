import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParseLogEvent,
  isPdfPageContext,
} from "./parse-route-state.ts";

test("accepts rendered PDF page context with either image data or typed text", () => {
  assert.equal(
    isPdfPageContext({
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "page-one",
    }),
    true,
  );
  assert.equal(
    isPdfPageContext({
      pageNumber: 2,
      mimeType: "image/png",
      pageText: "Typed subcontractor name Ming Kee Construction",
    }),
    true,
  );
  assert.equal(
    isPdfPageContext({
      pageNumber: 3,
      mimeType: "image/png",
    }),
    false,
  );
});

test("builds parse log events without raw image or text payloads", () => {
  const event = buildParseLogEvent({
    requestId: "parse-1",
    stage: "complete",
    fileName: "sample.pdf",
    fileSize: 12345,
    strategy: "pdf-ocr",
    fieldLabels: ["Subcontractor name"],
    pageImages: [
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "very-large-base64-payload",
        pageText: "Typed subcontractor name Ming Kee Construction",
      },
    ],
    parserPath: "qwen-page-images-with-pdf-fallback",
    resultFields: ["Subcontractor name"],
    resultSuggestions: 0,
    notes: ["Parsed PDF with fallback."],
  });

  assert.deepEqual(event, {
    requestId: "parse-1",
    stage: "complete",
    fileName: "sample.pdf",
    fileSize: 12345,
    strategy: "pdf-ocr",
    fieldLabels: ["Subcontractor name"],
    pageImageCount: 1,
    pageImageWithImageCount: 1,
    pageImageWithTextCount: 1,
    pageImageBase64Bytes: 25,
    parserPath: "qwen-page-images-with-pdf-fallback",
    resultFields: ["Subcontractor name"],
    resultSuggestions: 0,
    notes: ["Parsed PDF with fallback."],
  });
  assert.equal(JSON.stringify(event).includes("very-large-base64-payload"), false);
  assert.equal(JSON.stringify(event).includes("Ming Kee Construction"), false);
});
