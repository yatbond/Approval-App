import { buildPreviewPagesFromPdfImages, type DocumentPreviewPage } from "./document-preview.ts";
import type { PdfPageImageInput } from "./parser.ts";
import type { WorkflowDocumentSample, WorkflowDocumentSamplePage } from "./types.ts";

type FileLike = Pick<File, "name" | "type">;

export function buildWorkflowDocumentSample({
  file,
  dataUrl,
  previewPages,
  pageImages,
  savedAt = new Date().toISOString(),
}: {
  file: FileLike;
  dataUrl: string;
  previewPages: DocumentPreviewPage[];
  pageImages: PdfPageImageInput[];
  savedAt?: string;
}): WorkflowDocumentSample {
  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
    previewPages: previewPages.map(toSamplePage),
    pageImages: pageImages.map(toSamplePage),
    savedAt,
  };
}

export function getSamplePreviewPages(
  sample?: WorkflowDocumentSample | null,
): DocumentPreviewPage[] {
  return sample?.previewPages?.length
    ? buildPreviewPagesFromPdfImages(sample.previewPages)
    : [];
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
    imageBase64: page.imageBase64,
    ...(page.pageText ? { pageText: page.pageText } : {}),
  };
}

function toPageImage(page: WorkflowDocumentSamplePage): PdfPageImageInput {
  return {
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    imageBase64: page.imageBase64,
    ...(page.pageText ? { pageText: page.pageText } : {}),
  };
}
