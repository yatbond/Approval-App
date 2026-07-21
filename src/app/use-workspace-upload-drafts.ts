"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DocumentPreviewPage } from "@/lib/document-preview";
import {
  getDraftAttachmentRemoveConfirmation,
  getDraftDeleteConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import {
  buildSavedUploadRequestDraft,
  buildUploadRequestDraft,
  clearUploadRequestDraft,
  createEmptyUploadRequestDraftStatus,
  getCurrentAutosaveUploadRequestDraft,
  getCreatorVisibleUploadRequestDrafts,
  getNamedSavedUploadRequestDrafts,
  getNextSavedUploadRequestDrafts,
  getUploadAutosaveIdentity,
  getUploadDraftResumeItems,
  parseUploadRequestDraft,
  parseUploadRequestDraftList,
  serializeUploadRequestDraft,
  serializeUploadRequestDraftList,
  type SavedUploadRequestDraft,
} from "@/lib/upload-request-draft-state";
import {
  deleteSavedUploadRequestDraft,
  loadSavedUploadRequestDrafts,
  saveSavedUploadRequestDraft,
} from "@/lib/upload-request-draft-api";
import type { HighlightFieldGroup } from "@/lib/upload-view-state";
import {
  deleteWorkspaceAttachmentFile,
  type ParsedWorkspaceFilePayload,
} from "@/lib/workspace-file-api";
import type {
  ApprovalAttachment,
  WorkflowTemplate,
} from "@/lib/types";
import type { WorkflowParticipantEmailMap } from "@/lib/workflow-participant-assignment-state";
import type { UploadRequestDraftRow } from "@/app/use-workspace-request-pipeline";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

const uploadRequestDraftStoragePrefix = "approval-upload-request-draft-v1";
const uploadRequestDraftListStoragePrefix = "approval-upload-request-drafts-v1";
const uploadRequestCurrentAutosaveIdStoragePrefix =
  "approval-upload-current-autosave-id-v1";
const uploadRequestActiveDraftIdStoragePrefix =
  "approval-upload-active-draft-id-v1";
const localUploadAutosaveDelayMs = 500;
const remoteUploadAutosaveDelayMs = 12_000;

export function useWorkspaceUploadDrafts({
  activeUserEmail,
  requestConfirmation,
  selectedTemplateId,
  setSelectedTemplateId,
  shouldStartNewUploadRequest,
  templates,
}: {
  activeUserEmail: string;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
  selectedTemplateId: string;
  setSelectedTemplateId: StateSetter<string>;
  shouldStartNewUploadRequest: boolean;
  templates: WorkflowTemplate[];
}) {
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] =
    useState<ParsedWorkspaceFilePayload | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [documentPreviewPages, setDocumentPreviewPages] = useState<
    DocumentPreviewPage[]
  >([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<
    ApprovalAttachment[]
  >([]);
  const [parsedDocumentId, setParsedDocumentId] = useState<string | undefined>();
  const [requestParticipantEmails, setRequestParticipantEmails] =
    useState<WorkflowParticipantEmailMap>({});
  const [uploadRequestDraftRows, setUploadRequestDraftRows] = useState<
    UploadRequestDraftRow[]
  >([]);
  const [selectedUploadRequestDraftRowId, setSelectedUploadRequestDraftRowId] =
    useState("");
  const [uploadHighlightGroups, setUploadHighlightGroups] = useState<
    HighlightFieldGroup[]
  >([]);
  const [uploadActiveHighlightGroupId, setUploadActiveHighlightGroupId] =
    useState("");
  const [uploadHighlightBoxCounter, setUploadHighlightBoxCounter] = useState(1);
  const [uploadDraftRestoreToken, setUploadDraftRestoreToken] = useState("");
  const [uploadDraftResetToken, setUploadDraftResetToken] = useState(0);
  const [savedUploadDrafts, setSavedUploadDrafts] = useState<
    SavedUploadRequestDraft[]
  >([]);
  const [selectedUploadDraftId, setSelectedUploadDraftId] = useState("");
  const [uploadDraftTitle, setUploadDraftTitle] = useState("");
  const [uploadDraftMessage, setUploadDraftMessage] = useState("");
  const [remoteUploadAutosaveId, setRemoteUploadAutosaveId] = useState("");
  const uploadDraftStorageReady = useRef(false);
  const lastRemoteUploadAutosavePayloadRef = useRef("");

  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ||
      templates[0],
    [selectedTemplateId, templates],
  );
  const uploadRequestDraftStorageKey = useMemo(
    () => `${uploadRequestDraftStoragePrefix}:${activeUserEmail}`,
    [activeUserEmail],
  );
  const uploadRequestDraftListStorageKey = useMemo(
    () => `${uploadRequestDraftListStoragePrefix}:${activeUserEmail}`,
    [activeUserEmail],
  );
  const uploadRequestCurrentAutosaveIdStorageKey = useMemo(
    () => `${uploadRequestCurrentAutosaveIdStoragePrefix}:${activeUserEmail}`,
    [activeUserEmail],
  );
  const uploadRequestActiveDraftIdStorageKey = useMemo(
    () => `${uploadRequestActiveDraftIdStoragePrefix}:${activeUserEmail}`,
    [activeUserEmail],
  );
  const currentUploadRequestDraft = useMemo(
    () =>
      buildUploadRequestDraft({
        selectedTemplateId: selectedTemplate?.id || selectedTemplateId,
        fileName,
        parseResult,
        editedFields,
        uploadedAttachments,
        parsedDocumentId,
        participantEmails: requestParticipantEmails,
        highlightGroups: uploadHighlightGroups,
        activeHighlightGroupId: uploadActiveHighlightGroupId,
        highlightBoxCounter: uploadHighlightBoxCounter,
        savedAt: "",
      }),
    [
      editedFields,
      fileName,
      parseResult,
      parsedDocumentId,
      requestParticipantEmails,
      selectedTemplate?.id,
      selectedTemplateId,
      uploadActiveHighlightGroupId,
      uploadHighlightBoxCounter,
      uploadHighlightGroups,
      uploadedAttachments,
    ],
  );
  const uploadDraftStatus = useMemo(
    () => createEmptyUploadRequestDraftStatus(currentUploadRequestDraft),
    [currentUploadRequestDraft],
  );
  const uploadDraftResumeItems = useMemo(
    () =>
      getUploadDraftResumeItems({
        activeUserEmail,
        activeDraftId: selectedUploadDraftId,
        currentDraft: currentUploadRequestDraft,
        currentDraftStatus: uploadDraftStatus,
        savedDrafts: savedUploadDrafts,
        templates,
      }),
    [
      activeUserEmail,
      currentUploadRequestDraft,
      savedUploadDrafts,
      selectedUploadDraftId,
      templates,
      uploadDraftStatus,
    ],
  );

  const restoreUploadRequestDraft = useCallback(
    (draft: ReturnType<typeof parseUploadRequestDraft>) => {
      if (!draft) {
        return;
      }

      setSelectedTemplateId(draft.selectedTemplateId);
      setFileName(draft.fileName);
      setParseResult(draft.parseResult);
      setEditedFields(draft.editedFields);
      setUploadedAttachments(draft.uploadedAttachments);
      setParsedDocumentId(draft.parsedDocumentId);
      setRequestParticipantEmails(draft.participantEmails);
      const restoredRowId =
        draft.fileName || draft.parsedDocumentId
          ? `restored-${draft.savedAt}`
          : "";
      setUploadRequestDraftRows(
        restoredRowId
          ? [
              {
                id: restoredRowId,
                fileName: draft.fileName,
                parseResult: draft.parseResult,
                editedFields: draft.editedFields,
                uploadedAttachments: draft.uploadedAttachments,
                parsedDocumentId: draft.parsedDocumentId,
                documentPreviewPages: [],
              },
            ]
          : [],
      );
      setSelectedUploadRequestDraftRowId(restoredRowId);
      setUploadHighlightGroups(draft.highlightGroups);
      setUploadActiveHighlightGroupId(draft.activeHighlightGroupId);
      setUploadHighlightBoxCounter(draft.highlightBoxCounter);
      setUploadDraftRestoreToken(draft.savedAt);
    },
    [setSelectedTemplateId],
  );

  const updateRequestParticipantEmail = useCallback(
    (nodeId: string, email: string) => {
      setRequestParticipantEmails((emails) => ({
        ...emails,
        [nodeId]: email,
      }));
    },
    [],
  );

  useEffect(() => {
    let didCancel = false;

    if (shouldStartNewUploadRequest) {
      const storedAutosaveId =
        localStorage.getItem(uploadRequestCurrentAutosaveIdStorageKey) || "";
      const cleared = clearUploadRequestDraft();
      localStorage.removeItem(uploadRequestDraftStorageKey);
      localStorage.removeItem(uploadRequestActiveDraftIdStorageKey);
      localStorage.removeItem(uploadRequestCurrentAutosaveIdStorageKey);
      if (storedAutosaveId) {
        void deleteSavedUploadRequestDraft({ draftId: storedAutosaveId }).catch(
          () => {
            // A failed remote cleanup should not block starting a clean request.
          },
        );
      }

      queueMicrotask(() => {
        if (didCancel) {
          return;
        }

        setFileName(cleared.fileName);
        setParseResult(cleared.parseResult);
        setEditedFields(cleared.editedFields);
        setUploadedAttachments(cleared.uploadedAttachments);
        setParsedDocumentId(cleared.parsedDocumentId);
        setRequestParticipantEmails(cleared.participantEmails);
        setUploadRequestDraftRows([]);
        setSelectedUploadRequestDraftRowId("");
        setDocumentPreviewPages([]);
        setUploadHighlightGroups(cleared.highlightGroups);
        setUploadActiveHighlightGroupId(cleared.activeHighlightGroupId);
        setUploadHighlightBoxCounter(cleared.highlightBoxCounter);
        setUploadDraftResetToken((value) => value + 1);
        setSelectedUploadDraftId("");
        setUploadDraftTitle("");
        setRemoteUploadAutosaveId("");
        lastRemoteUploadAutosavePayloadRef.current = "";
        uploadDraftStorageReady.current = true;
        window.history.replaceState(null, "", "/?tab=upload");
      });

      return () => {
        didCancel = true;
      };
    }

    const savedDraft = localStorage.getItem(uploadRequestDraftStorageKey);
    const parsedDraft = savedDraft ? parseUploadRequestDraft(savedDraft) : null;

    queueMicrotask(() => {
      if (didCancel) {
        return;
      }

      restoreUploadRequestDraft(parsedDraft);
      setRemoteUploadAutosaveId(
        localStorage.getItem(uploadRequestCurrentAutosaveIdStorageKey) || "",
      );
      setSelectedUploadDraftId(
        localStorage.getItem(uploadRequestActiveDraftIdStorageKey) || "",
      );
      uploadDraftStorageReady.current = true;
    });

    return () => {
      didCancel = true;
    };
  }, [
    restoreUploadRequestDraft,
    shouldStartNewUploadRequest,
    uploadRequestCurrentAutosaveIdStorageKey,
    uploadRequestActiveDraftIdStorageKey,
    uploadRequestDraftStorageKey,
  ]);

  useEffect(() => {
    let didCancel = false;
    const localDrafts = getNamedSavedUploadRequestDrafts(
      getCreatorVisibleUploadRequestDrafts({
        drafts: parseUploadRequestDraftList(
          localStorage.getItem(uploadRequestDraftListStorageKey) || "[]",
        ),
        activeUserEmail,
        activeUserId: "",
      }),
    );

    queueMicrotask(() => {
      if (!didCancel) {
        setSavedUploadDrafts(localDrafts);
      }
    });

    loadSavedUploadRequestDrafts()
      .then((remoteDrafts) => {
        if (didCancel) {
          return;
        }

        const visibleRemoteDrafts = getCreatorVisibleUploadRequestDrafts({
          drafts: remoteDrafts,
          activeUserEmail,
          activeUserId: "",
        });
        const remoteCurrentAutosave =
          getCurrentAutosaveUploadRequestDraft(visibleRemoteDrafts);
        const localCurrentAutosave = parseUploadRequestDraft(
          localStorage.getItem(uploadRequestDraftStorageKey) || "",
        );
        if (
          !shouldStartNewUploadRequest &&
          remoteCurrentAutosave &&
          (!localCurrentAutosave ||
            remoteCurrentAutosave.savedAt > localCurrentAutosave.savedAt)
        ) {
          restoreUploadRequestDraft(remoteCurrentAutosave.draft);
          setRemoteUploadAutosaveId(remoteCurrentAutosave.id);
          localStorage.setItem(
            uploadRequestCurrentAutosaveIdStorageKey,
            remoteCurrentAutosave.id,
          );
        }

        // Supabase is authoritative after a successful load. The local list is
        // only an immediate/offline cache and must not resurrect remote deletes.
        const syncedDrafts = getNamedSavedUploadRequestDrafts(visibleRemoteDrafts);
        const activeUploadDraftId =
          localStorage.getItem(uploadRequestActiveDraftIdStorageKey) || "";
        const activeUploadDraft = syncedDrafts.find(
          (draft) => draft.id === activeUploadDraftId,
        );
        if (activeUploadDraft) {
          setSelectedUploadDraftId(activeUploadDraft.id);
          setUploadDraftTitle(activeUploadDraft.title);
        } else if (activeUploadDraftId) {
          setSelectedUploadDraftId("");
          setUploadDraftTitle("");
          localStorage.removeItem(uploadRequestActiveDraftIdStorageKey);
        }
        setSavedUploadDrafts(syncedDrafts);
        localStorage.setItem(
          uploadRequestDraftListStorageKey,
          serializeUploadRequestDraftList(syncedDrafts),
        );
      })
      .catch(() => {
        if (!didCancel) {
          setUploadDraftMessage("Using local drafts. Supabase sync unavailable.");
        }
      });

    return () => {
      didCancel = true;
    };
  }, [
    activeUserEmail,
    restoreUploadRequestDraft,
    shouldStartNewUploadRequest,
    uploadRequestActiveDraftIdStorageKey,
    uploadRequestCurrentAutosaveIdStorageKey,
    uploadRequestDraftListStorageKey,
    uploadRequestDraftStorageKey,
  ]);

  useEffect(() => {
    if (!uploadDraftStorageReady.current) {
      return;
    }

    if (!uploadDraftStatus.hasDraft) {
      localStorage.removeItem(uploadRequestDraftStorageKey);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextDraft = buildUploadRequestDraft({
        ...currentUploadRequestDraft,
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(
        uploadRequestDraftStorageKey,
        serializeUploadRequestDraft(nextDraft),
      );
    }, localUploadAutosaveDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentUploadRequestDraft,
    uploadDraftStatus.hasDraft,
    uploadRequestDraftStorageKey,
  ]);

  useEffect(() => {
    if (!uploadDraftStorageReady.current) {
      return;
    }

    const nextDraft = buildUploadRequestDraft({
      ...currentUploadRequestDraft,
      savedAt: new Date().toISOString(),
    });
    const nextStatus = createEmptyUploadRequestDraftStatus(nextDraft);
    if (!nextStatus.hasDraft) {
      return;
    }

    const serializedDraft = serializeUploadRequestDraft(nextDraft);
    if (lastRemoteUploadAutosavePayloadRef.current === serializedDraft) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      const autosaveIdentity = getUploadAutosaveIdentity({
        selectedUploadDraftId,
        remoteUploadAutosaveId,
        storedUploadAutosaveId:
          localStorage.getItem(uploadRequestCurrentAutosaveIdStorageKey) || "",
        createUploadAutosaveId: () => crypto.randomUUID(),
      });

      if (autosaveIdentity.isCurrentAutosave) {
        localStorage.setItem(
          uploadRequestCurrentAutosaveIdStorageKey,
          autosaveIdentity.id,
        );
        setRemoteUploadAutosaveId(autosaveIdentity.id);
      }

      const savedDraft = buildSavedUploadRequestDraft({
        draft: nextDraft,
        id: autosaveIdentity.id,
        title: autosaveIdentity.isCurrentAutosave ? "" : uploadDraftTitle,
        createdByEmail: activeUserEmail,
        draftKind: autosaveIdentity.draftKind,
        savedAt: nextDraft.savedAt,
      });

      try {
        const remoteDraft = await saveSavedUploadRequestDraft({ draft: savedDraft });
        if (!autosaveIdentity.isCurrentAutosave && remoteDraft) {
          setSavedUploadDrafts((currentDrafts) => {
            const visibleDrafts = getCreatorVisibleUploadRequestDrafts({
              drafts: getNextSavedUploadRequestDrafts({
                drafts: currentDrafts,
                action: "upsert",
                draft: remoteDraft,
                activeUserEmail,
                activeUserId: "",
              }),
              activeUserEmail,
              activeUserId: "",
            });
            const namedVisibleDrafts =
              getNamedSavedUploadRequestDrafts(visibleDrafts);
            localStorage.setItem(
              uploadRequestDraftListStorageKey,
              serializeUploadRequestDraftList(namedVisibleDrafts),
            );
            return namedVisibleDrafts;
          });
        }
        lastRemoteUploadAutosavePayloadRef.current = serializedDraft;
      } catch (error) {
        setUploadDraftMessage(
          error instanceof Error
            ? `Saved locally. Supabase autosave failed: ${error.message}`
            : "Saved locally. Supabase autosave failed.",
        );
      }
    }, remoteUploadAutosaveDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeUserEmail,
    currentUploadRequestDraft,
    remoteUploadAutosaveId,
    selectedUploadDraftId,
    uploadDraftTitle,
    uploadRequestCurrentAutosaveIdStorageKey,
    uploadRequestDraftListStorageKey,
  ]);

  function resetUploadRequestDraftState() {
    const cleared = clearUploadRequestDraft();
    setFileName(cleared.fileName);
    setParseResult(cleared.parseResult);
    setEditedFields(cleared.editedFields);
    setUploadedAttachments(cleared.uploadedAttachments);
    setParsedDocumentId(cleared.parsedDocumentId);
    setRequestParticipantEmails(cleared.participantEmails);
    setUploadRequestDraftRows([]);
    setSelectedUploadRequestDraftRowId("");
    setDocumentPreviewPages([]);
    setUploadHighlightGroups(cleared.highlightGroups);
    setUploadActiveHighlightGroupId(cleared.activeHighlightGroupId);
    setUploadHighlightBoxCounter(cleared.highlightBoxCounter);
    setUploadDraftResetToken((value) => value + 1);
    setSelectedUploadDraftId("");
    setUploadDraftTitle("");
    localStorage.removeItem(uploadRequestDraftStorageKey);
    localStorage.removeItem(uploadRequestActiveDraftIdStorageKey);
    if (remoteUploadAutosaveId) {
      void deleteSavedUploadRequestDraft({ draftId: remoteUploadAutosaveId }).catch(
        () => {
          // A failed cleanup should not block clearing the local draft.
        },
      );
    }
    setRemoteUploadAutosaveId("");
    lastRemoteUploadAutosavePayloadRef.current = "";
    localStorage.removeItem(uploadRequestCurrentAutosaveIdStorageKey);
  }

  function persistSavedUploadDraftList(nextDrafts: SavedUploadRequestDraft[]) {
    const visibleDrafts = getCreatorVisibleUploadRequestDrafts({
      drafts: nextDrafts,
      activeUserEmail,
      activeUserId: "",
    });
    const namedVisibleDrafts = getNamedSavedUploadRequestDrafts(visibleDrafts);
    setSavedUploadDrafts(namedVisibleDrafts);
    localStorage.setItem(
      uploadRequestDraftListStorageKey,
      serializeUploadRequestDraftList(namedVisibleDrafts),
    );
    return namedVisibleDrafts;
  }

  async function saveCurrentUploadRequestDraft(options?: { asNew?: boolean }) {
    const nextStatus = createEmptyUploadRequestDraftStatus(
      currentUploadRequestDraft,
    );
    if (!nextStatus.hasDraft) {
      setUploadDraftMessage("Add document/field first.");
      return;
    }

    const savedDraft = buildSavedUploadRequestDraft({
      draft: currentUploadRequestDraft,
      id: options?.asNew
        ? crypto.randomUUID()
        : selectedUploadDraftId || crypto.randomUUID(),
      title: uploadDraftTitle,
      createdByEmail: activeUserEmail,
      savedAt: new Date().toISOString(),
    });
    const nextDrafts = persistSavedUploadDraftList(
      getNextSavedUploadRequestDrafts({
        drafts: savedUploadDrafts,
        action: "upsert",
        draft: savedDraft,
        activeUserEmail,
        activeUserId: "",
      }),
    );
    setSelectedUploadDraftId(savedDraft.id);
    setUploadDraftTitle(savedDraft.title);
    localStorage.setItem(uploadRequestActiveDraftIdStorageKey, savedDraft.id);
    setUploadDraftMessage(`Saved draft "${savedDraft.title}".`);

    try {
      const remoteDraft = await saveSavedUploadRequestDraft({ draft: savedDraft });
      if (remoteDraft) {
        persistSavedUploadDraftList(
          getNextSavedUploadRequestDrafts({
            drafts: nextDrafts,
            action: "upsert",
            draft: remoteDraft,
            activeUserEmail,
            activeUserId: "",
          }),
        );
      }
    } catch (error) {
      setUploadDraftMessage(
        error instanceof Error
          ? `Saved locally. Draft sync failed: ${error.message}`
          : "Saved locally. Draft sync failed.",
      );
    }
  }

  function loadUploadRequestDraft(savedDraft: SavedUploadRequestDraft) {
    restoreUploadRequestDraft(savedDraft.draft);
    setSelectedUploadDraftId(savedDraft.id);
    setUploadDraftTitle(savedDraft.title);
    localStorage.setItem(uploadRequestActiveDraftIdStorageKey, savedDraft.id);
    setUploadDraftMessage(`Loaded draft "${savedDraft.title}".`);
  }

  function resumeUploadRequestDraft(savedDraft: SavedUploadRequestDraft) {
    loadUploadRequestDraft(savedDraft);
    localStorage.setItem(
      uploadRequestDraftStorageKey,
      serializeUploadRequestDraft({
        ...savedDraft.draft,
        savedAt: new Date().toISOString(),
      }),
    );
    window.location.href = "/?tab=upload";
  }

  async function deleteUploadRequestDraft(draftId: string) {
    const target = savedUploadDrafts.find((draft) => draft.id === draftId);
    const nextDrafts = persistSavedUploadDraftList(
      getNextSavedUploadRequestDrafts({
        drafts: savedUploadDrafts,
        action: "remove",
        draftId,
        activeUserEmail,
        activeUserId: "",
      }),
    );
    if (selectedUploadDraftId === draftId) {
      setSelectedUploadDraftId("");
      setUploadDraftTitle("");
      localStorage.removeItem(uploadRequestActiveDraftIdStorageKey);
    }
    setUploadDraftMessage(
      target ? `Deleted draft "${target.title}".` : "Deleted draft.",
    );

    try {
      await deleteSavedUploadRequestDraft({ draftId });
    } catch (error) {
      setUploadDraftMessage(
        error instanceof Error
          ? `Deleted locally. Draft delete failed: ${error.message}`
          : "Deleted locally. Draft delete failed.",
      );
      persistSavedUploadDraftList(nextDrafts);
    }
  }

  async function confirmClearUploadRequestDraft() {
    const confirmed = await requestConfirmation(
      getDraftDeleteConfirmation({
        draftTitle: uploadDraftStatus.label || "current autosave",
        action: "clear",
      }),
    );
    if (!confirmed) {
      return false;
    }

    resetUploadRequestDraftState();
    return true;
  }

  async function confirmDeleteUploadRequestDraft(draftId: string) {
    const target = savedUploadDrafts.find((draft) => draft.id === draftId);
    const confirmed = await requestConfirmation(
      getDraftDeleteConfirmation({
        draftTitle: target?.title || "saved draft",
        action: "delete",
      }),
    );
    if (!confirmed) {
      return;
    }

    await deleteUploadRequestDraft(draftId);
  }

  const updateUploadHighlightDraft = useCallback(
    (draft: {
      highlightGroups: HighlightFieldGroup[];
      activeHighlightGroupId: string;
      highlightBoxCounter: number;
    }) => {
      setUploadHighlightGroups(draft.highlightGroups);
      setUploadActiveHighlightGroupId(draft.activeHighlightGroupId);
      setUploadHighlightBoxCounter(draft.highlightBoxCounter);
    },
    [],
  );

  function updateCurrentEditedFields(fields: Record<string, string>) {
    setEditedFields(fields);
    if (!selectedUploadRequestDraftRowId) {
      return;
    }
    setUploadRequestDraftRows((rows) =>
      rows.map((row) =>
        row.id === selectedUploadRequestDraftRowId
          ? { ...row, editedFields: fields }
          : row,
      ),
    );
  }

  function selectUploadRequestDraftRowState(rowId: string) {
    const row = uploadRequestDraftRows.find((item) => item.id === rowId);
    if (!row) {
      return false;
    }

    setSelectedUploadRequestDraftRowId(row.id);
    setFileName(row.fileName);
    setParseResult(row.parseResult);
    setEditedFields(row.editedFields);
    setUploadedAttachments(row.uploadedAttachments);
    setParsedDocumentId(row.parsedDocumentId);
    setDocumentPreviewPages(row.documentPreviewPages);
    return true;
  }

  async function removeUploadAttachment(attachment: ApprovalAttachment) {
    const confirmed = await requestConfirmation(
      getDraftAttachmentRemoveConfirmation({ fileName: attachment.fileName }),
    );
    if (!confirmed) {
      return;
    }

    const removedRow = uploadRequestDraftRows.find((row) =>
      row.uploadedAttachments.some((item) => item.id === attachment.id),
    );
    const remainingRows = removedRow
      ? uploadRequestDraftRows.filter((row) => row.id !== removedRow.id)
      : uploadRequestDraftRows;
    setUploadRequestDraftRows(remainingRows);

    if (removedRow?.id === selectedUploadRequestDraftRowId) {
      const nextRow = remainingRows[0];
      if (nextRow) {
        setSelectedUploadRequestDraftRowId(nextRow.id);
        setFileName(nextRow.fileName);
        setParseResult(nextRow.parseResult);
        setEditedFields(nextRow.editedFields);
        setUploadedAttachments(nextRow.uploadedAttachments);
        setParsedDocumentId(nextRow.parsedDocumentId);
        setDocumentPreviewPages(nextRow.documentPreviewPages);
      } else {
        setSelectedUploadRequestDraftRowId("");
        setFileName("");
        setParseResult(null);
        setEditedFields({});
        setUploadedAttachments([]);
        setParsedDocumentId(undefined);
        setDocumentPreviewPages([]);
        setUploadHighlightGroups([]);
        setUploadActiveHighlightGroupId("");
        setUploadHighlightBoxCounter(1);
        setUploadDraftResetToken((value) => value + 1);
      }
    } else {
      setUploadedAttachments((items) =>
        items.filter((item) => item.id !== attachment.id),
      );
    }

    setUploadDraftMessage(`Removed "${attachment.fileName}" from this draft.`);
    if (!attachment.storagePath) {
      return;
    }

    try {
      await deleteWorkspaceAttachmentFile({
        storagePath: attachment.storagePath,
      });
    } catch (error) {
      setUploadDraftMessage(
        error instanceof Error
          ? `Removed from the draft. Stored file cleanup failed: ${error.message}`
          : "Removed from the draft. Stored file cleanup failed.",
      );
    }
  }

  return {
    confirmClearUploadRequestDraft,
    confirmDeleteUploadRequestDraft,
    deleteUploadRequestDraft,
    documentPreviewPages,
    editedFields,
    fileName,
    loadUploadRequestDraft,
    parseResult,
    parsedDocumentId,
    remoteUploadAutosaveId,
    removeUploadAttachment,
    requestParticipantEmails,
    resetUploadRequestDraftState,
    resumeUploadRequestDraft,
    saveCurrentUploadRequestDraft,
    savedUploadDrafts,
    selectedTemplate,
    selectedUploadDraftId,
    selectedUploadRequestDraftRowId,
    selectUploadRequestDraftRowState,
    setDocumentPreviewPages,
    setEditedFields,
    setFileName,
    setParsedDocumentId,
    setParseResult,
    setRequestParticipantEmails,
    setSelectedUploadRequestDraftRowId,
    setUploadedAttachments,
    setUploadDraftMessage,
    setUploadDraftTitle,
    setUploadRequestDraftRows,
    updateCurrentEditedFields,
    updateRequestParticipantEmail,
    updateUploadHighlightDraft,
    uploadActiveHighlightGroupId,
    uploadDraftMessage,
    uploadDraftResetToken,
    uploadDraftRestoreToken,
    uploadDraftResumeItems,
    uploadDraftStatus,
    uploadDraftTitle,
    uploadHighlightBoxCounter,
    uploadHighlightGroups,
    uploadedAttachments,
    uploadRequestDraftRows,
    uploadRequestDraftStorageKey,
  };
}
