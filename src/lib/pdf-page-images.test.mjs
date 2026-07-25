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

test("renders bounded PDF pages to base64 PNG images with injected PDF.js runtime", async () => {
  const renderCalls = [];
  const canvases = [];
  const file = new File(["pdf"], "scan.pdf", { type: "application/pdf" });
  const fakePdfJs = {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: (input) => {
      assert.equal(input.cMapUrl, "/pdfjs/cmaps/");
      assert.ok(input.data instanceof ArrayBuffer);
      return {
        promise: Promise.resolve({
          numPages: 5,
          getPage: async (pageNumber) => ({
            getViewport: ({ scale }) => ({
              width: pageNumber * 10 * scale,
              height: pageNumber * 5 * scale,
            }),
            getTextContent: async () => ({
              items: [
                {
                  str:
                    pageNumber === 1
                      ? "Subcontractor Ming Kee"
                      : "Payment amount HKD 500,000",
                },
              ],
            }),
            render: ({ canvas, canvasContext, viewport }) => {
              renderCalls.push({
                pageNumber,
                width: canvas.width,
                height: canvas.height,
                fillStyle: canvasContext.fillStyle,
                viewport,
              });
              return { promise: Promise.resolve() };
            },
          }),
        }),
      };
    },
  };

  const pages = await renderPdfFileToPageImages(
    file,
    { pageLimit: 2, renderScale: 1.5 },
    {
      window: {},
      document: {
        createElement: (tagName) => {
          assert.equal(tagName, "canvas");
          const canvasNumber = canvases.length + 1;
          const context = {
            fillStyle: "",
            fillRect: () => {},
          };
          const canvas = {
            width: 0,
            height: 0,
            getContext: () => context,
            toDataURL: () => `data:image/png;base64,page-${canvasNumber}`,
          };
          canvases.push(canvas);
          return canvas;
        },
      },
      importPdfJs: async () => fakePdfJs,
      workerSrc: "fake-worker.js",
    },
  );

  assert.equal(fakePdfJs.GlobalWorkerOptions.workerSrc, "fake-worker.js");
  assert.deepEqual(
    pages.map((page) => page.pageNumber),
    [1, 2],
  );
  assert.deepEqual(
    pages.map((page) => page.imageBase64),
    ["page-1", "page-2"],
  );
  assert.deepEqual(
    pages.map((page) => page.pageText),
    ["Subcontractor Ming Kee", "Payment amount HKD 500,000"],
  );
  assert.deepEqual(
    renderCalls.map((call) => [call.pageNumber, call.width, call.height, call.fillStyle]),
    [
      [1, 15, 8, "#ffffff"],
      [2, 30, 15, "#ffffff"],
    ],
  );
});

test("uses the bundled PDF worker URL when no runtime worker is supplied", async () => {
  const fakePdfJs = createFakePdfJs({
    numPages: 1,
    getContext: () => ({
      fillStyle: "",
      fillRect: () => {},
    }),
    dataUrl: "data:image/png;base64,page",
  });

  const pages = await renderPdfFileToPageImages(
    new File(["pdf"], "scan.pdf", { type: "application/pdf" }),
    { pageLimit: 1, renderScale: 1 },
    {
      window: {},
      document: fakePdfJs.document,
      importPdfJs: async () => fakePdfJs.pdfjs,
    },
  );

  assert.equal(pages.length, 1);
  assert.match(
    fakePdfJs.pdfjs.GlobalWorkerOptions.workerSrc,
    /pdf\.worker\.mjs/,
  );
});

test("skips PDF pages when a canvas context is unavailable", async () => {
  const fakePdfJs = createFakePdfJs({
    numPages: 1,
    getContext: () => null,
    dataUrl: "data:image/png;base64,ignored",
  });

  assert.deepEqual(
    await renderPdfFileToPageImages(
      new File(["pdf"], "scan.pdf", { type: "application/pdf" }),
      { pageLimit: 1, renderScale: 1 },
      {
        window: {},
        document: fakePdfJs.document,
        importPdfJs: async () => fakePdfJs.pdfjs,
      },
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

function createFakePdfJs({ numPages, getContext, dataUrl }) {
  const pdfjs = {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages,
        getPage: async (pageNumber) => ({
          getViewport: ({ scale }) => ({
            width: pageNumber * 10 * scale,
            height: pageNumber * 5 * scale,
          }),
          getTextContent: async () => ({
            items: [
              {
                str:
                  pageNumber === 1
                    ? "Subcontractor Ming Kee"
                    : "Payment amount HKD 500,000",
              },
            ],
          }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    }),
  };
  const document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext,
      toDataURL: () => dataUrl,
    }),
  };

  return { pdfjs, document };
}
