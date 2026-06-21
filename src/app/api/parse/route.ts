import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  chooseParserStrategy,
  extractImageFields,
  extractPdfFields,
  extractPdfFieldsWithQwenPageImages,
} from "@/lib/parser";
import type { PdfPageImageInput } from "@/lib/parser";
import type { WorkflowField } from "@/lib/types";

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
    });

    return NextResponse.json(parsed);
  }

  const parsed = pageImages.length
    ? await extractPdfFieldsWithQwenPageImages({
        pageImages,
        fields,
        languageHint,
      })
    : await extractPdfFields({
    pdfBase64: buffer.toString("base64"),
    fileName: file.name || "document.pdf",
    fields,
    languageHint,
      });
  return NextResponse.json(parsed);
}

function parseWorkflowFields(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<WorkflowField>[];
    const fields = parsed.filter(isWorkflowField);
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

function isWorkflowField(value: Partial<WorkflowField>): value is WorkflowField {
  return Boolean(
    value &&
      typeof value.name === "string" &&
      typeof value.label === "string" &&
      typeof value.instructions === "string" &&
      typeof value.type === "string" &&
      typeof value.source === "string" &&
      typeof value.required === "boolean",
  );
}
