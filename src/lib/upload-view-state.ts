import {
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import { isManualFormRequirement } from "./workflow-documents.ts";
import type { NormalizedRect } from "./document-preview.ts";
import type {
  ApprovalAttachment,
  ExtractedFieldSuggestion,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowGraphNode,
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
  activeUserEmail,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  uploadedAttachments: ApprovalAttachment[];
  activeUserEmail?: string;
}) {
  const requestTemplates = workflowTemplates.filter(
    (template) => template.isDraft !== true && template.isArchived !== true,
  );
  const selectedTemplate =
    requestTemplates.find((template) => template.id === selectedTemplateId) ||
    requestTemplates[0];
  const collaborativeRequirements = selectedTemplate
    ? getCollaborativeSubmissionRequirements({
        template: selectedTemplate,
        activeUserEmail,
      })
    : emptyCollaborativeSubmissionRequirements();
  const uploadDocuments =
    collaborativeRequirements.assignedUploadDocuments.length ||
    collaborativeRequirements.sharedUploadDocuments.length
      ? [
          ...collaborativeRequirements.assignedUploadDocuments,
          ...collaborativeRequirements.sharedUploadDocuments,
        ]
      : [];
  const manualFormDocuments =
    collaborativeRequirements.assignedManualFormDocuments.length ||
    collaborativeRequirements.sharedManualFormDocuments.length
      ? [
          ...collaborativeRequirements.assignedManualFormDocuments,
          ...collaborativeRequirements.sharedManualFormDocuments,
        ]
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
    manualFormDocuments,
    assignedUploadDocuments: collaborativeRequirements.assignedUploadDocuments,
    sharedUploadDocuments: collaborativeRequirements.sharedUploadDocuments,
    assignedManualFormDocuments:
      collaborativeRequirements.assignedManualFormDocuments,
    sharedManualFormDocuments: collaborativeRequirements.sharedManualFormDocuments,
    sharedFulfillmentEnabled: collaborativeRequirements.sharedFulfillmentEnabled,
    uploadedDocumentIds,
    missingRequiredDocuments,
  };
}

function getCollaborativeSubmissionRequirements({
  template,
  activeUserEmail,
}: {
  template: WorkflowTemplate;
  activeUserEmail?: string;
}) {
  const defaultRequirements = getSubmissionDocumentRequirements(template);
  const submitNodes = (template.graph?.nodes || []).filter(
    (node) => node.kind === "submit_request",
  );
  const normalizedActiveEmail = normalizeEmail(activeUserEmail);
  const assignedSubmitNodes = normalizedActiveEmail
    ? submitNodes.filter(
        (node) => normalizeEmail(node.assigneeEmail) === normalizedActiveEmail,
      )
    : [];

  if (!assignedSubmitNodes.length) {
    return splitSubmissionRequirements({
      assignedDocuments: defaultRequirements,
      sharedDocuments: [],
      sharedFulfillmentEnabled: false,
    });
  }

  const sharedFulfillmentEnabled = assignedSubmitNodes.some(
    (node) => node.allowSharedFulfillment === true,
  );
  const assignedDocumentIds = documentIdsForNodes(assignedSubmitNodes);
  const assignedDocuments = documentsForIds(template.documents, assignedDocumentIds);
  const sharedDocuments = sharedFulfillmentEnabled
    ? getSharedSubmitBoxDocuments({
        documents: template.documents,
        submitNodes,
        assignedNodes: assignedSubmitNodes,
      })
    : [];

  return splitSubmissionRequirements({
    assignedDocuments,
    sharedDocuments,
    sharedFulfillmentEnabled,
  });
}

function splitSubmissionRequirements({
  assignedDocuments,
  sharedDocuments,
  sharedFulfillmentEnabled,
}: {
  assignedDocuments: WorkflowDocumentRequirement[];
  sharedDocuments: WorkflowDocumentRequirement[];
  sharedFulfillmentEnabled: boolean;
}) {
  return {
    assignedUploadDocuments: assignedDocuments.filter(
      (document) => !isManualFormRequirement(document),
    ),
    sharedUploadDocuments: sharedDocuments.filter(
      (document) => !isManualFormRequirement(document),
    ),
    assignedManualFormDocuments: assignedDocuments.filter(isManualFormRequirement),
    sharedManualFormDocuments: sharedDocuments.filter(isManualFormRequirement),
    sharedFulfillmentEnabled,
  };
}

function emptyCollaborativeSubmissionRequirements() {
  return splitSubmissionRequirements({
    assignedDocuments: [],
    sharedDocuments: [],
    sharedFulfillmentEnabled: false,
  });
}

function getSharedSubmitBoxDocuments({
  documents,
  submitNodes,
  assignedNodes,
}: {
  documents: WorkflowDocumentRequirement[];
  submitNodes: WorkflowGraphNode[];
  assignedNodes: WorkflowGraphNode[];
}) {
  const assignedNodeIds = new Set(assignedNodes.map((node) => node.id));
  const assignedDocumentIds = documentIdsForNodes(assignedNodes);
  const otherDocumentIds = documentIdsForNodes(
    submitNodes.filter((node) => !assignedNodeIds.has(node.id)),
  );
  const sharedDocumentIds = otherDocumentIds.filter(
    (documentId) => !assignedDocumentIds.includes(documentId),
  );

  return documentsForIds(documents, sharedDocumentIds);
}

function documentIdsForNodes(nodes: WorkflowGraphNode[]) {
  return Array.from(
    new Set(nodes.flatMap((node) => node.documentIds || []).filter(Boolean)),
  );
}

function documentsForIds(
  documents: WorkflowDocumentRequirement[],
  documentIds: string[],
) {
  const idSet = new Set(documentIds);
  return documents.filter((document) => idSet.has(document.id));
}

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
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

export function getExtractionFieldSourceLabel({
  label,
  parseFields,
  highlightGroups,
}: {
  label: string;
  parseFields: Record<string, string>;
  highlightGroups: HighlightFieldGroup[];
}) {
  const normalizedLabel = label.trim().toLowerCase();
  const parsedLabels = new Set(
    Object.keys(parseFields).map((fieldLabel) => fieldLabel.trim().toLowerCase()),
  );
  if (parsedLabels.has(normalizedLabel)) {
    return "AI/OCR";
  }

  const highlightedLabels = new Set(
    highlightGroups
      .map((group) => group.fieldLabel.trim().toLowerCase())
      .filter(Boolean),
  );
  if (highlightedLabels.has(normalizedLabel)) {
    return "Boxed field";
  }

  return "Manual";
}

export function getUploadSubmissionMessageTone(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return "success" as const;
  }

  if (
    normalized.startsWith("missing ") ||
    normalized.startsWith("review ") ||
    normalized.startsWith("publish ") ||
    normalized.startsWith("archived ")
  ) {
    return "warning" as const;
  }

  if (
    normalized.startsWith("unable ") ||
    normalized.startsWith("failed ") ||
    normalized.includes(" error")
  ) {
    return "error" as const;
  }

  return "success" as const;
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
