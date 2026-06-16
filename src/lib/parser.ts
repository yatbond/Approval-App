import OpenAI from "openai";
import { z } from "zod";
import type { ParserStrategy, WorkflowField } from "@/lib/types";

const extractedFieldSchema = z.record(z.string(), z.string());

export type ParsedDocumentDraft = {
  strategy: ParserStrategy;
  fields: Record<string, string>;
  confidence: Record<string, "high" | "medium" | "low">;
  notes: string[];
};

export function chooseParserStrategy(file: File): ParserStrategy {
  if (file.type.includes("pdf")) {
    return "pdf-ocr";
  }

  if (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls") ||
    file.name.endsWith(".csv")
  ) {
    return "excel-table";
  }

  return "image-ai";
}

export function buildExtractionPrompt(fields: WorkflowField[], languageHint: string) {
  const requestedFields = fields
    .map((field) => `- ${field.label}: ${field.instructions}`)
    .join("\n");

  return [
    "Extract approval workflow data from the uploaded business document.",
    "Return a valid JSON object whose keys are field labels and whose values are concise strings.",
    "If a value is uncertain, use an empty string rather than inventing an answer.",
    `Document languages may include: ${languageHint}.`,
    "Requested fields:",
    requestedFields,
  ].join("\n");
}

export function normalizeUserCorrections(
  aiFields: Record<string, string>,
  correctedFields: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(correctedFields).filter(
      ([key, value]) => aiFields[key] !== value,
    ),
  );
}

export async function extractImageFieldsWithOpenAI(params: {
  imageBase64: string;
  mimeType: string;
  fields: WorkflowField[];
  languageHint: string;
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      strategy: "image-ai",
      fields: {},
      confidence: {},
      notes: ["OPENAI_API_KEY is not configured yet."],
    };
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildExtractionPrompt(params.fields, params.languageHint);

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:${params.mimeType};base64,${params.imageBase64}`,
            detail: "auto",
          },
        ],
      },
    ],
  });

  const parsed = extractedFieldSchema.safeParse(
    JSON.parse(response.output_text || "{}"),
  );

  return {
    strategy: "image-ai",
    fields: parsed.success ? parsed.data : {},
    confidence: {},
    notes: parsed.success ? [] : ["AI output could not be parsed as field JSON."],
  };
}
