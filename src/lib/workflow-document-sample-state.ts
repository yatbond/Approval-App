import { buildPreviewPagesFromPdfImages, type DocumentPreviewPage } from "./document-preview.ts";
import type { PdfPageImageInput } from "./parser.ts";
import type {
  WorkflowDocumentSample,
  WorkflowDocumentSamplePage,
  WorkflowDocumentSampleTrainingDraft,
} from "./types.ts";

type FileLike = Pick<File, "name" | "type">;

const maxSamplePageImageBase64Length = 1_900_000;
const maxSampleTotalImageBase64Length = 4_250_000;

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
  const durablePageImages = sanitizeSamplePages(pageImages, {
    includeImages: true,
  });
  const durablePreviewPages = sanitizeSamplePages(previewPages, {
    includeImages: !hasStoredImage(durablePageImages),
  });

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    previewPages: durablePreviewPages,
    pageImages: durablePageImages,
    savedAt,
  };
}

export function sanitizeWorkflowDocumentSample(
  sample: WorkflowDocumentSample,
): WorkflowDocumentSample {
  const pageImages = sanitizeSamplePages(sample.pageImages || [], {
    includeImages: true,
  });

  return {
    fileName: sample.fileName,
    mimeType: sample.mimeType,
    previewPages: sanitizeSamplePages(sample.previewPages || [], {
      includeImages: !hasStoredImage(pageImages),
    }),
    pageImages,
    savedAt: sample.savedAt,
    ...(sample.trainingDraft
      ? { trainingDraft: sanitizeWorkflowDocumentSampleTrainingDraft(sample.trainingDraft) }
      : {}),
  };
}

export function saveWorkflowDocumentSampleTrainingDraft(
  sample: WorkflowDocumentSample,
  draft: WorkflowDocumentSampleTrainingDraft,
): WorkflowDocumentSample {
  return {
    ...sample,
    trainingDraft: sanitizeWorkflowDocumentSampleTrainingDraft(draft),
  };
}

export function clearWorkflowDocumentSampleTrainingDraft(
  sample: WorkflowDocumentSample,
): WorkflowDocumentSample {
  const nextSample = { ...sample };
  delete nextSample.trainingDraft;
  return nextSample;
}

export function getSamplePreviewPages(
  sample?: WorkflowDocumentSample | null,
): DocumentPreviewPage[] {
  const imagePages = (sample?.previewPages || []).filter(
    (page) => page.imageBase64,
  ) as PdfPageImageInput[];
  if (imagePages.length) {
    return buildPreviewPagesFromPdfImages(imagePages);
  }

  const ocrPages = (sample?.pageImages || []).filter(
    (page) => page.imageBase64,
  ) as PdfPageImageInput[];
  return ocrPages.length ? buildPreviewPagesFromPdfImages(ocrPages) : [];
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
  options: { includeImage: boolean },
): WorkflowDocumentSamplePage {
  return {
    pageNumber: page.pageNumber,
    mimeType: page.mimeType,
    ...(options.includeImage && page.imageBase64
      ? { imageBase64: page.imageBase64 }
      : {}),
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

function sanitizeSamplePages(
  pages: Array<DocumentPreviewPage | PdfPageImageInput | WorkflowDocumentSamplePage>,
  { includeImages }: { includeImages: boolean },
): WorkflowDocumentSamplePage[] {
  let storedImageBase64Length = 0;

  return pages.map((page) => {
    const imageBase64 = includeImages ? page.imageBase64 || "" : "";
    const canStoreImage =
      imageBase64.length > 0 &&
      imageBase64.length <= maxSamplePageImageBase64Length &&
      storedImageBase64Length + imageBase64.length <= maxSampleTotalImageBase64Length;

    if (canStoreImage) {
      storedImageBase64Length += imageBase64.length;
    }

    return toSamplePage(page, { includeImage: canStoreImage });
  });
}

function hasStoredImage(pages: WorkflowDocumentSamplePage[]) {
  return pages.some((page) => Boolean(page.imageBase64));
}

function sanitizeWorkflowDocumentSampleTrainingDraft(
  draft: WorkflowDocumentSampleTrainingDraft,
): WorkflowDocumentSampleTrainingDraft {
  return {
    selectedFieldName: draft.selectedFieldName,
    ...(draft.newFieldLabel !== undefined ? { newFieldLabel: draft.newFieldLabel } : {}),
    instructions: draft.instructions,
    value: draft.value,
    ...(draft.evidence ? { evidence: draft.evidence } : {}),
    ...(draft.anchor ? { anchor: draft.anchor } : {}),
  };
}
