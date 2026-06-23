"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  notifications,
} from "@/lib/mock-data";
import {
  parseWorkspaceFile,
  type ParsedWorkspaceFilePayload,
  uploadWorkspaceAttachmentFile,
} from "@/lib/workspace-file-api";
import {
  buildPreviewPagesFromPdfImages,
  readImageFileAsPreviewPage,
  type DocumentPreviewPage,
} from "@/lib/document-preview";
import {
  getPdfOcrRenderOptions,
  getPdfPreviewRenderOptions,
  isPdfFile,
  renderPdfFileToPageImages,
  shouldRenderPdfForVision,
} from "@/lib/pdf-page-images";
import {
  getWorkspaceParseFileStartState,
  getWorkspaceParseFileStoredAttachmentState,
  getWorkspaceParseFileSuccessState,
} from "@/lib/workspace-parse-file-state";
import {
  appendExtractionExamplesToTemplate,
  buildExtractionTrainingExamples,
} from "@/lib/template-recognition-state";
import {
  buildSavedUploadRequestDraft,
  buildUploadRequestDraft,
  clearUploadRequestDraft,
  createEmptyUploadRequestDraftStatus,
  getCreatorVisibleUploadRequestDrafts,
  getNextSavedUploadRequestDrafts,
  parseUploadRequestDraft,
  parseUploadRequestDraftList,
  serializeUploadRequestDraftList,
  serializeUploadRequestDraft,
  type SavedUploadRequestDraft,
} from "@/lib/upload-request-draft-state";
import {
  deleteSavedUploadRequestDraft,
  loadSavedUploadRequestDrafts,
  saveSavedUploadRequestDraft,
} from "@/lib/upload-request-draft-api";
import type {
  HighlightFieldGroup,
} from "@/lib/upload-view-state";
import {
  buildTaskNotifications,
} from "@/lib/workflow-system";
import { useApprovalWorkspaceState } from "@/app/use-approval-workspace-state";
import {
  QueueView,
  TrackingView,
} from "@/app/task-views";
import { UploadView } from "@/app/upload-view";
import { AdminView } from "@/app/admin-view";
import { WorkflowView } from "@/app/workflow-view";
import {
  WorkspaceShell,
} from "@/app/workspace-shell";
import { UploadDraftsView } from "@/app/upload-drafts-view";
import type { WorkspaceTab } from "@/lib/workspace-tabs-state";
import { getWorkspaceShellState } from "@/lib/workspace-shell-state";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getUpdatedTemplateRecordState,
} from "@/lib/workspace-template-record-state";
import {
  getAdminRecordDeleteFailureState,
  getAdminRecordDeleteSyncState,
  getUpdatedBusinessDirectoryRecordState,
  getUpdatedRoleAssignmentRecordState,
} from "@/lib/workspace-admin-record-state";
import { getWorkspaceRequestSubmissionState } from "@/lib/workspace-request-submission-state";
import { getApprovalWorkspaceTaskState } from "@/lib/approval-workspace-task-state";
import { attachDocumentToTaskState } from "@/lib/task-document-attachment-state";
import {
  getWorkspaceRecordTaskActionState,
  getWorkspaceRunnerTaskActionState,
} from "@/lib/workspace-task-action-state";
import { deactivateRemoteWorkspaceAdminRecord } from "@/lib/workspace-sync";
import type {
  ApprovalAction,
  ApprovalAttachment,
  BusinessUnit,
  WorkflowTemplate,
  WorkflowDocumentRequirement,
  WorkflowField,
  UserRoleAssignment,
} from "@/lib/types";

type Tab = WorkspaceTab;

const uploadRequestDraftStoragePrefix = "approval-upload-request-draft-v1";
const uploadRequestDraftListStoragePrefix = "approval-upload-request-drafts-v1";

export type ApprovalWorkspaceProps = {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
};

export default function ApprovalWorkspace(props: ApprovalWorkspaceProps) {
  return <ApprovalWorkspaceBody {...props} />;
}
function ApprovalWorkspaceBody({
  initialTab,
  sessionUser,
  departments,
  workflowTemplates,
  requestId = "",
}: {
  initialTab: Tab;
  sessionUser: string;
  departments: string[];
  workflowTemplates: WorkflowTemplate[];
  requestId?: string;
}) {
  const activeTab = initialTab;
  const activeUser = useMemo(
    () => ({
      name: sessionUser.includes("@") ? sessionUser.split("@")[0] : sessionUser,
      email: sessionUser.includes("@") ? sessionUser : "derrick@example.com",
      role: "superuser" as const,
    }),
    [sessionUser],
  );
  const {
    adminAuditEvents,
    businessDirectory,
    buildWorkspaceSnapshot,
    effectiveRoleAssignments,
    persistWorkspaceSnapshot,
    selectedTaskId,
    selectedTemplateId,
    setBusinessDirectory,
    setRoleAssignments,
    setAdminAuditEvents,
    setSelectedTaskId,
    setSelectedTemplateId,
    setTasks,
    setTemplates,
    tasks,
    templates,
    userDirectory,
    workspaceSyncMode,
  } = useApprovalWorkspaceState({
    activeUser,
    requestId,
    workflowTemplates,
  });
  const taskState = useMemo(
    () =>
      getApprovalWorkspaceTaskState({
        tasks,
        templates,
        selectedTaskId,
        activeUserEmail: activeUser.email,
      }),
    [activeUser.email, selectedTaskId, tasks, templates],
  );
  const [comment, setComment] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ParsedWorkspaceFilePayload | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [documentPreviewPages, setDocumentPreviewPages] = useState<DocumentPreviewPage[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [adminRecordError, setAdminRecordError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<ApprovalAttachment[]>([]);
  const [parsedDocumentId, setParsedDocumentId] = useState<string | undefined>();
  const [uploadHighlightGroups, setUploadHighlightGroups] = useState<HighlightFieldGroup[]>([]);
  const [uploadActiveHighlightGroupId, setUploadActiveHighlightGroupId] = useState("");
  const [uploadHighlightBoxCounter, setUploadHighlightBoxCounter] = useState(1);
  const [uploadDraftRestoreToken, setUploadDraftRestoreToken] = useState("");
  const [uploadDraftResetToken, setUploadDraftResetToken] = useState(0);
  const [savedUploadDrafts, setSavedUploadDrafts] = useState<SavedUploadRequestDraft[]>([]);
  const [selectedUploadDraftId, setSelectedUploadDraftId] = useState("");
  const [uploadDraftTitle, setUploadDraftTitle] = useState("");
  const [uploadDraftMessage, setUploadDraftMessage] = useState("");
  const uploadDraftStorageReady = useRef(false);
  const selectedTemplate = useMemo(
    () =>
      templates.find((template) => template.id === selectedTemplateId) ||
      templates[0],
    [selectedTemplateId, templates],
  );
  const uploadRequestDraftStorageKey = useMemo(
    () => `${uploadRequestDraftStoragePrefix}:${activeUser.email}`,
    [activeUser.email],
  );
  const uploadRequestDraftListStorageKey = useMemo(
    () => `${uploadRequestDraftListStoragePrefix}:${activeUser.email}`,
    [activeUser.email],
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
      selectedTemplate?.id,
      selectedTemplateId,
      uploadActiveHighlightGroupId,
      uploadHighlightBoxCounter,
      uploadHighlightGroups,
      uploadedAttachments,
    ],
  );
  const uploadDraftStatus = useMemo(
    () =>
      createEmptyUploadRequestDraftStatus(currentUploadRequestDraft),
    [currentUploadRequestDraft],
  );

  const {
    actionableTasks,
    selectedTask,
    selectedTaskMissingDocuments,
    trackingTasks,
  } = taskState;

  const taskNotifications = useMemo(() => buildTaskNotifications(tasks), [tasks]);
  const shellState = useMemo(
    () =>
      getWorkspaceShellState({
        baseNotifications: notifications,
        taskNotifications,
        workspaceSyncMode,
      }),
    [taskNotifications, workspaceSyncMode],
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
      setUploadHighlightGroups(draft.highlightGroups);
      setUploadActiveHighlightGroupId(draft.activeHighlightGroupId);
      setUploadHighlightBoxCounter(draft.highlightBoxCounter);
      setUploadDraftRestoreToken(draft.savedAt);
    },
    [setSelectedTemplateId],
  );

  useEffect(() => {
    let didCancel = false;
    const savedDraft = localStorage.getItem(uploadRequestDraftStorageKey);
    const parsedDraft = savedDraft ? parseUploadRequestDraft(savedDraft) : null;

    queueMicrotask(() => {
      if (didCancel) {
        return;
      }

      restoreUploadRequestDraft(parsedDraft);
      uploadDraftStorageReady.current = true;
    });

    return () => {
      didCancel = true;
    };
  }, [restoreUploadRequestDraft, uploadRequestDraftStorageKey]);

  useEffect(() => {
    let didCancel = false;
    const localDrafts = getCreatorVisibleUploadRequestDrafts({
      drafts: parseUploadRequestDraftList(
        localStorage.getItem(uploadRequestDraftListStorageKey) || "[]",
      ),
      activeUserEmail: activeUser.email,
      activeUserId: "",
    });

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

        const mergedById = new Map<string, SavedUploadRequestDraft>();
        [...localDrafts, ...remoteDrafts].forEach((draft) => {
          const current = mergedById.get(draft.id);
          if (!current || draft.savedAt > current.savedAt) {
            mergedById.set(draft.id, draft);
          }
        });
        const merged = getCreatorVisibleUploadRequestDrafts({
          drafts: Array.from(mergedById.values()),
          activeUserEmail: activeUser.email,
          activeUserId: "",
        });
        setSavedUploadDrafts(merged);
        localStorage.setItem(
          uploadRequestDraftListStorageKey,
          serializeUploadRequestDraftList(merged),
        );
      })
      .catch(() => {
        if (!didCancel) {
          setUploadDraftMessage("Using local saved drafts. Supabase draft sync is unavailable.");
        }
      });

    return () => {
      didCancel = true;
    };
  }, [activeUser.email, uploadRequestDraftListStorageKey]);

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
      localStorage.removeItem(uploadRequestDraftStorageKey);
      return;
    }

    localStorage.setItem(
      uploadRequestDraftStorageKey,
      serializeUploadRequestDraft(nextDraft),
    );
  }, [
    editedFields,
    fileName,
    parseResult,
    parsedDocumentId,
    currentUploadRequestDraft,
    uploadActiveHighlightGroupId,
    uploadDraftRestoreToken,
    uploadHighlightBoxCounter,
    uploadHighlightGroups,
    uploadedAttachments,
    uploadRequestDraftStorageKey,
  ]);

  function resetUploadRequestDraftState() {
    const cleared = clearUploadRequestDraft();
    setFileName(cleared.fileName);
    setParseResult(cleared.parseResult);
    setEditedFields(cleared.editedFields);
    setUploadedAttachments(cleared.uploadedAttachments);
    setParsedDocumentId(cleared.parsedDocumentId);
    setDocumentPreviewPages([]);
    setUploadHighlightGroups(cleared.highlightGroups);
    setUploadActiveHighlightGroupId(cleared.activeHighlightGroupId);
    setUploadHighlightBoxCounter(cleared.highlightBoxCounter);
    setUploadDraftResetToken((value) => value + 1);
    setSelectedUploadDraftId("");
    setUploadDraftTitle("");
    localStorage.removeItem(uploadRequestDraftStorageKey);
  }

  function clearUploadRequestDraftFromUi() {
    resetUploadRequestDraftState();
    setParseError("");
    setSubmissionMessage("Request draft cleared.");
  }

  function persistSavedUploadDraftList(nextDrafts: SavedUploadRequestDraft[]) {
    const visibleDrafts = getCreatorVisibleUploadRequestDrafts({
      drafts: nextDrafts,
      activeUserEmail: activeUser.email,
      activeUserId: "",
    });
    setSavedUploadDrafts(visibleDrafts);
    localStorage.setItem(
      uploadRequestDraftListStorageKey,
      serializeUploadRequestDraftList(visibleDrafts),
    );
    return visibleDrafts;
  }

  async function saveCurrentUploadRequestDraft() {
    const nextStatus = createEmptyUploadRequestDraftStatus(currentUploadRequestDraft);
    if (!nextStatus.hasDraft) {
      setUploadDraftMessage("Upload a document or enter a field before saving a draft.");
      return;
    }

    const savedDraft = buildSavedUploadRequestDraft({
      draft: currentUploadRequestDraft,
      id: selectedUploadDraftId || crypto.randomUUID(),
      title: uploadDraftTitle,
      createdByEmail: activeUser.email,
      savedAt: new Date().toISOString(),
    });
    const nextDrafts = persistSavedUploadDraftList(
      getNextSavedUploadRequestDrafts({
        drafts: savedUploadDrafts,
        action: "upsert",
        draft: savedDraft,
        activeUserEmail: activeUser.email,
        activeUserId: "",
      }),
    );
    setSelectedUploadDraftId(savedDraft.id);
    setUploadDraftTitle(savedDraft.title);
    setUploadDraftMessage(`Saved draft "${savedDraft.title}".`);

    try {
      const remoteDraft = await saveSavedUploadRequestDraft({ draft: savedDraft });
      if (remoteDraft) {
        persistSavedUploadDraftList(
          getNextSavedUploadRequestDrafts({
            drafts: nextDrafts,
            action: "upsert",
            draft: remoteDraft,
            activeUserEmail: activeUser.email,
            activeUserId: "",
          }),
        );
      }
    } catch (error) {
      setUploadDraftMessage(
        error instanceof Error
          ? `Saved locally. Supabase draft sync failed: ${error.message}`
          : "Saved locally. Supabase draft sync failed.",
      );
    }
  }

  function loadUploadRequestDraft(savedDraft: SavedUploadRequestDraft) {
    restoreUploadRequestDraft(savedDraft.draft);
    setSelectedUploadDraftId(savedDraft.id);
    setUploadDraftTitle(savedDraft.title);
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
        activeUserEmail: activeUser.email,
        activeUserId: "",
      }),
    );
    if (selectedUploadDraftId === draftId) {
      setSelectedUploadDraftId("");
      setUploadDraftTitle("");
    }
    setUploadDraftMessage(
      target ? `Deleted saved draft "${target.title}".` : "Deleted saved draft.",
    );

    try {
      await deleteSavedUploadRequestDraft({ draftId });
    } catch (error) {
      setUploadDraftMessage(
        error instanceof Error
          ? `Deleted locally. Supabase draft delete failed: ${error.message}`
          : "Deleted locally. Supabase draft delete failed.",
      );
      persistSavedUploadDraftList(nextDrafts);
    }
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

  function recordAction(action: ApprovalAction) {
    const nextState = getWorkspaceRecordTaskActionState({
      tasks,
      selectedTask,
      templates,
      activeUser,
      action,
      comment,
      targetEmail,
    });

    if (!nextState.didApply) {
      if (nextState.actionError) {
        setActionError(nextState.actionError);
      }
      return;
    }

    setTasks(nextState.tasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    if (nextState.shouldClearInputs) {
      setComment("");
      setTargetEmail("");
    }
    setActionError(nextState.actionError);
  }

  async function attachTaskDocument(
    taskId: string,
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) {
    try {
      const storage = await uploadWorkspaceAttachmentFile({
        file,
        documentRequirement,
      });
      const nextTasks = attachDocumentToTaskState({
        tasks,
        templates,
        taskId,
        file,
        documentRequirement,
        activeUser,
        storagePath: storage.storagePath,
        publicUrl: storage.publicUrl,
      });
      setTasks(nextTasks);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to upload document.",
      );
    }
  }

  function runWorkflowAction(taskId: string, action: ApprovalAction) {
    const nextState = getWorkspaceRunnerTaskActionState({
      tasks,
      templates,
      taskId,
      action,
      fallbackEmail: activeUser.email,
    });
    if (!nextState.didApply) {
      return;
    }

    setTasks(nextState.tasks);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    if (nextState.selectedTaskId) {
      setSelectedTaskId(nextState.selectedTaskId);
    }
  }

  async function parseFile(
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
    adHocFields: WorkflowField[] = [],
  ) {
    const startState = getWorkspaceParseFileStartState(file);
    setFileName(startState.fileName);
    setParseError(startState.parseError);
    setSubmissionMessage(startState.submissionMessage);
    setIsParsing(startState.isParsing);
    setParseResult(startState.parseResult);
    setEditedFields(startState.editedFields);
    setDocumentPreviewPages([]);
    setParsedDocumentId(documentRequirement?.id);
    let storage: Awaited<ReturnType<typeof uploadWorkspaceAttachmentFile>> | null = null;
    try {
      storage = await uploadWorkspaceAttachmentFile({
        file,
        documentRequirement,
      });
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to store document.",
      );
      setIsParsing(false);
      return;
    }

    setUploadedAttachments((items) =>
      getWorkspaceParseFileStoredAttachmentState({
        uploadedAttachments: items,
        selectedTemplate,
        file,
        documentRequirement,
        activeUser,
        storagePath: storage?.storagePath,
        publicUrl: storage?.publicUrl,
      }).uploadedAttachments,
    );

    try {
      const pdfPreviewImages = isPdfFile(file)
        ? await renderPdfFileToPageImages(file, getPdfPreviewRenderOptions())
        : [];
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      if (pdfPreviewImages.length) {
        setDocumentPreviewPages(buildPreviewPagesFromPdfImages(pdfPreviewImages));
      } else if (file.type.startsWith("image/")) {
        setDocumentPreviewPages([await readImageFileAsPreviewPage(file)]);
      }
      const payload = await parseWorkspaceFile({
        file,
        documentRequirement,
        adHocFields,
        pageImages,
        extractionExamples: (selectedTemplate?.extractionExamples || []).filter(
          (example) =>
            !documentRequirement?.id || example.documentId === documentRequirement.id,
        ),
      });
      const successState = getWorkspaceParseFileSuccessState(payload);
      setParseResult(successState.parseResult);
      setEditedFields(successState.editedFields);
      setIsParsing(successState.isParsing);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  async function extractHighlightedRegion(
    file: File,
    field: WorkflowField,
  ) {
    setIsParsing(true);
    setParseError("");
    try {
      const payload = await parseWorkspaceFile({
        file,
        adHocFields: [field],
        extractionExamples: selectedTemplate?.extractionExamples || [],
      });
      setParseResult((current) => ({
        ...(current || payload),
        fields: {
          ...(current?.fields || {}),
          ...(payload.fields || {}),
        },
        confidence: {
          ...(current?.confidence || {}),
          ...(payload.confidence || {}),
        },
        evidence: {
          ...(current?.evidence || {}),
          ...(payload.evidence || {}),
        },
        suggestedFields: current?.suggestedFields || payload.suggestedFields || [],
        notes: [
          ...(current?.notes || []),
          ...(payload.notes || []),
        ],
      }));
      setEditedFields((current) => ({
        ...current,
        ...(payload.fields || {}),
      }));
      return payload;
    } catch (error) {
      setParseError(
        error instanceof Error
          ? error.message
          : "Unable to extract highlighted region.",
      );
      throw error;
    } finally {
      setIsParsing(false);
    }
  }

  function submitParsedRequest() {
    const nextState = getWorkspaceRequestSubmissionState({
      selectedTemplate,
      parseResult,
      activeUser,
      fileName,
      editedFields,
      uploadedAttachments,
      tasks,
    });
    if (!nextState.didSubmit) {
      if (nextState.submissionMessage) {
        setSubmissionMessage(nextState.submissionMessage);
      }
      return;
    }

    const extractionExamples = selectedTemplate
      ? buildExtractionTrainingExamples({
          template: selectedTemplate,
          documentId: parsedDocumentId,
          parseFields: parseResult?.fields || {},
          correctedFields: editedFields,
          evidence: parseResult?.evidence || {},
          sourceFileName: fileName,
          actorEmail: activeUser.email,
        })
      : [];
    const nextTemplates =
      selectedTemplate && extractionExamples.length
        ? templates.map((template) =>
            template.id === selectedTemplate.id
              ? appendExtractionExamplesToTemplate({
                  template,
                  examples: extractionExamples,
                })
              : template,
          )
        : templates;

    setTasks(nextState.tasks);
    if (nextTemplates !== templates) {
      setTemplates(nextTemplates);
    }
    setSelectedTaskId(nextState.selectedTaskId);
    if (nextState.shouldClearUploadedAttachments) {
      resetUploadRequestDraftState();
    }
    if (selectedUploadDraftId) {
      void deleteUploadRequestDraft(selectedUploadDraftId);
    }
    localStorage.removeItem(uploadRequestDraftStorageKey);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        approvalTasks: nextState.tasks,
        workflowTemplates: nextTemplates,
      }),
    );
    setSubmissionMessage(nextState.submissionMessage);
  }

  function createTemplateRecord(template: WorkflowTemplate) {
    const action = template.isDraft === false
      ? "template_published"
      : template.sourceTemplateId
        ? "template_duplicated"
        : "template_created";
    const nextState = getCreatedTemplateRecordState({
      templates,
      template,
      actor: activeUser,
      action,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  function updateTemplateRecord(template: WorkflowTemplate) {
    const currentTemplate = templates.find((item) => item.id === template.id);
    const action =
      currentTemplate?.isDraft !== false && template.isDraft === false
        ? "template_published"
        : "template_updated";
    const nextState = getUpdatedTemplateRecordState({
      templates,
      template,
      actor: activeUser,
      action,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
      }),
    );
  }

  async function deleteTemplateRecord(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const didDeactivate = template
      ? await deactivateAdminRecord({
          type: "template",
          templateKey: template.id,
          versionNumber: template.version || latestTaskVersionForTemplate(template.id),
        })
      : true;
    if (!didDeactivate) {
      return;
    }

    const nextState = getDeletedTemplateRecordState({
      templates,
      selectedTemplateId,
      templateId,
      actor: activeUser,
    });
    const nextAuditEvents = nextState.auditEvent
      ? [nextState.auditEvent, ...adminAuditEvents]
      : adminAuditEvents;
    setTemplates(nextState.templates);
    setAdminAuditEvents(nextAuditEvents);
    setSelectedTemplateId(nextState.selectedTemplateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        workflowTemplates: nextState.templates,
        adminAuditEvents: nextAuditEvents,
        selectedTemplateId: nextState.selectedTemplateId,
      }),
    );
  }

  async function deactivateAdminRecord(
    record: Parameters<typeof deactivateRemoteWorkspaceAdminRecord>[0],
  ) {
    const syncState = getAdminRecordDeleteSyncState({ workspaceSyncMode });
    if (!syncState.canContinue) {
      setAdminRecordError(syncState.error);
      return false;
    }

    if (!syncState.shouldDeactivateRemote) {
      setAdminRecordError("");
      return true;
    }

    const result = await deactivateRemoteWorkspaceAdminRecord(record);
    if (result.mode !== "supabase") {
      const failureState = getAdminRecordDeleteFailureState({
        record,
        reason: result.reason || "",
      });
      setAdminRecordError(failureState.error);
      return failureState.canContinue;
    }

    setAdminRecordError("");
    return true;
  }

  function latestTaskVersionForTemplate(templateId: string) {
    return tasks.reduce((version, task) => {
      if (task.workflowTemplateId !== templateId) {
        return version;
      }

      return Math.max(version, task.workflowTemplateVersion || 1);
    }, 1);
  }

  function updateRoleAssignmentRecords(
    updater: (items: UserRoleAssignment[]) => UserRoleAssignment[],
  ) {
    const nextState = getUpdatedRoleAssignmentRecordState({
      roleAssignments: effectiveRoleAssignments,
      updater,
    });
    setRoleAssignments(nextState.roleAssignments);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ userRoleAssignments: nextState.roleAssignments }),
    );
  }

  function updateBusinessDirectoryRecords(
    updater: (items: BusinessUnit[]) => BusinessUnit[],
  ) {
    const nextState = getUpdatedBusinessDirectoryRecordState({
      businessDirectory,
      updater,
    });
    setBusinessDirectory(nextState.businessDirectory);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ businessDirectory: nextState.businessDirectory }),
    );
  }

  function selectTemplateRecord(templateId: string) {
    setSelectedTemplateId(templateId);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ selectedTemplateId: templateId }),
    );
  }

  return (
    <WorkspaceShell
      activeTab={activeTab}
      sessionUser={sessionUser}
      sidebarCollapsed={sidebarCollapsed}
      syncLabel={shellState.syncLabel}
      unreadCount={shellState.unreadCount}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
    >
            {activeTab === "queue" && (
              <QueueView
                selectedTask={selectedTask}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                tasks={actionableTasks}
                comment={comment}
                setComment={setComment}
                targetEmail={targetEmail}
                setTargetEmail={setTargetEmail}
                recordAction={recordAction}
                activeUserEmail={activeUser.email}
                userDirectory={userDirectory}
                actionError={actionError}
                missingCurrentDocuments={selectedTaskMissingDocuments}
                onAttachTaskDocument={(file, documentRequirement) =>
                  selectedTask &&
                  attachTaskDocument(selectedTask.id, file, documentRequirement)
                }
              />
            )}

            {activeTab === "tracking" && (
              <TrackingView
                tasks={trackingTasks}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                workflowTemplates={templates}
                activeUserEmail={activeUser.email}
                userDirectory={userDirectory}
              />
            )}

            {activeTab === "upload" && (
              <UploadView
                fileName={fileName}
                parseResult={parseResult}
                editedFields={editedFields}
                setEditedFields={setEditedFields}
                isParsing={isParsing}
                parseError={parseError}
                parseFile={parseFile}
                documentPreviewPages={documentPreviewPages}
                onExtractHighlightedRegion={extractHighlightedRegion}
                uploadedAttachments={uploadedAttachments}
          uploadDraftStatus={uploadDraftStatus}
          savedUploadDrafts={savedUploadDrafts}
          selectedUploadDraftId={selectedUploadDraftId}
          uploadDraftTitle={uploadDraftTitle}
          setUploadDraftTitle={setUploadDraftTitle}
          uploadDraftMessage={uploadDraftMessage}
          onSaveRequestDraft={saveCurrentUploadRequestDraft}
          onLoadRequestDraft={loadUploadRequestDraft}
          onDeleteRequestDraft={deleteUploadRequestDraft}
          uploadDraftRestoreToken={uploadDraftRestoreToken}
                uploadDraftResetToken={uploadDraftResetToken}
                restoredHighlightGroups={uploadHighlightGroups}
                restoredActiveHighlightGroupId={uploadActiveHighlightGroupId}
                restoredHighlightBoxCounter={uploadHighlightBoxCounter}
                onHighlightDraftChange={updateUploadHighlightDraft}
                onClearRequestDraft={clearUploadRequestDraftFromUi}
                workflowTemplates={templates}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                submissionMessage={submissionMessage}
                onSubmitRequest={submitParsedRequest}
              />
            )}

            {activeTab === "drafts" && (
              <UploadDraftsView
                currentDraft={currentUploadRequestDraft}
                uploadDraftStatus={uploadDraftStatus}
                savedUploadDrafts={savedUploadDrafts}
                workflowTemplates={templates}
                selectedUploadDraftId={selectedUploadDraftId}
                onResumeSavedDraft={resumeUploadRequestDraft}
                onDeleteRequestDraft={deleteUploadRequestDraft}
              />
            )}

            {activeTab === "workflow" && (
              <WorkflowView
                businessDirectory={businessDirectory}
                tasks={tasks}
                workflowTemplates={templates}
                selectedTemplateId={selectedTemplate?.id || ""}
                setSelectedTemplateId={selectTemplateRecord}
                onDeleteTemplate={deleteTemplateRecord}
                adminRecordError={adminRecordError}
                onCreateTemplate={createTemplateRecord}
                onUpdateTemplate={updateTemplateRecord}
                userDirectory={userDirectory}
                activeUser={activeUser}
                onRunWorkflowAction={runWorkflowAction}
              />
            )}

            {activeTab === "admin" && (
              <AdminView
                businessDirectory={businessDirectory}
                adminRecordError={adminRecordError}
                setBusinessDirectory={updateBusinessDirectoryRecords}
                onDeactivateBusinessRecord={(business) =>
                  deactivateAdminRecord({
                    type: "business",
                    businessId: business.id,
                  })
                }
                onDeactivateDepartmentRecord={(business, departmentName) =>
                  deactivateAdminRecord({
                    type: "department",
                    businessId: business.id,
                    departmentName,
                  })
                }
                legacyDepartments={departments}
                userDirectory={userDirectory}
                taskNotifications={taskNotifications}
                roleAssignments={effectiveRoleAssignments}
                setRoleAssignments={updateRoleAssignmentRecords}
                adminAuditEvents={adminAuditEvents}
              />
            )}
    </WorkspaceShell>
  );
}
