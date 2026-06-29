import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  chooseParserStrategy,
  extractImageFields,
  extractPdfFields,
  extractPdfFieldsWithPageImagesAndPdfFallback,
} from "@/lib/parser";
import { buildParseLogEvent, isPdfPageContext } from "@/lib/parse-route-state";
import { normalizeWorkflowFieldsForParsing } from "@/lib/workflow-parse-fields";
import type { PdfPageImageInput } from "@/lib/parser";
import type { ExtractionTrainingExample, WorkflowField } from "@/lib/types";

const fallbackFields: WorkflowField[] = [
  {
    name: "document_title",
    label: "Document title",
    type: "text",
    required: true,
    source: "ai",
    instructions: "Identify the document title or business purpose.",
  },
  {
    name: "amount",
    label: "Amount",
    type: "currency",
    required: false,
    source: "ai",
    instructions: "Extract the main amount, total, or budget value.",
  },
  {
    name: "date",
    label: "Date",
    type: "date",
    required: false,
    source: "ai",
    instructions: "Extract the primary document date.",
  },
];

export async function POST(request: Request) {
  const requestId = createParseRequestId();
  const formData = await request.formData();
  const file = formData.get("file");
  const languageHint = String(formData.get("languageHint") || "mixed English and Chinese");
  const fields = parseWorkflowFields(formData.get("fieldsJson")) || fallbackFields;
  const pageImages = parsePageImages(formData.get("pageImagesJson"));
  const examples = parseExtractionExamples(formData.get("examplesJson"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const strategy = chooseParserStrategy(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const fieldLabels = fields.map((field) => field.label || field.name);

  logParseEvent(
    buildParseLogEvent({
      requestId,
      stage: "start",
      fileName: file.name || "document",
      fileSize: buffer.length,
      strategy,
      fieldLabels,
      pageImages,
    }),
  );

  try {
    if (strategy === "excel-table") {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        return {
          sheetName,
          rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: "",
          }),
        };
      });

      const parsed = {
        strategy,
        fields: {
          "Workbook sheets": String(workbook.SheetNames.length),
          "First sheet": workbook.SheetNames[0] || "",
          "Rows parsed": String(sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)),
        },
        confidence: {
          "Workbook sheets": "high",
          "Rows parsed": "high",
        },
        tables: sheets,
        notes: [],
      };
      logParseComplete({
        requestId,
        file,
        buffer,
        strategy,
        fieldLabels,
        pageImages,
        parserPath: "excel-table",
        parsed,
      });
      return NextResponse.json({
        ...parsed,
        diagnostics: { requestId, parserPath: "excel-table" },
      });
    }

    if (strategy === "image-ai") {
      const parsed = await extractImageFields({
        imageBase64: buffer.toString("base64"),
        mimeType: file.type || "image/jpeg",
        fields,
        languageHint,
        examples,
      });

      logParseComplete({
        requestId,
        file,
        buffer,
        strategy,
        fieldLabels,
        pageImages,
        parserPath: "image-ai",
        parsed,
      });
      return NextResponse.json({
        ...parsed,
        diagnostics: { requestId, parserPath: "image-ai" },
      });
    }

    const parserPath = pageImages.length
      ? "qwen-page-images-with-pdf-fallback"
      : "pdf-file-parser";
    const parsed = pageImages.length
      ? await extractPdfFieldsWithPageImagesAndPdfFallback({
          pageImages,
          pdfBase64: buffer.toString("base64"),
          fileName: file.name || "document.pdf",
          fields,
          languageHint,
          examples,
        })
      : await extractPdfFields({
          pdfBase64: buffer.toString("base64"),
          fileName: file.name || "document.pdf",
          fields,
          languageHint,
          examples,
        });
    logParseComplete({
      requestId,
      file,
      buffer,
      strategy,
      fieldLabels,
      pageImages,
      parserPath,
      parsed,
    });
    return NextResponse.json({
      ...parsed,
      diagnostics: { requestId, parserPath },
    });
  } catch (error) {
    console.error(
      "[approval-app:parse]",
      JSON.stringify({
        requestId,
        stage: "error",
        fileName: file.name || "document",
        fileSize: buffer.length,
        strategy,
        fieldLabels,
        pageImageCount: pageImages.length,
        error: error instanceof Error ? error.message : "Unknown parse error",
      }),
    );
    throw error;
  }
}

function parseExtractionExamples(
  value: FormDataEntryValue | null,
): ExtractionTrainingExample[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Partial<ExtractionTrainingExample>[];
    return parsed.filter(isExtractionTrainingExample);
  } catch {
    return [];
  }
}

function parseWorkflowFields(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<WorkflowField>[];
    const fields = normalizeWorkflowFieldsForParsing(parsed);
    return fields.length ? fields : null;
  } catch {
    return null;
  }
}

function parsePageImages(value: FormDataEntryValue | null): PdfPageImageInput[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as Partial<PdfPageImageInput>[];
    return parsed.filter(isPageImage);
  } catch {
    return [];
  }
}

function isPageImage(value: Partial<PdfPageImageInput>): value is PdfPageImageInput {
  return isPdfPageContext(value);
}

function logParseComplete({
  requestId,
  file,
  buffer,
  strategy,
  fieldLabels,
  pageImages,
  parserPath,
  parsed,
}: {
  requestId: string;
  file: File;
  buffer: Buffer;
  strategy: string;
  fieldLabels: string[];
  pageImages: PdfPageImageInput[];
  parserPath: string;
  parsed: {
    fields: Record<string, string>;
    suggestedFields?: unknown[];
    notes?: string[];
  };
}) {
  logParseEvent(
    buildParseLogEvent({
      requestId,
      stage: "complete",
      fileName: file.name || "document",
      fileSize: buffer.length,
      strategy,
      fieldLabels,
      pageImages,
      parserPath,
      resultFields: Object.keys(parsed.fields || {}),
      resultSuggestions: parsed.suggestedFields?.length || 0,
      notes: parsed.notes || [],
    }),
  );
}

function logParseEvent(event: Record<string, unknown>) {
  console.info("[approval-app:parse]", JSON.stringify(event));
}

function createParseRequestId() {
  return `parse-${crypto.randomUUID()}`;
}

function isExtractionTrainingExample(
  value: Partial<ExtractionTrainingExample>,
): value is ExtractionTrainingExample {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.templateId === "string" &&
      typeof value.fieldLabel === "string" &&
      typeof value.originalValue === "string" &&
      typeof value.correctedValue === "string" &&
      typeof value.createdByEmail === "string" &&
      typeof value.createdAt === "string" &&
      isOptionalTrainingAnchor(value.anchor),
  );
}

function isOptionalTrainingAnchor(value: ExtractionTrainingExample["anchor"]) {
  if (value === undefined) {
    return true;
  }

  return Boolean(
    value &&
      typeof value.pageNumber === "number" &&
      value.rect &&
      typeof value.rect.x === "number" &&
      typeof value.rect.y === "number" &&
      typeof value.rect.width === "number" &&
      typeof value.rect.height === "number" &&
      (value.nearbyText === undefined || typeof value.nearbyText === "string"),
  );
}
