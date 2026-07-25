import type {
  ExtractionTrainingExample,
  WorkflowField,
  WorkflowTemplate,
} from "./types.ts";

export function createWorkflowFieldFromRecognition({
  documentId,
  label,
  instructions,
  existingFields = [],
}: {
  documentId: string;
  label: string;
  instructions?: string;
  existingFields?: WorkflowField[];
}): WorkflowField {
  const cleanLabel = label.trim() || "Field";
  const baseName = slugify(cleanLabel) || "field";
  const usedNames = new Set(existingFields.map((field) => field.name));
  let name = baseName;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${baseName}_${suffix}`;
    suffix += 1;
  }

  return {
    name,
    label: cleanLabel,
    type: "text",
    required: true,
    source: "ai",
    instructions: instructions?.trim() || `Extract ${cleanLabel} from this document.`,
    documentId,
  };
}

export function buildExtractionTrainingExamples({
  template,
  documentId,
  parseFields,
  correctedFields,
  evidence = {},
  sourceFileName = "",
  actorEmail,
  now = new Date(),
}: {
  template: WorkflowTemplate;
  documentId?: string;
  parseFields: Record<string, string>;
  correctedFields: Record<string, string>;
  evidence?: Record<string, string>;
  sourceFileName?: string;
  actorEmail: string;
  now?: Date;
}): ExtractionTrainingExample[] {
  const document = documentId
    ? template.documents.find((item) => item.id === documentId)
    : undefined;
  const createdAt = now.toISOString();

  return Object.entries(correctedFields)
    .map(([fieldLabel, correctedValue]) => {
      const originalValue = parseFields[fieldLabel] || "";
      return {
        fieldLabel,
        originalValue,
        correctedValue,
      };
    })
    .filter(({ correctedValue }) => correctedValue.trim())
    .filter(({ originalValue, correctedValue }) => originalValue !== correctedValue)
    .map(({ fieldLabel, originalValue, correctedValue }, index) => ({
      id: `extraction-example-${now.getTime()}-${index + 1}`,
      templateId: template.id,
      documentId,
      documentType: document?.documentType,
      fieldLabel,
      originalValue,
      correctedValue,
      evidence: evidence[fieldLabel] || "",
      sourceFileName,
      createdByEmail: actorEmail,
      createdAt,
    }));
}

export function appendExtractionExamplesToTemplate({
  template,
  examples,
  limit = 50,
}: {
  template: WorkflowTemplate;
  examples: ExtractionTrainingExample[];
  limit?: number;
}): WorkflowTemplate {
  if (!examples.length) {
    return template;
  }

  const extractionExamples = [
    ...examples,
    ...(template.extractionExamples || []),
  ].slice(0, limit);

  return {
    ...template,
    extractionExamples,
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
