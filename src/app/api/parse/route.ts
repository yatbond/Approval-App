import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  chooseParserStrategy,
  extractImageFields,
  extractPdfFields,
  extractPdfFieldsWithQwenPageImages,
} from "@/lib/parser";
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

    return NextResponse.json({
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

    return NextResponse.json(parsed);
  }

  const parsed = pageImages.length
    ? await extractPdfFieldsWithQwenPageImages({
        pageImages,
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
  return NextResponse.json(parsed);
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
  return Boolean(
    value &&
      typeof value.pageNumber === "number" &&
      typeof value.mimeType === "string" &&
      value.mimeType.startsWith("image/") &&
      typeof value.imageBase64 === "string" &&
      value.imageBase64.length > 0,
  );
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
