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

type OpenRouterChatCompletion = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
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

function parseFieldJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fenced?.[1] || trimmed;

  try {
    return extractedFieldSchema.safeParse(JSON.parse(jsonText));
  } catch {
    return extractedFieldSchema.safeParse({});
  }
}

export async function extractImageFields(params: {
  imageBase64: string;
  mimeType: string;
  fields: WorkflowField[];
  languageHint: string;
}): Promise<ParsedDocumentDraft> {
  if (process.env.AI_PROVIDER === "openai") {
    return extractImageFieldsWithOpenAI(params);
  }

  return extractImageFieldsWithOpenRouter(params);
}

export async function extractPdfFields(params: {
  pdfBase64: string;
  fileName: string;
  fields: WorkflowField[];
  languageHint: string;
}): Promise<ParsedDocumentDraft> {
  return extractPdfFieldsWithOpenRouter(params);
}

export async function extractImageFieldsWithOpenRouter(params: {
  imageBase64: string;
  mimeType: string;
  fields: WorkflowField[];
  languageHint: string;
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      strategy: "image-ai",
      fields: {},
      confidence: {},
      notes: ["OPENROUTER_API_KEY is not configured yet."],
    };
  }

  const prompt = buildExtractionPrompt(params.fields, params.languageHint);
  const response = await fetchOpenRouterChatCompletion({
    apiKey,
    body: {
      model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${params.mimeType};base64,${params.imageBase64}`,
              },
            },
          ],
        },
      ],
    },
  });

  const payload = (await response.json()) as OpenRouterChatCompletion;

  if (!response.ok) {
    return {
      strategy: "image-ai",
      fields: {},
      confidence: {},
      notes: [
        payload.error?.message ||
          `OpenRouter request failed with status ${response.status}.`,
      ],
    };
  }

  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = parseFieldJson(content);

  return {
    strategy: "image-ai",
    fields: parsed.success ? parsed.data : {},
    confidence: {},
    notes: parsed.success
      ? [`Parsed with OpenRouter model ${process.env.OPENROUTER_MODEL || "~openai/gpt-latest"}.`]
      : ["OpenRouter output could not be parsed as field JSON."],
  };
}

export async function extractPdfFieldsWithOpenRouter(params: {
  pdfBase64: string;
  fileName: string;
  fields: WorkflowField[];
  languageHint: string;
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      strategy: "pdf-ocr",
      fields: {},
      confidence: {},
      notes: ["OPENROUTER_API_KEY is not configured yet."],
    };
  }

  const prompt = buildExtractionPrompt(params.fields, params.languageHint);
  const pdfEngine = process.env.OPENROUTER_PDF_ENGINE || "mistral-ocr";
  const response = await fetchOpenRouterChatCompletion({
    apiKey,
    body: {
      model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest",
      plugins: [
        {
          id: "file-parser",
          pdf: { engine: pdfEngine },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "file",
              file: {
                filename: params.fileName || "document.pdf",
                file_data: `data:application/pdf;base64,${params.pdfBase64}`,
              },
            },
          ],
        },
      ],
    },
  });

  const payload = (await response.json()) as OpenRouterChatCompletion;

  if (!response.ok) {
    return {
      strategy: "pdf-ocr",
      fields: {},
      confidence: {},
      notes: [
        payload.error?.message ||
          `OpenRouter request failed with status ${response.status}.`,
      ],
    };
  }

  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = parseFieldJson(content);

  return {
    strategy: "pdf-ocr",
    fields: parsed.success ? parsed.data : {},
    confidence: {},
    notes: parsed.success
      ? [
          `Parsed PDF with OpenRouter model ${
            process.env.OPENROUTER_MODEL || "~openai/gpt-latest"
          } using ${pdfEngine}.`,
        ]
      : ["OpenRouter PDF output could not be parsed as field JSON."],
  };
}

function fetchOpenRouterChatCompletion({
  apiKey,
  body,
}: {
  apiKey: string;
  body: Record<string, unknown>;
}) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "https://approval-app-three.vercel.app",
      "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE || "Approval App",
    },
    body: JSON.stringify(body),
  });
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

  const parsed = parseFieldJson(response.output_text || "{}");

  return {
    strategy: "image-ai",
    fields: parsed.success ? parsed.data : {},
    confidence: {},
    notes: parsed.success
      ? [`Parsed with OpenAI model ${process.env.OPENAI_MODEL || "gpt-5.4-mini"}.`]
      : ["AI output could not be parsed as field JSON."],
  };
}
