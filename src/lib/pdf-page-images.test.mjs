import assert from "node:assert/strict";
import test from "node:test";
import {
  getPdfJsDocumentAssetOptions,
  getPdfOcrRenderOptions,
  getPdfPreviewRenderOptions,
  isPdfFile,
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
