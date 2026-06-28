import OpenAI from "openai";
import type {
  ExtractionTrainingExample,
  ExtractedFieldSuggestion,
  ParserStrategy,
  WorkflowField,
} from "@/lib/types";

const confidenceLevels = ["high", "medium", "low"] as const;

export type ParsedDocumentDraft = {
  strategy: ParserStrategy;
  fields: Record<string, string>;
  confidence: Record<string, "high" | "medium" | "low">;
  evidence: Record<string, string>;
  suggestedFields: ExtractedFieldSuggestion[];
  notes: string[];
};

export type PdfPageImageInput = {
  pageNumber: number;
  mimeType: string;
  imageBase64: string;
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
  const fileName = file.name.toLowerCase();
  if (file.type.includes("pdf") || fileName.endsWith(".pdf")) {
    return "pdf-ocr";
  }

  if (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".csv")
  ) {
    return "excel-table";
  }

  return "image-ai";
}

export function buildExtractionPrompt(
  fields: WorkflowField[],
  languageHint: string,
  examples: ExtractionTrainingExample[] = [],
) {
  const requestedFields = fields
    .map((field) => `- ${field.label}: ${field.instructions}`)
    .join("\n");
  const correctedExamples = examples
    .slice(0, 8)
    .map((example) =>
      [
        `- ${example.fieldLabel}`,
        `  Original: ${example.originalValue || "(blank)"}`,
        `  Corrected: ${example.correctedValue}`,
        example.evidence ? `  Evidence: ${example.evidence}` : "",
        formatExampleAnchor(example),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    "Extract approval workflow data from the uploaded business document.",
    "Return JSON only in this shape:",
    '{"fields":{"Field label":{"value":"concise extracted value","confidence":"high|medium|low","evidence":"short exact text or visual cue used"}},"suggestedFields":[{"label":"extra useful field","value":"concise value","confidence":"high|medium|low","evidence":"short exact text or visual cue used","instructions":"how to extract this field next time"}]}',
    "If a value is uncertain, use an empty string rather than inventing an answer.",
    "Use high confidence only when the value is clearly visible and evidence is provided.",
    "Use medium confidence when the value is likely but needs human review.",
    "Use low confidence when the value is blank, partially visible, inferred, or ambiguous.",
    "Put only requested fields under fields. Put optional extra candidates under suggestedFields.",
    "Limit suggestedFields to useful business fields visible in the document and avoid duplicates of requested fields.",
    "If a prior example includes a soft anchor, use it as a nearby region hint only. Documents may be rotated, shifted, scanned, or photocopied, so also rely on labels, nearby text, and visual context.",
    `Document languages may include: ${languageHint}.`,
    "Requested fields:",
    requestedFields,
    correctedExamples
      ? ["Prior corrected examples:", correctedExamples].join("\n")
      : "",
  ].join("\n");
}

function formatExampleAnchor(example: ExtractionTrainingExample) {
  if (!example.anchor) {
    return "";
  }

  const { pageNumber, rect, nearbyText } = example.anchor;
  const percent = {
    x: Math.round(rect.x * 100),
    y: Math.round(rect.y * 100),
    width: Math.round(rect.width * 100),
    height: Math.round(rect.height * 100),
  };

  return [
    `  Soft anchor: page ${pageNumber}, nearby region x ${percent.x}%, y ${percent.y}%, width ${percent.width}%, height ${percent.height}%.`,
    nearbyText ? `  Nearby text: ${nearbyText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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

function parseExtractionJson(text: string): {
  fields: Record<string, string>;
  confidence: Record<string, "high" | "medium" | "low">;
  evidence: Record<string, string>;
  suggestedFields: ExtractedFieldSuggestion[];
  success: boolean;
} {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fenced?.[1] || trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      success: false,
    };
  }

  if (!isPlainRecord(parsed)) {
    return {
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      success: false,
    };
  }

  const source = isPlainRecord(parsed.fields) ? parsed.fields : parsed;
  const fields: Record<string, string> = {};
  const confidence: Record<string, "high" | "medium" | "low"> = {};
  const evidenceByField: Record<string, string> = {};

  for (const [label, value] of Object.entries(source)) {
    if (typeof value === "string") {
      fields[label] = value;
      continue;
    }

    if (!isPlainRecord(value)) {
      continue;
    }

    const fieldValue =
      typeof value.value === "string" ? value.value : String(value.value || "");
    const evidence = typeof value.evidence === "string" ? value.evidence.trim() : "";
    fields[label] = fieldValue;
    confidence[label] = normalizeConfidence(value.confidence, fieldValue, evidence);
    if (evidence) {
      evidenceByField[label] = evidence;
    }
  }

  return {
    fields,
    confidence,
    evidence: evidenceByField,
    suggestedFields: parseSuggestedFields(parsed.suggestedFields),
    success: Object.keys(fields).length > 0,
  };
}

function parseSuggestedFields(value: unknown): ExtractedFieldSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isPlainRecord)
    .map((item, index) => {
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const fieldValue =
        typeof item.value === "string" ? item.value.trim() : String(item.value || "");
      const evidence =
        typeof item.evidence === "string" ? item.evidence.trim() : "";
      const confidence = normalizeConfidence(
        item.confidence,
        fieldValue,
        evidence,
      );
      const instructions =
        typeof item.instructions === "string" && item.instructions.trim()
          ? item.instructions.trim()
          : `Extract ${label}.`;

      return {
        name: `suggested_${slugify(label) || `field_${index + 1}`}`,
        label,
        value: fieldValue,
        confidence,
        evidence,
        instructions,
      };
    })
    .filter((item) => item.label && item.value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeConfidence(
  value: unknown,
  fieldValue: string,
  evidence: string,
): "high" | "medium" | "low" {
  if (!fieldValue.trim()) {
    return "low";
  }

  const normalized =
    typeof value === "string" && confidenceLevels.includes(value as never)
      ? (value as "high" | "medium" | "low")
      : "medium";

  if (normalized === "high" && !evidence) {
    return "medium";
  }

  return normalized;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function extractImageFields(params: {
  imageBase64: string;
  mimeType: string;
  fields: WorkflowField[];
  languageHint: string;
  examples?: ExtractionTrainingExample[];
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
  examples?: ExtractionTrainingExample[];
}): Promise<ParsedDocumentDraft> {
  return extractPdfFieldsWithOpenRouter(params);
}

export async function extractImageFieldsWithOpenRouter(params: {
  imageBase64: string;
  mimeType: string;
  fields: WorkflowField[];
  languageHint: string;
  examples?: ExtractionTrainingExample[];
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      strategy: "image-ai",
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      notes: ["OPENROUTER_API_KEY is not configured yet."],
    };
  }

  const prompt = buildExtractionPrompt(
    params.fields,
    params.languageHint,
    params.examples,
  );
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
      evidence: {},
      suggestedFields: [],
      notes: [
        payload.error?.message ||
          `OpenRouter request failed with status ${response.status}.`,
      ],
    };
  }

  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = parseExtractionJson(content);

  return {
    strategy: "image-ai",
    fields: parsed.success ? parsed.fields : {},
    confidence: parsed.success ? parsed.confidence : {},
    evidence: parsed.success ? parsed.evidence : {},
    suggestedFields: parsed.success ? parsed.suggestedFields : [],
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
  examples?: ExtractionTrainingExample[];
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      strategy: "pdf-ocr",
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      notes: ["OPENROUTER_API_KEY is not configured yet."],
    };
  }

  const prompt = buildExtractionPrompt(
    params.fields,
    params.languageHint,
    params.examples,
  );
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
      evidence: {},
      suggestedFields: [],
      notes: [
        payload.error?.message ||
          `OpenRouter request failed with status ${response.status}.`,
      ],
    };
  }

  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = parseExtractionJson(content);

  return {
    strategy: "pdf-ocr",
    fields: parsed.success ? parsed.fields : {},
    confidence: parsed.success ? parsed.confidence : {},
    evidence: parsed.success ? parsed.evidence : {},
    suggestedFields: parsed.success ? parsed.suggestedFields : [],
    notes: parsed.success
      ? [
          `Parsed PDF with OpenRouter model ${
            process.env.OPENROUTER_MODEL || "~openai/gpt-latest"
          } using ${pdfEngine}.`,
        ]
      : ["OpenRouter PDF output could not be parsed as field JSON."],
  };
}

export async function extractPdfFieldsWithQwenPageImages(params: {
  pageImages: PdfPageImageInput[];
  fields: WorkflowField[];
  languageHint: string;
  examples?: ExtractionTrainingExample[];
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      strategy: "pdf-ocr",
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      notes: ["OPENROUTER_API_KEY is not configured yet."],
    };
  }

  if (!params.pageImages.length) {
    return {
      strategy: "pdf-ocr",
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      notes: ["No rendered PDF page images were supplied for Qwen visual OCR."],
    };
  }

  const model =
    process.env.OPENROUTER_VISION_OCR_MODEL || "qwen/qwen3-vl-8b-instruct";
  const prompt = [
    buildExtractionPrompt(params.fields, params.languageHint, params.examples),
    `The PDF was rendered into ${params.pageImages.length} page image(s).`,
    "Read the page images directly and extract only the requested fields.",
  ].join("\n\n");

  const response = await fetchOpenRouterChatCompletion({
    apiKey,
    body: {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...params.pageImages.map((page) => ({
              type: "image_url",
              image_url: {
                url: `data:${page.mimeType};base64,${page.imageBase64}`,
              },
            })),
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
      evidence: {},
      suggestedFields: [],
      notes: [
        payload.error?.message ||
          `OpenRouter request failed with status ${response.status}.`,
      ],
    };
  }

  const content = payload.choices?.[0]?.message?.content || "{}";
  const parsed = parseExtractionJson(content);

  return {
    strategy: "pdf-ocr",
    fields: parsed.success ? parsed.fields : {},
    confidence: parsed.success ? parsed.confidence : {},
    evidence: parsed.success ? parsed.evidence : {},
    suggestedFields: parsed.success ? parsed.suggestedFields : [],
    notes: parsed.success
      ? [`Parsed rendered PDF pages with OpenRouter model ${model}.`]
      : ["OpenRouter Qwen page-image output could not be parsed as field JSON."],
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
  examples?: ExtractionTrainingExample[];
}): Promise<ParsedDocumentDraft> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      strategy: "image-ai",
      fields: {},
      confidence: {},
      evidence: {},
      suggestedFields: [],
      notes: ["OPENAI_API_KEY is not configured yet."],
    };
  }

  const client = new OpenAI({ apiKey });
  const prompt = buildExtractionPrompt(
    params.fields,
    params.languageHint,
    params.examples,
  );

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

  const parsed = parseExtractionJson(response.output_text || "{}");

  return {
    strategy: "image-ai",
    fields: parsed.success ? parsed.fields : {},
    confidence: parsed.success ? parsed.confidence : {},
    evidence: parsed.success ? parsed.evidence : {},
    suggestedFields: parsed.success ? parsed.suggestedFields : [],
    notes: parsed.success
      ? [`Parsed with OpenAI model ${process.env.OPENAI_MODEL || "gpt-5.4-mini"}.`]
      : ["AI output could not be parsed as field JSON."],
  };
}
