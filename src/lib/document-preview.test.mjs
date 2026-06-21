import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreviewPagesFromPdfImages,
  createPreviewPageFromDataUrl,
  normalizedRectToPercentStyle,
  normalizeSelectionRect,
} from "./document-preview.ts";

test("builds preview pages from rendered PDF page images", () => {
  assert.deepEqual(
    buildPreviewPagesFromPdfImages([
      { pageNumber: 1, mimeType: "image/png", imageBase64: "page-one" },
    ]),
    [
      {
        id: "pdf-page-1",
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "page-one",
        dataUrl: "data:image/png;base64,page-one",
      },
    ],
  );
});

test("creates an image preview page from a data URL", () => {
  assert.deepEqual(
    createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,abc123"),
    {
      id: "scan.png-page-1",
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "abc123",
      dataUrl: "data:image/png;base64,abc123",
    },
  );
});

test("normalizes a drag selection regardless of drag direction", () => {
  assert.deepEqual(
    normalizeSelectionRect(
      { x: 300, y: 200 },
      { x: 100, y: 80 },
      { width: 400, height: 300 },
    ),
    {
      x: 0.25,
      y: 0.2667,
      width: 0.5,
      height: 0.4,
    },
  );
});

test("formats normalized selection as percentage CSS", () => {
  assert.deepEqual(
    normalizedRectToPercentStyle({
      x: 0.25,
      y: 0.1,
      width: 0.5,
      height: 0.2,
    }),
    {
      left: "25%",
      top: "10%",
      width: "50%",
      height: "20%",
    },
  );
});
