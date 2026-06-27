import assert from "node:assert/strict";
import test from "node:test";
import {
  getPdfJsDocumentAssetOptions,
  getPdfOcrRenderOptions,
  getPdfPreviewRenderOptions,
  isPdfFile,
  renderPdfFileToPageImages,
  shouldRenderPdfForVision,
} from "./pdf-page-images.ts";

test("uses high-resolution multi-page rendering for human PDF preview", () => {
  assert.deepEqual(getPdfPreviewRenderOptions(), {
    pageLimit: 25,
    renderScale: 3,
  });
});

test("keeps OCR PDF rendering bounded separately from preview rendering", () => {
  assert.deepEqual(getPdfOcrRenderOptions(), {
    pageLimit: 3,
    renderScale: 2,
  });
});

test("configures browser-accessible PDF.js runtime assets", () => {
  assert.deepEqual(getPdfJsDocumentAssetOptions(), {
    cMapPacked: true,
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    useWorkerFetch: true,
    wasmUrl: "/pdfjs/wasm/",
  });
});

test("detects PDFs by MIME type or filename", () => {
  assert.equal(isPdfFile(new File([""], "scan.bin", { type: "application/pdf" })), true);
  assert.equal(isPdfFile(new File([""], "signed-final.PDF", { type: "" })), true);
  assert.equal(isPdfFile(new File([""], "image.png", { type: "image/png" })), false);
});

test("skips page image rendering outside a browser canvas environment", async () => {
  assert.deepEqual(
    await renderPdfFileToPageImages(
      new File(["not a real pdf"], "scan.pdf", { type: "application/pdf" }),
    ),
    [],
  );
});

test("only renders PDF files for vision when page image mode is enabled", () => {
  const originalMode = process.env.NEXT_PUBLIC_PDF_OCR_MODE;
  const pdf = new File([""], "scan.pdf", { type: "application/pdf" });
  const image = new File([""], "scan.png", { type: "image/png" });

  try {
    delete process.env.NEXT_PUBLIC_PDF_OCR_MODE;
    assert.equal(shouldRenderPdfForVision(pdf), true);
    assert.equal(shouldRenderPdfForVision(image), false);

    process.env.NEXT_PUBLIC_PDF_OCR_MODE = "text-only";
    assert.equal(shouldRenderPdfForVision(pdf), false);

    process.env.NEXT_PUBLIC_PDF_OCR_MODE = "qwen-page-images";
    assert.equal(shouldRenderPdfForVision(pdf), true);
  } finally {
    if (originalMode === undefined) {
      delete process.env.NEXT_PUBLIC_PDF_OCR_MODE;
    } else {
      process.env.NEXT_PUBLIC_PDF_OCR_MODE = originalMode;
    }
  }
});
