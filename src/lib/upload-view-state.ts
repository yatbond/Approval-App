import {
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import type {
  ApprovalAttachment,
  ExtractedFieldSuggestion,
  WorkflowField,
  WorkflowTemplate,
} from "./types.ts";

export type AdHocFieldDraft = {
  id: string;
  label: string;
  instructions: string;
};

export function getUploadViewState({
  workflowTemplates,
  selectedTemplateId,
  uploadedAttachments,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  uploadedAttachments: ApprovalAttachment[];
}) {
  const requestTemplates = workflowTemplates.filter(
    (template) => template.isDraft !== true && template.isArchived !== true,
  );
  const selectedTemplate =
    requestTemplates.find((template) => template.id === selectedTemplateId) ||
    requestTemplates[0];
  const uploadDocuments = selectedTemplate
    ? getSubmissionDocumentRequirements(selectedTemplate)
    : [];
  const uploadedDocumentIds = new Set(
    uploadedAttachments
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );
  const missingRequiredDocuments = selectedTemplate
    ? getMissingRequiredSubmissionDocuments(selectedTemplate, uploadedAttachments)
    : [];

  return {
    requestTemplates,
    selectedTemplate,
    uploadDocuments,
    uploadedDocumentIds,
    missingRequiredDocuments,
  };
}

export function createAdHocFieldDraft(index: number): AdHocFieldDraft {
  return {
    id: `ad-hoc-field-${index}`,
    label: "",
    instructions: "",
  };
}

export function buildAdHocExtractionFields(
  drafts: AdHocFieldDraft[],
): WorkflowField[] {
  return drafts
    .map((draft) => ({
      label: draft.label.trim(),
      instructions: draft.instructions.trim(),
    }))
    .filter((draft) => draft.label)
    .map((draft) => ({
      name: `ad_hoc_${slugify(draft.label)}`,
      label: draft.label,
      type: "text" as const,
      required: false,
      source: "ai" as const,
      instructions: draft.instructions || `Extract ${draft.label}.`,
    }));
}

export function createFieldDraftFromSuggestion(
  suggestion: ExtractedFieldSuggestion,
  index: number,
): AdHocFieldDraft {
  return {
    id: `suggested-field-${index}`,
    label: suggestion.label,
    instructions: suggestion.instructions || `Extract ${suggestion.label}.`,
  };
}

export function createHighlightedExtractionField(
  label: string,
  index: number,
): WorkflowField {
  const trimmedLabel = label.trim();
  return {
    name: `highlight_${slugify(trimmedLabel)}_${index}`,
    label: trimmedLabel,
    type: "text",
    required: false,
    source: "ai",
    instructions: `Extract ${trimmedLabel} from the highlighted document region.`,
  };
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}
