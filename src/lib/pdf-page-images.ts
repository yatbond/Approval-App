import type { PdfPageImageInput } from "./parser.ts";

const defaultPageLimit = 3;
const defaultRenderScale = 1.5;

export async function renderPdfFileToPageImages(
  file: File,
  {
    pageLimit = defaultPageLimit,
    renderScale = defaultRenderScale,
  }: {
    pageLimit?: number;
    renderScale?: number;
  } = {},
): Promise<PdfPageImageInput[]> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return [];
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
  }).promise;
  const pageCount = Math.min(pdf.numPages, Math.max(1, pageLimit));
  const images: PdfPageImageInput[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      continue;
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
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

export function shouldRenderPdfForVision(file: File) {
  return (
    file.type.includes("pdf") &&
    (process.env.NEXT_PUBLIC_PDF_OCR_MODE || "qwen-page-images") ===
      "qwen-page-images"
  );
}
