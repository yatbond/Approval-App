import type {
  ApprovalAttachment,
} from "./types.ts";
import type {
  HighlightFieldGroup,
} from "./upload-view-state.ts";
import type {
  ParsedWorkspaceFilePayload,
} from "./workspace-file-api.ts";

export const uploadRequestDraftVersion = 1;

export type UploadRequestDraft = {
  version: typeof uploadRequestDraftVersion;
  selectedTemplateId: string;
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
  parsedDocumentId?: string;
  highlightGroups: HighlightFieldGroup[];
  activeHighlightGroupId: string;
  highlightBoxCounter: number;
  savedAt: string;
};

export type UploadRequestDraftStatus = {
  hasDraft: boolean;
  label: string;
};

export function buildUploadRequestDraft({
  selectedTemplateId,
  fileName,
  parseResult,
  editedFields,
  uploadedAttachments,
  parsedDocumentId,
  highlightGroups,
  activeHighlightGroupId,
  highlightBoxCounter,
  savedAt = new Date().toISOString(),
}: Omit<UploadRequestDraft, "version" | "savedAt"> & {
  savedAt?: string;
}): UploadRequestDraft {
  return {
    version: uploadRequestDraftVersion,
    selectedTemplateId,
    fileName,
    parseResult,
    editedFields,
    uploadedAttachments,
    parsedDocumentId,
    highlightGroups,
    activeHighlightGroupId,
    highlightBoxCounter,
    savedAt,
  };
}

export function serializeUploadRequestDraft(draft: UploadRequestDraft) {
  return JSON.stringify(draft);
}

export function parseUploadRequestDraft(value: string): UploadRequestDraft | null {
  try {
    const parsed = JSON.parse(value) as Partial<UploadRequestDraft>;

    if (
      parsed.version !== uploadRequestDraftVersion ||
      typeof parsed.selectedTemplateId !== "string" ||
      typeof parsed.fileName !== "string" ||
      !isStringRecord(parsed.editedFields) ||
      !Array.isArray(parsed.uploadedAttachments) ||
      !Array.isArray(parsed.highlightGroups) ||
      typeof parsed.activeHighlightGroupId !== "string" ||
      typeof parsed.highlightBoxCounter !== "number" ||
      typeof parsed.savedAt !== "string"
    ) {
      return null;
    }

    return {
      version: uploadRequestDraftVersion,
      selectedTemplateId: parsed.selectedTemplateId,
      fileName: parsed.fileName,
      parseResult: isParseResultLike(parsed.parseResult)
        ? parsed.parseResult
        : null,
      editedFields: parsed.editedFields,
      uploadedAttachments: parsed.uploadedAttachments as ApprovalAttachment[],
      parsedDocumentId:
        typeof parsed.parsedDocumentId === "string"
          ? parsed.parsedDocumentId
          : undefined,
      highlightGroups: parsed.highlightGroups as HighlightFieldGroup[],
      activeHighlightGroupId: parsed.activeHighlightGroupId,
      highlightBoxCounter: parsed.highlightBoxCounter,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function createEmptyUploadRequestDraftStatus(
  draft: UploadRequestDraft | null,
): UploadRequestDraftStatus {
  if (!draft || !hasRecoverableDraftWork(draft)) {
    return {
      hasDraft: false,
      label: "No request draft",
    };
  }

  const attachmentCount = draft.uploadedAttachments.length;
  const fieldCount = Object.keys(draft.editedFields).length;
  const attachmentLabel =
    attachmentCount === 1
      ? "1 attachment"
      : `${attachmentCount} attachments`;
  const fieldLabel = fieldCount === 1 ? "1 field" : `${fieldCount} fields`;
  const detail =
    attachmentCount > 0 && fieldCount > 0
      ? `${attachmentLabel}, ${fieldLabel}`
      : attachmentCount > 0
        ? attachmentLabel
        : fieldLabel;

  return {
    hasDraft: true,
    label: `Autosaved ${detail}`,
  };
}

export function clearUploadRequestDraft() {
  return {
    fileName: "",
    parseResult: null as ParsedWorkspaceFilePayload | null,
    editedFields: {} as Record<string, string>,
    uploadedAttachments: [] as ApprovalAttachment[],
    parsedDocumentId: undefined as string | undefined,
    highlightGroups: [] as HighlightFieldGroup[],
    activeHighlightGroupId: "",
    highlightBoxCounter: 1,
  };
}

function hasRecoverableDraftWork(draft: UploadRequestDraft) {
  return (
    draft.uploadedAttachments.length > 0 ||
    Object.keys(draft.editedFields).length > 0 ||
    Boolean(draft.parseResult) ||
    draft.highlightGroups.some((group) => group.fieldLabel || group.boxes.length)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}

function isParseResultLike(value: unknown): value is ParsedWorkspaceFilePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value === null;
  }

  const parsed = value as Partial<ParsedWorkspaceFilePayload>;
  return (
    typeof parsed.strategy === "string" &&
    isStringRecord(parsed.fields) &&
    isStringRecord(parsed.confidence) &&
    Array.isArray(parsed.notes)
  );
}
