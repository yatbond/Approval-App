import { buildPreviewPagesFromPdfImages, type DocumentPreviewPage } from "./document-preview.ts";
import type { PdfPageImageInput } from "./parser.ts";
import type { WorkflowDocumentSample, WorkflowDocumentSamplePage } from "./types.ts";

type FileLike = Pick<File, "name" | "type">;

export function buildWorkflowDocumentSample({
  file,
  previewPages,
  pageImages,
  savedAt = new Date().toISOString(),
}: {
  file: FileLike;
  previewPages: DocumentPreviewPage[];
  pageImages: PdfPageImageInput[];
  savedAt?: string;
}): WorkflowDocumentSample {
  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    previewPages: previewPages.map(toSamplePage),
    pageImages: pageImages.map(toSamplePage),
    savedAt,
  };
}

export function getSamplePreviewPages(
  sample?: WorkflowDocumentSample | null,
): DocumentPreviewPage[] {
  const imagePages = (sample?.previewPages || []).filter(
    (page) => page.imageBase64,
  ) as PdfPageImageInput[];
  return imagePages.length ? buildPreviewPagesFromPdfImages(imagePages) : [];
}

export function getSamplePageImages(
  sample?: WorkflowDocumentSample | null,
): PdfPageImageInput[] {
  if (sample?.pageImages?.length) {
    return sample.pageImages.map(toPageImage);
  }

  return (sample?.previewPages || []).map(toPageImage);
}

function toSamplePage(
  page: DocumentPreviewPage | PdfPageImageInput,
): WorkflowDocumentSamplePage {
  return {
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    ...(page.pageText ? { pageText: page.pageText } : {}),
  };
}

function toPageImage(page: WorkflowDocumentSamplePage): PdfPageImageInput {
  return {
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    ...(page.imageBase64 ? { imageBase64: page.imageBase64 } : {}),
    ...(page.pageText ? { pageText: page.pageText } : {}),
  };
}
