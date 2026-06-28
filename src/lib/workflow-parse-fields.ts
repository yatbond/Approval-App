import type { WorkflowField } from "./types.ts";

const validSources = new Set(["ai", "ocr", "excel", "manual"]);
const validTypes = new Set(["text", "number", "date", "currency", "table"]);

export function normalizeWorkflowFieldsForParsing(value: unknown): WorkflowField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isPlainRecord)
    .map((field, index) => normalizeWorkflowField(field, index))
    .filter((field): field is WorkflowField => Boolean(field));
}

function normalizeWorkflowField(
  value: Record<string, unknown>,
  index: number,
): WorkflowField | null {
  const rawName = typeof value.name === "string" ? value.name.trim() : "";
  const rawLabel = typeof value.label === "string" ? value.label.trim() : "";
  const label = rawLabel || rawName;
  const name = rawName || slugify(label) || `field_${index + 1}`;

  if (!label && !name) {
    return null;
  }

  const instructions =
    typeof value.instructions === "string" && value.instructions.trim()
      ? value.instructions.trim()
      : `Extract ${label || name}.`;
  const source =
    typeof value.source === "string" && validSources.has(value.source)
      ? (value.source as WorkflowField["source"])
      : "ai";
  const type =
    typeof value.type === "string" && validTypes.has(value.type)
      ? (value.type as WorkflowField["type"])
      : "text";
  const field: WorkflowField = {
    name,
    label: label || name,
    type,
    required: typeof value.required === "boolean" ? value.required : false,
    source,
    instructions,
  };

  if (typeof value.documentId === "string" && value.documentId.trim()) {
    field.documentId = value.documentId.trim();
  }

  return field;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
