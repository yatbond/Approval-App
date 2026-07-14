import {
  chooseParserStrategy,
  extractImageFields,
  extractPdfFields,
  type ParsedDocumentDraft,
} from "./parser.ts";
import { getFormLibraryFieldInputSource } from "./form-library-state.ts";
import type { ExternalFormIntake } from "./external-form-intake.ts";
import type { FormLibraryDefinition, WorkflowField } from "./types.ts";

const maximumAttachmentBytes = 20 * 1024 * 1024;

type AttachmentParser = (input: {
  file: File;
  fields: WorkflowField[];
}) => Promise<ParsedDocumentDraft>;

export type ExternalAttachmentExtractionResult =
  | { success: true; answers: Record<string, string> }
  | { success: false; message: string };

export async function extractExternalFormAttachmentAnswers({
  definition,
  intake,
  fetcher = fetch,
  parser = parseAttachment,
}: {
  definition: FormLibraryDefinition;
  intake: ExternalFormIntake;
  fetcher?: typeof fetch;
  parser?: AttachmentParser;
}): Promise<ExternalAttachmentExtractionResult> {
  const extractionFields = definition.fields.filter(
    (field) =>
      getFormLibraryFieldInputSource(field, definition.source) ===
      "attachment_extraction",
  );
  if (!extractionFields.length) {
    return { success: true, answers: {} };
  }

  const fieldsByAttachment = new Map<string, WorkflowField[]>();
  for (const field of extractionFields) {
    const attachmentName = normalizeKey(field.attachmentFieldName || "");
    if (!attachmentName) {
      return {
        success: false,
        message: `${field.label} has no attachment extraction source.`,
      };
    }
    fieldsByAttachment.set(attachmentName, [
      ...(fieldsByAttachment.get(attachmentName) || []),
      field,
    ]);
  }

  const answers: Record<string, string> = {};
  for (const [attachmentName, fields] of fieldsByAttachment) {
    const attachmentDefinition = (definition.attachmentFields || []).find(
      (item) => normalizeKey(item.name) === attachmentName,
    );
    const attachment = intake.attachments.find(
      (item) => normalizeKey(item.fieldName) === attachmentName,
    );
    if (!attachment) {
      if (fields.some((field) => field.required)) {
        return {
          success: false,
          message: `Required attachment is missing for AI extraction: ${attachmentDefinition?.label || attachmentName}.`,
        };
      }
      continue;
    }
    if (!attachment.downloadUrl) {
      return {
        success: false,
        message: `${attachment.fileName} cannot be parsed because Power Automate did not provide a download URL.`,
      };
    }

    const safeUrl = getSafeDownloadUrl(attachment.downloadUrl);
    if (!safeUrl) {
      return {
        success: false,
        message: `${attachment.fileName} has an unsupported download URL.`,
      };
    }

    try {
      const response = await fetcher(safeUrl, {
        signal: AbortSignal.timeout(30_000),
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error(`download returned HTTP ${response.status}`);
      }
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > maximumAttachmentBytes) {
        throw new Error("file exceeds the 20 MB parsing limit");
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > maximumAttachmentBytes) {
        throw new Error("file exceeds the 20 MB parsing limit");
      }
      const contentType =
        attachment.contentType ||
        response.headers.get("content-type") ||
        inferContentType(attachment.fileName);
      const file = new File([buffer], attachment.fileName, { type: contentType });
      const parsed = await parser({
        file,
        fields: fields.map((field) => ({
          ...field,
          source: "ai",
          instructions: field.instructions.trim() || `Extract ${field.label}.`,
        })),
      });
      for (const field of fields) {
        const value = findParsedValue(parsed.fields, field);
        if (value) {
          answers[field.label] = value;
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Unable to parse ${attachment.fileName}: ${
          error instanceof Error ? error.message : "unknown extraction error"
        }`,
      };
    }
  }

  return { success: true, answers };
}

async function parseAttachment({
  file,
  fields,
}: {
  file: File;
  fields: WorkflowField[];
}) {
  const strategy = chooseParserStrategy(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (strategy === "pdf-ocr") {
    return extractPdfFields({
      pdfBase64: buffer.toString("base64"),
      fileName: file.name,
      fields,
      languageHint: "mixed English and Chinese",
    });
  }
  if (strategy === "image-ai") {
    return extractImageFields({
      imageBase64: buffer.toString("base64"),
      mimeType: file.type || "image/jpeg",
      fields,
      languageHint: "mixed English and Chinese",
    });
  }
  throw new Error("AI extraction from Microsoft Forms currently supports PDF and image files.");
}

function findParsedValue(values: Record<string, string>, field: WorkflowField) {
  const targetNames = new Set([normalizeKey(field.label), normalizeKey(field.name)]);
  return (
    Object.entries(values).find(([key]) => targetNames.has(normalizeKey(key)))?.[1]?.trim() ||
    ""
  );
}

function getSafeDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function inferContentType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
