import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  chooseParserStrategy,
  extractImageFields,
} from "@/lib/parser";
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
      fields: fallbackFields,
      languageHint,
    });

    return NextResponse.json(parsed);
  }

  return NextResponse.json({
    strategy,
    fields: {},
    confidence: {},
    notes: [
      "PDF OCR is scaffolded but not connected yet. Recommended next step: add a managed OCR provider or Supabase Edge Function worker.",
    ],
  });
}
