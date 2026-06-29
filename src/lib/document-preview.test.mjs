import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreviewImageStyle,
  buildPreviewPagesFromPdfImages,
  createEnhancedPreviewDataUrl,
  createPreviewPageFromDataUrl,
  cropPreviewPageToFile,
  getActiveSelectionRect,
  enhancePreviewPixels,
  normalizedRectToPercentStyle,
  normalizeSelectionRect,
  readImageFileAsPreviewPage,
} from "./document-preview.ts";

test("builds preview pages from rendered PDF page images", () => {
  assert.deepEqual(
    buildPreviewPagesFromPdfImages([
      {
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "page-one",
        pageText: "Typed contractor name",
      },
    ]),
    [
      {
        id: "pdf-page-1",
        pageNumber: 1,
        mimeType: "image/png",
        imageBase64: "page-one",
        dataUrl: "data:image/png;base64,page-one",
        pageText: "Typed contractor name",
      },
    ],
  );
});

test("skips text-only PDF page context when building visual previews", () => {
  assert.deepEqual(
    buildPreviewPagesFromPdfImages([
      {
        pageNumber: 1,
        mimeType: "image/png",
        pageText: "Saved page text without embedded image data",
      },
      {
        pageNumber: 2,
        mimeType: "image/png",
        imageBase64: "page-two",
      },
    ]),
    [
      {
        id: "pdf-page-2",
        pageNumber: 2,
        mimeType: "image/png",
        imageBase64: "page-two",
        dataUrl: "data:image/png;base64,page-two",
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

test("defaults preview page MIME type when data URL metadata is unsupported", () => {
  assert.deepEqual(
    createPreviewPageFromDataUrl("scan.bin", "data:application/octet-stream,raw"),
    {
      id: "scan.bin-page-1",
      pageNumber: 1,
      mimeType: "image/png",
      imageBase64: "raw",
      dataUrl: "data:application/octet-stream,raw",
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

test("clamps normalized selections to the preview bounds", () => {
  assert.deepEqual(
    normalizeSelectionRect(
      { x: -50, y: -10 },
      { x: 250, y: 120 },
      { width: 200, height: 100 },
    ),
    {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
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

test("uses the in-progress drag rectangle before the committed highlight", () => {
  assert.deepEqual(
    getActiveSelectionRect({
      committedRect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      selectionStart: { x: 10, y: 20 },
      currentPoint: { x: 70, y: 80 },
      bounds: { width: 100, height: 200 },
    }),
    {
      x: 0.1,
      y: 0.1,
      width: 0.6,
      height: 0.3,
    },
  );
});

test("falls back to the committed selection when no active drag is available", () => {
  const committedRect = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };

  assert.equal(
    getActiveSelectionRect({
      committedRect,
      selectionStart: { x: 10, y: 20 },
      currentPoint: null,
      bounds: { width: 100, height: 200 },
    }),
    committedRect,
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

test("leaves fully transparent preview pixels unchanged", () => {
  const pixels = Uint8ClampedArray.from([
    100, 120, 140, 0,
    200, 210, 220, 0,
  ]);

  assert.deepEqual(
    Array.from(
      enhancePreviewPixels({
        data: pixels,
        mode: "black-text",
      }),
    ),
    Array.from(pixels),
  );
});

test("skips transparent pixels while enhancing visible pixels", () => {
  const pixels = Uint8ClampedArray.from([
    250, 250, 250, 255,
    30, 40, 50, 0,
    245, 245, 245, 255,
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
      30, 40, 50, 0,
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

test("creates enhanced preview data URLs through a canvas", async () => {
  const calls = [];
  await withPreviewBrowserFakes({
    image: { width: 2, height: 1 },
    canvas: {
      context: {
        drawImage: (...args) => calls.push(["drawImage", args.length]),
        getImageData: () => ({
          data: Uint8ClampedArray.from([
            250, 250, 250, 255,
            245, 245, 245, 255,
          ]),
        }),
        putImageData: (imageData, x, y) => {
          calls.push(["putImageData", x, y, Array.from(imageData.data)]);
        },
      },
      dataUrl: "data:image/png;base64,enhanced",
    },
  }, async () => {
    const dataUrl = await createEnhancedPreviewDataUrl(
      createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,raw"),
      "black-text",
    );

    assert.equal(dataUrl, "data:image/png;base64,enhanced");
    assert.deepEqual(calls, [
      ["drawImage", 3],
      [
        "putImageData",
        0,
        0,
        [
          255, 255, 255, 255,
          0, 0, 0, 255,
        ],
      ],
    ]);
  });
});

test("rejects enhanced previews when a canvas context cannot be prepared", async () => {
  await withPreviewBrowserFakes({
    canvas: { context: null },
  }, async () => {
    await assert.rejects(
      () =>
        createEnhancedPreviewDataUrl(
          createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,raw"),
          "enhanced",
        ),
      /Unable to prepare enhanced document preview/,
    );
  });
});

test("reads image files as preview pages with FileReader", async () => {
  await withPreviewBrowserFakes({
    fileReaderResult: "data:image/jpeg;base64,from-file",
  }, async () => {
    assert.deepEqual(
      await readImageFileAsPreviewPage(
        new File(["image"], "receipt.jpg", { type: "image/jpeg" }),
      ),
      {
        id: "receipt.jpg-page-1",
        pageNumber: 1,
        mimeType: "image/jpeg",
        imageBase64: "from-file",
        dataUrl: "data:image/jpeg;base64,from-file",
      },
    );
  });
});

test("rejects image preview reads when FileReader fails", async () => {
  await withPreviewBrowserFakes({
    fileReaderError: true,
  }, async () => {
    await assert.rejects(
      () =>
        readImageFileAsPreviewPage(
          new File(["image"], "receipt.jpg", { type: "image/jpeg" }),
        ),
      /Unable to read image preview/,
    );
  });
});

test("crops normalized preview regions to a PNG file", async () => {
  const drawCalls = [];
  await withPreviewBrowserFakes({
    image: { width: 200, height: 100 },
    canvas: {
      context: {
        drawImage: (...args) => drawCalls.push(args),
      },
      blob: new Blob(["cropped"], { type: "image/png" }),
    },
  }, async () => {
    const file = await cropPreviewPageToFile({
      page: createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,raw"),
      rect: { x: 0.25, y: 0.1, width: 0.5, height: 0.4 },
      fileName: "crop.png",
    });

    assert.equal(file.name, "crop.png");
    assert.equal(file.type, "image/png");
    assert.deepEqual(drawCalls[0].slice(1), [50, 10, 100, 40, 0, 0, 100, 40]);
  });
});

test("rejects crop requests when canvas setup or output fails", async () => {
  const page = createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,raw");

  await withPreviewBrowserFakes({ canvas: { context: null } }, async () => {
    await assert.rejects(
      () =>
        cropPreviewPageToFile({
          page,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          fileName: "crop.png",
        }),
      /Unable to prepare highlighted document region/,
    );
  });

  await withPreviewBrowserFakes({ canvas: { blob: null } }, async () => {
    await assert.rejects(
      () =>
        cropPreviewPageToFile({
          page,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          fileName: "crop.png",
        }),
      /Unable to crop highlighted document region/,
    );
  });
});

test("rejects preview work when the image cannot load", async () => {
  await withPreviewBrowserFakes({ imageError: true }, async () => {
    await assert.rejects(
      () =>
        createEnhancedPreviewDataUrl(
          createPreviewPageFromDataUrl("scan.png", "data:image/png;base64,raw"),
          "enhanced",
        ),
      /Unable to load document preview/,
    );
  });
});

async function withPreviewBrowserFakes(options, callback) {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const originalFileReader = globalThis.FileReader;
  const canvas = createFakeCanvas(options.canvas || {});

  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, "canvas");
      return canvas;
    },
  };
  globalThis.Image = class FakeImage {
    constructor() {
      this.naturalWidth = options.image?.width || 100;
      this.naturalHeight = options.image?.height || 50;
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this.currentSrc = value;
      if (options.imageError) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    }
  };
  globalThis.FileReader = class FakeFileReader {
    constructor() {
      this.result = "";
      this.onload = null;
      this.onerror = null;
    }

    readAsDataURL() {
      if (options.fileReaderError) {
        this.onerror?.();
        return;
      }
      this.result = options.fileReaderResult || "data:image/png;base64,reader";
      this.onload?.();
    }
  };

  try {
    await callback();
  } finally {
    restoreGlobal("document", originalDocument);
    restoreGlobal("Image", originalImage);
    restoreGlobal("FileReader", originalFileReader);
  }
}

function createFakeCanvas(options) {
  return {
    width: 0,
    height: 0,
    getContext: () =>
      options.context === undefined
        ? {
            drawImage: () => {},
            getImageData: () => ({
              data: Uint8ClampedArray.from([250, 250, 250, 255]),
            }),
            putImageData: () => {},
          }
        : options.context,
    toDataURL: () => options.dataUrl || "data:image/png;base64,canvas",
    toBlob: (callback) => {
      callback(
        options.blob === undefined
          ? new Blob(["canvas"], { type: "image/png" })
          : options.blob,
      );
    },
  };
}

function restoreGlobal(key, value) {
  if (value === undefined) {
    delete globalThis[key];
  } else {
    globalThis[key] = value;
  }
}
