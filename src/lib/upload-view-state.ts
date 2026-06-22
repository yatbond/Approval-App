import {
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import type { NormalizedRect } from "./document-preview.ts";
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

export type HighlightValueBoxStatus = "ready" | "extracting" | "done" | "error";

export type HighlightValueBox = {
  id: string;
  pageId: string;
  pageNumber: number;
  rect: NormalizedRect;
  value: string;
  confidence?: string;
  evidence?: string;
  status: HighlightValueBoxStatus;
  error?: string;
};

export type HighlightFieldGroup = {
  id: string;
  fieldLabel: string;
  boxes: HighlightValueBox[];
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

export function createHighlightFieldGroup(index: number): HighlightFieldGroup {
  return {
    id: `highlight-field-${index}`,
    fieldLabel: "",
    boxes: [],
  };
}

export function createHighlightValueBox(
  index: number,
  {
    pageId,
    pageNumber,
    rect,
  }: {
    pageId: string;
    pageNumber: number;
    rect: NormalizedRect;
  },
): HighlightValueBox {
  return {
    id: `highlight-value-box-${index}`,
    pageId,
    pageNumber,
    rect,
    value: "",
    status: "ready",
  };
}

export function updateHighlightFieldGroupLabel(
  groups: HighlightFieldGroup[],
  groupId: string,
  fieldLabel: string,
) {
  return groups.map((group) =>
    group.id === groupId ? { ...group, fieldLabel } : group,
  );
}

export function addBoxToHighlightFieldGroup(
  groups: HighlightFieldGroup[],
  groupId: string,
  box: HighlightValueBox,
) {
  return groups.map((group) =>
    group.id === groupId ? { ...group, boxes: [...group.boxes, box] } : group,
  );
}

export function updateHighlightValueBox(
  groups: HighlightFieldGroup[],
  groupId: string,
  boxId: string,
  patch: Partial<HighlightValueBox>,
) {
  return groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          boxes: group.boxes.map((box) =>
            box.id === boxId ? { ...box, ...patch } : box,
          ),
        }
      : group,
  );
}

export function removeHighlightValueBox(
  groups: HighlightFieldGroup[],
  groupId: string,
  boxId: string,
) {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, boxes: group.boxes.filter((box) => box.id !== boxId) }
      : group,
  );
}

export function mergeHighlightedFieldValue(
  currentFields: Record<string, string>,
  fieldLabel: string,
  values: string[],
) {
  const label = fieldLabel.trim();
  const mergedValue = values
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");

  if (!label || !mergedValue) {
    return currentFields;
  }

  return {
    ...currentFields,
    [label]: mergedValue,
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
