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

export type SavedUploadRequestDraft = {
  id: string;
  title: string;
  createdByEmail: string;
  createdByUserId?: string;
  draftKind: "current" | "named";
  savedAt: string;
  draft: UploadRequestDraft;
};

export type SavedUploadRequestDraftAccess = {
  canView: boolean;
  canLoad: boolean;
  canDelete: boolean;
  label: string;
};

export type UploadDraftResumeItem = {
  id: string;
  title: string;
  detail: string;
  fileName: string;
  templateName: string;
  type: "current" | "saved";
  updatedAt: string;
  accessLabel: string;
  canResume: boolean;
  canDelete: boolean;
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

export function buildSavedUploadRequestDraft({
  draft,
  id,
  title,
  createdByEmail,
  createdByUserId,
  draftKind = "named",
  savedAt = new Date().toISOString(),
}: {
  draft: UploadRequestDraft;
  id: string;
  title: string;
  createdByEmail: string;
  createdByUserId?: string;
  draftKind?: SavedUploadRequestDraft["draftKind"];
  savedAt?: string;
}): SavedUploadRequestDraft {
  const cleanTitle =
    draftKind === "current"
      ? "Current autosave"
      : title.trim() ||
        draft.fileName.trim() ||
        Object.keys(draft.editedFields)[0] ||
        "Untitled request draft";

  return {
    id,
    title: cleanTitle,
    createdByEmail,
    ...(createdByUserId ? { createdByUserId } : {}),
    draftKind,
    savedAt,
    draft: {
      ...draft,
      savedAt,
    },
  };
}

export function serializeUploadRequestDraft(draft: UploadRequestDraft) {
  return JSON.stringify(draft);
}

export function serializeUploadRequestDraftList(
  drafts: Array<SavedUploadRequestDraft | unknown>,
) {
  return JSON.stringify(drafts);
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

export function parseUploadRequestDraftList(value: string): SavedUploadRequestDraft[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseSavedUploadRequestDraft)
      .filter((draft): draft is SavedUploadRequestDraft => Boolean(draft));
  } catch {
    return [];
  }
}

export function getCreatorVisibleUploadRequestDrafts({
  drafts,
  activeUserEmail,
  activeUserId,
}: {
  drafts: SavedUploadRequestDraft[];
  activeUserEmail: string;
  activeUserId?: string;
}) {
  return drafts
    .filter((draft) => isUploadRequestDraftCreator({ draft, activeUserEmail, activeUserId }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getNamedSavedUploadRequestDrafts(
  drafts: SavedUploadRequestDraft[],
) {
  return drafts.filter((draft) => draft.draftKind !== "current");
}

export function getCurrentAutosaveUploadRequestDraft(
  drafts: SavedUploadRequestDraft[],
) {
  return drafts
    .filter((draft) => draft.draftKind === "current")
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export function getSavedUploadRequestDraftAccess({
  draft,
  activeUserEmail,
  activeUserId,
}: {
  draft: SavedUploadRequestDraft;
  activeUserEmail: string;
  activeUserId?: string;
}): SavedUploadRequestDraftAccess {
  const isCreator = isUploadRequestDraftCreator({
    draft,
    activeUserEmail,
    activeUserId,
  });

  return {
    canView: isCreator,
    canLoad: isCreator,
    canDelete: isCreator,
    label: isCreator ? "Created by you" : "Creator only",
  };
}

export function getUploadWorkInProgressItems({
  currentDraftStatus,
  savedDrafts,
}: {
  currentDraftStatus: UploadRequestDraftStatus;
  savedDrafts: SavedUploadRequestDraft[];
}) {
  return [
    ...(currentDraftStatus.hasDraft
      ? [
          {
            id: "current-autosave",
            title: "Current autosave",
            detail: currentDraftStatus.label,
            type: "current" as const,
          },
        ]
      : []),
    ...savedDrafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      detail: `${draft.draft.uploadedAttachments.length} attachment(s), ${
        Object.keys(draft.draft.editedFields).length
      } field(s)`,
      type: "saved" as const,
    })),
  ];
}

export function getUploadDraftResumeItems({
  activeUserEmail,
  activeUserId,
  currentDraft,
  currentDraftStatus,
  savedDrafts,
  templates,
}: {
  activeUserEmail?: string;
  activeUserId?: string;
  currentDraft: UploadRequestDraft | null;
  currentDraftStatus: UploadRequestDraftStatus;
  savedDrafts: SavedUploadRequestDraft[];
  templates: { id: string; name: string }[];
}): UploadDraftResumeItem[] {
  const templateNameById = new Map(
    templates.map((template) => [template.id, template.name]),
  );
  const formatTemplateName = (templateId: string) =>
    templateNameById.get(templateId) || "Template unavailable";

  return [
    ...(currentDraftStatus.hasDraft && currentDraft
      ? [
          {
            id: "current-autosave",
            title: "Current autosave",
            detail: currentDraftStatus.label,
            fileName: currentDraft.fileName || "No file attached",
            templateName: formatTemplateName(currentDraft.selectedTemplateId),
            type: "current" as const,
            updatedAt: currentDraft.savedAt,
            accessLabel: "Private autosave",
            canResume: true,
            canDelete: true,
          },
        ]
      : []),
    ...savedDrafts.map((draft) => {
      const access =
        activeUserEmail === undefined
          ? {
              canLoad: true,
              canDelete: true,
              label: "Created by you",
            }
          : getSavedUploadRequestDraftAccess({
              draft,
              activeUserEmail,
              activeUserId,
            });

      return {
        id: draft.id,
        title: draft.title,
        detail: `${draft.draft.uploadedAttachments.length} attachment(s), ${
          Object.keys(draft.draft.editedFields).length
        } field(s)`,
        fileName: draft.draft.fileName || "No file attached",
        templateName: formatTemplateName(draft.draft.selectedTemplateId),
        type: "saved" as const,
        updatedAt: draft.savedAt,
        accessLabel: access.label,
        canResume: access.canLoad,
        canDelete: access.canDelete,
      };
    }),
  ];
}

export function getNextSavedUploadRequestDrafts({
  drafts,
  action,
  draft,
  draftId,
  activeUserEmail,
  activeUserId,
}: {
  drafts: SavedUploadRequestDraft[];
  action: "upsert" | "remove";
  draft?: SavedUploadRequestDraft;
  draftId?: string;
  activeUserEmail: string;
  activeUserId?: string;
}) {
  if (action === "remove") {
    return drafts.filter((item) => {
      if (item.id !== draftId) {
        return true;
      }

      return !isUploadRequestDraftCreator({ draft: item, activeUserEmail, activeUserId });
    });
  }

  if (!draft || !isUploadRequestDraftCreator({ draft, activeUserEmail, activeUserId })) {
    return drafts;
  }

  const withoutExisting = drafts.filter((item) => item.id !== draft.id);
  return [draft, ...withoutExisting];
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

export function shouldRestoreUploadRequestDraftHighlightState({
  restoreToken,
  lastRestoredToken,
}: {
  restoreToken: string;
  lastRestoredToken: string;
}) {
  return Boolean(restoreToken) && restoreToken !== lastRestoredToken;
}

function hasRecoverableDraftWork(draft: UploadRequestDraft) {
  return (
    draft.uploadedAttachments.length > 0 ||
    Object.keys(draft.editedFields).length > 0 ||
    Boolean(draft.parseResult) ||
    draft.highlightGroups.some((group) => group.fieldLabel || group.boxes.length)
  );
}

function parseSavedUploadRequestDraft(value: unknown): SavedUploadRequestDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<SavedUploadRequestDraft>;
  if (
    typeof parsed.id !== "string" ||
    typeof parsed.title !== "string" ||
    typeof parsed.createdByEmail !== "string" ||
    (parsed.createdByUserId !== undefined && typeof parsed.createdByUserId !== "string") ||
    (parsed.draftKind !== undefined &&
      parsed.draftKind !== "current" &&
      parsed.draftKind !== "named") ||
    typeof parsed.savedAt !== "string" ||
    !parsed.draft
  ) {
    return null;
  }

  const draft = parseUploadRequestDraft(JSON.stringify(parsed.draft));
  if (!draft) {
    return null;
  }

  return {
    id: parsed.id,
    title: parsed.title,
    createdByEmail: parsed.createdByEmail,
    ...(parsed.createdByUserId ? { createdByUserId: parsed.createdByUserId } : {}),
    draftKind: parsed.draftKind || "named",
    savedAt: parsed.savedAt,
    draft,
  };
}

function isUploadRequestDraftCreator({
  draft,
  activeUserEmail,
  activeUserId,
}: {
  draft: SavedUploadRequestDraft;
  activeUserEmail: string;
  activeUserId?: string;
}) {
  const emailMatches =
    draft.createdByEmail.trim().toLowerCase() === activeUserEmail.trim().toLowerCase();
  const idMatches =
    Boolean(activeUserId) && draft.createdByUserId === activeUserId;

  return emailMatches || idMatches;
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
