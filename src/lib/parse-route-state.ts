import type { PdfPageImageInput } from "./parser";

export type ParseLogEventInput = {
  requestId: string;
  stage: "start" | "complete" | "error";
  fileName: string;
  fileSize: number;
  strategy: string;
  fieldLabels: string[];
  pageImages: PdfPageImageInput[];
  parserPath?: string;
  resultFields?: string[];
  resultSuggestions?: number;
  notes?: string[];
};

export function isPdfPageContext(value: Partial<PdfPageImageInput>) {
  if (
    !value ||
    typeof value.pageNumber !== "number" ||
    typeof value.mimeType !== "string" ||
    !value.mimeType.startsWith("image/")
  ) {
    return false;
  }

  return hasText(value.imageBase64) || hasText(value.pageText);
}

export function buildParseLogEvent(input: ParseLogEventInput) {
  return {
    requestId: input.requestId,
    stage: input.stage,
    fileName: input.fileName,
    fileSize: input.fileSize,
    strategy: input.strategy,
    fieldLabels: input.fieldLabels,
    pageImageCount: input.pageImages.length,
    pageImageWithImageCount: input.pageImages.filter((page) =>
      hasText(page.imageBase64),
    ).length,
    pageImageWithTextCount: input.pageImages.filter((page) =>
      hasText(page.pageText),
    ).length,
    pageImageBase64Bytes: input.pageImages.reduce(
      (sum, page) => sum + (page.imageBase64?.length || 0),
      0,
    ),
    ...(input.parserPath ? { parserPath: input.parserPath } : {}),
    ...(input.resultFields ? { resultFields: input.resultFields } : {}),
    ...(input.resultSuggestions !== undefined
      ? { resultSuggestions: input.resultSuggestions }
      : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function hasText(value?: string) {
  return Boolean(value?.trim());
}
