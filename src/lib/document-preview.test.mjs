import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreviewImageStyle,
  buildPreviewPagesFromPdfImages,
  createPreviewPageFromDataUrl,
  enhancePreviewPixels,
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

test("builds a readable preview image style with zoom and contrast controls", () => {
  assert.deepEqual(
    buildPreviewImageStyle({
      contrast: 210,
      brightness: 88,
      zoom: 145,
    }),
    {
      filter: "grayscale(100%) contrast(210%) brightness(88%)",
      maxWidth: "none",
      width: "145%",
    },
  );
});

test("clamps preview image controls to readable bounds", () => {
  assert.deepEqual(
    buildPreviewImageStyle({
      contrast: 999,
      brightness: 10,
      zoom: 500,
    }),
    {
      filter: "grayscale(100%) contrast(260%) brightness(70%)",
      maxWidth: "none",
      width: "220%",
    },
  );
});

test("enhances faint near-background text into black text", () => {
  const pixels = Uint8ClampedArray.from([
    250, 250, 250, 255, // paper background
    245, 245, 245, 255, // faint text that normal contrast cannot reveal
    220, 220, 220, 255, // visible rule line
  ]);

  assert.deepEqual(
    Array.from(
      enhancePreviewPixels({
        data: pixels,
        mode: "black-text",
      }),
    ),
    [
      255, 255, 255, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
    ],
  );
});

test("enhanced preview darkens faint text without forcing every mark to black", () => {
  const pixels = Uint8ClampedArray.from([
    250, 250, 250, 255,
    245, 245, 245, 255,
  ]);

  assert.deepEqual(
    Array.from(
      enhancePreviewPixels({
        data: pixels,
        mode: "enhanced",
      }),
    ),
    [
      255, 255, 255, 255,
      145, 145, 145, 255,
    ],
  );
});
