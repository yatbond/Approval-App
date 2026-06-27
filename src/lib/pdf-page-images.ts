import type { PdfPageImageInput } from "./parser.ts";

const defaultOcrPageLimit = 3;
const defaultOcrRenderScale = 2;
const defaultPreviewPageLimit = 25;
const defaultPreviewRenderScale = 3;

export type PdfPageRenderOptions = {
  pageLimit: number;
  renderScale: number;
};

type PdfJsPage = {
  getViewport(input: { scale: number }): { width: number; height: number };
  render(input: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<unknown> };
};

type PdfJsDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
};

type PdfJsRuntime = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: Record<string, unknown>): { promise: Promise<PdfJsDocument> };
};

type PdfPageRenderRuntime = {
  window?: unknown;
  document?: Pick<Document, "createElement">;
  importPdfJs?: () => Promise<PdfJsRuntime>;
  workerSrc?: string;
};

export function getPdfJsDocumentAssetOptions() {
  return {
    cMapPacked: true,
    cMapUrl: "/pdfjs/cmaps/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    useWorkerFetch: true,
    wasmUrl: "/pdfjs/wasm/",
  };
}

export function getPdfOcrRenderOptions(): PdfPageRenderOptions {
  return {
    pageLimit: defaultOcrPageLimit,
    renderScale: defaultOcrRenderScale,
  };
}

export function getPdfPreviewRenderOptions(): PdfPageRenderOptions {
  return {
    pageLimit: defaultPreviewPageLimit,
    renderScale: defaultPreviewRenderScale,
  };
}

export async function renderPdfFileToPageImages(
  file: File,
  {
    pageLimit = defaultOcrPageLimit,
    renderScale = defaultOcrRenderScale,
  }: {
    pageLimit?: number;
    renderScale?: number;
  } = {},
  runtime: PdfPageRenderRuntime = {},
): Promise<PdfPageImageInput[]> {
  const browserWindow =
    runtime.window ?? (typeof window === "undefined" ? undefined : window);
  const browserDocument =
    runtime.document ?? (typeof document === "undefined" ? undefined : document);

  if (!browserWindow || !browserDocument) {
    return [];
  }

  const pdfjs: PdfJsRuntime = runtime.importPdfJs
    ? await runtime.importPdfJs()
    : ((await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsRuntime);
  pdfjs.GlobalWorkerOptions.workerSrc =
    runtime.workerSrc ||
    new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();

  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    ...getPdfJsDocumentAssetOptions(),
  }).promise;
  const pageCount = Math.min(pdf.numPages, Math.max(1, pageLimit));
  const images: PdfPageImageInput[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = browserDocument.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      continue;
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const imageDataUrl = canvas.toDataURL("image/png");
    images.push({
      pageNumber,
      mimeType: "image/png",
      imageBase64: imageDataUrl.split(",")[1] || "",
    });
  }

  return images.filter((image) => image.imageBase64);
}

export function isPdfFile(file: File) {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

export function shouldRenderPdfForVision(file: File) {
  return (
    isPdfFile(file) &&
    (process.env.NEXT_PUBLIC_PDF_OCR_MODE || "qwen-page-images") ===
      "qwen-page-images"
  );
}
