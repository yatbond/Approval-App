import type {
  DocumentFormat,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";

export type TemplateFieldDraft = {
  label: string;
  instructions: string;
};

export type TemplateDocumentDraft = {
  documentType: string;
  format: DocumentFormat;
  required: boolean;
  fields: TemplateFieldDraft[];
};

export type TemplateStepDraft = {
  approverName: string;
  approverEmail: string;
  dueInHours: number;
  escalationName: string;
  escalationEmail: string;
  condition: string;
};

export type WorkflowTemplateDraft = {
  name: string;
  business: string;
  department: string;
  documents: TemplateDocumentDraft[];
  steps?: TemplateStepDraft[];
  approverName?: string;
  approverEmail?: string;
  dueInHours?: number;
  escalationName?: string;
  escalationEmail?: string;
  condition?: string;
};

export function createWorkflowTemplateFromDraft(
  draft: WorkflowTemplateDraft,
): WorkflowTemplate {
  const documents = draft.documents.map((document, documentIndex) =>
    normalizeDocument(document, documentIndex),
  );
  const fields = documents.flatMap((document) => document.fields);
  const department = cleanValue(draft.department, "General department");
  const steps = normalizeSteps(draft, department);

  return {
    id: `template-${Date.now()}`,
    name: cleanValue(draft.name, "Untitled workflow"),
    business: cleanValue(draft.business, "General business"),
    department,
    documentTypes: documents.map((document) => document.documentType),
    documents,
    languages: ["English", "Traditional Chinese", "Simplified Chinese"],
    fields,
    steps,
  };
}

function normalizeSteps(draft: WorkflowTemplateDraft, department: string) {
  const stepDrafts =
    draft.steps !== undefined
      ? draft.steps
      : [
          {
            approverName: draft.approverName || "",
            approverEmail: draft.approverEmail || "",
            dueInHours: draft.dueInHours || 48,
            escalationName: draft.escalationName || "",
            escalationEmail: draft.escalationEmail || "",
            condition: draft.condition || "Always",
          },
        ];

  return stepDrafts.map((step, index) => {
    const approverName = cleanValue(step.approverName, "Approver");
    const escalationName = cleanValue(step.escalationName, "Escalation owner");

    return {
      name: `${department} approval ${index + 1}`,
      role: approverName,
      approverName,
      approverEmail: step.approverEmail.trim(),
      department,
      dueInHours: Number.isFinite(step.dueInHours) ? step.dueInHours : 48,
      escalationRole: escalationName,
      escalationName,
      escalationEmail: step.escalationEmail.trim(),
      condition: cleanValue(step.condition, "Always"),
    };
  });
}
function normalizeDocument(
  draft: TemplateDocumentDraft,
  documentIndex: number,
): WorkflowDocumentRequirement {
  const id = `document-${documentIndex + 1}`;
  const documentType = cleanValue(draft.documentType, `Document ${documentIndex + 1}`);
  const fields = draft.fields
    .filter((field) => field.label.trim())
    .map((field, fieldIndex): WorkflowField => ({
      name: `${slugify(documentType)}_${slugify(field.label) || `field_${fieldIndex + 1}`}`,
      label: field.label.trim(),
      type: "text",
      required: draft.required,
      source: fieldSourceForFormat(draft.format),
      instructions: field.instructions.trim() || `Extract ${field.label.trim()}.`,
      documentId: id,
    }));

  return {
    id,
    documentType,
    format: draft.format,
    required: draft.required,
    fields,
  };
}

function cleanValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function fieldSourceForFormat(format: DocumentFormat): WorkflowField["source"] {
  if (format === "excel_csv") {
    return "excel";
  }

  if (format === "pdf") {
    return "ocr";
  }

  if (format === "image") {
    return "ai";
  }

  return "manual";
}
