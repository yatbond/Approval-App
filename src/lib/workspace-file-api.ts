import type { PdfPageImageInput } from "./parser.ts";
import type {
  ExtractionTrainingExample,
  ExtractedFieldSuggestion,
  WorkflowDocumentRequirement,
  WorkflowField,
} from "./types.ts";

export const defaultParseLanguageHint =
  "mixed English, Traditional Chinese, Simplified Chinese";

type WorkspaceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AttachmentUploadPayload = {
  storagePath: string;
  publicUrl?: string;
};

export type ParsedWorkspaceFilePayload = {
  strategy: string;
  fields: Record<string, string>;
  confidence: Record<string, string>;
  evidence?: Record<string, string>;
  suggestedFields?: ExtractedFieldSuggestion[];
  notes: string[];
  tables?: { sheetName: string; rows: Record<string, unknown>[] }[];
  diagnostics?: {
    requestId?: string;
    parserPath?: string;
  };
  [key: string]: unknown;
};

export async function uploadWorkspaceAttachmentFile({
  file,
  documentRequirement,
  fetcher = fetch,
}: {
  file: File;
  documentRequirement?: WorkflowDocumentRequirement;
  fetcher?: WorkspaceFetch;
}): Promise<AttachmentUploadPayload> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentId", documentRequirement?.id || "ad-hoc");
  formData.append(
    "documentType",
    documentRequirement?.documentType || "Ad hoc document",
  );

  const response = await fetcher("/api/attachments/upload", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as {
    storagePath?: string;
    publicUrl?: string;
    error?: string;
  };

  if (!response.ok || !payload.storagePath) {
    throw new Error(payload.error || "Unable to store document in Supabase.");
  }

  return {
    storagePath: payload.storagePath,
    publicUrl: payload.publicUrl,
  };
}

export async function parseWorkspaceFile({
  file,
  documentRequirement,
  adHocFields = [],
  pageImages = [],
  extractionExamples = [],
  languageHint = defaultParseLanguageHint,
  fetcher = fetch,
}: {
  file: File;
  documentRequirement?: WorkflowDocumentRequirement;
  adHocFields?: WorkflowField[];
  pageImages?: PdfPageImageInput[];
  extractionExamples?: ExtractionTrainingExample[];
  languageHint?: string;
  fetcher?: WorkspaceFetch;
}): Promise<ParsedWorkspaceFilePayload> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("languageHint", languageHint);
  const fields = [
    ...(documentRequirement?.fields || []),
    ...adHocFields,
  ];
  if (fields.length) {
    formData.append("fieldsJson", JSON.stringify(fields));
  }
  if (pageImages.length) {
    formData.append("pageImagesJson", JSON.stringify(pageImages));
  }
  if (extractionExamples.length) {
    formData.append("examplesJson", JSON.stringify(extractionExamples));
  }

  const response = await fetcher("/api/parse", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as ParsedWorkspaceFilePayload & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Unable to parse file.");
  }

  return payload;
}
