"use client";

import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  appendExtractionExamplesToTemplate,
  buildExtractionTrainingExamples,
} from "@/lib/template-recognition-state";
import type {
  ApprovalAttachment,
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import {
  getWorkspaceParseFileStartState,
  getWorkspaceParseFileStoredAttachmentState,
  getWorkspaceParseFileSuccessState,
  mergeParsedWorkspaceFilePayload,
} from "@/lib/workspace-parse-file-state";
import {
  parseWorkspaceFile,
  uploadWorkspaceAttachmentFile,
  type ParsedWorkspaceFilePayload,
} from "@/lib/workspace-file-api";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import type { WorkspaceSyncResult } from "@/lib/workspace-sync";
import {
  getWorkspaceBatchRequestSubmissionState,
  getWorkspaceRequestSubmissionPersistenceMessage,
  getWorkspaceRequestSubmissionState,
} from "@/lib/workspace-request-submission-state";
import type { WorkflowParticipantEmailMap } from "@/lib/workflow-participant-assignment-state";
import type { TaskNotification } from "@/lib/workflow-system";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type UploadRequestDraftRow = {
  id: string;
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
  parsedDocumentId?: string;
  documentPreviewPages: DocumentPreviewPage[];
};

type ParseFileOptions = {
  preserveExistingRequestData?: boolean;
  mergeIntoCurrentRequest?: boolean;
  skipExtraction?: boolean;
};

async function buildDocumentPreviewPages(file: File) {
  if (isPdfFile(file)) {
    return buildPreviewPagesFromPdfImages(
      await renderPdfFileToPageImages(file, getPdfPreviewRenderOptions()),
    );
  }
  if (file.type.startsWith("image/")) {
    return [await readImageFileAsPreviewPage(file)];
  }
  return [];
}

export function useWorkspaceRequestPipeline({
  activeUser,
  buildWorkspaceSnapshot,
  deleteUploadRequestDraft,
  editedFields,
  fileName,
  parseResult,
  parsedDocumentId,
  persistWorkspaceSnapshot,
  requestParticipantEmails,
  resetUploadRequestDraftState,
  selectedTemplate,
  selectedUploadDraftId,
  selectedUploadRequestDraftRowId,
  sendWorkflowEmailNotifications,
  setDocumentPreviewPages,
  setEditedFields,
  setFileName,
  setParsedDocumentId,
  setParseResult,
  setSelectedTaskId,
  setSelectedUploadRequestDraftRowId,
  setTasks,
  setTemplates,
  setUploadedAttachments,
  setUploadRequestDraftRows,
  tasks,
  templates,
  uploadedAttachments,
  uploadRequestDraftRows,
  uploadRequestDraftStorageKey,
}: {
  activeUser: UserDirectoryEntry;
  buildWorkspaceSnapshot: (
    patch?: Partial<WorkspaceStateSnapshot>,
  ) => WorkspaceStateSnapshot;
  deleteUploadRequestDraft: (draftId: string) => Promise<void>;
  editedFields: Record<string, string>;
  fileName: string;
  parseResult: ParsedWorkspaceFilePayload | null;
  parsedDocumentId?: string;
  persistWorkspaceSnapshot: (
    snapshot: WorkspaceStateSnapshot,
  ) => Promise<WorkspaceSyncResult>;
  requestParticipantEmails: WorkflowParticipantEmailMap;
  resetUploadRequestDraftState: () => void;
  selectedTemplate: WorkflowTemplate;
  selectedUploadDraftId: string;
  selectedUploadRequestDraftRowId: string;
  sendWorkflowEmailNotifications: (
    task: ApprovalTask,
    notificationsOverride?: TaskNotification[],
  ) => Promise<void>;
  setDocumentPreviewPages: StateSetter<DocumentPreviewPage[]>;
  setEditedFields: StateSetter<Record<string, string>>;
  setFileName: StateSetter<string>;
  setParsedDocumentId: StateSetter<string | undefined>;
  setParseResult: StateSetter<ParsedWorkspaceFilePayload | null>;
  setSelectedTaskId: StateSetter<string>;
  setSelectedUploadRequestDraftRowId: StateSetter<string>;
  setTasks: StateSetter<ApprovalTask[]>;
  setTemplates: StateSetter<WorkflowTemplate[]>;
  setUploadedAttachments: StateSetter<ApprovalAttachment[]>;
  setUploadRequestDraftRows: StateSetter<UploadRequestDraftRow[]>;
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
  uploadedAttachments: ApprovalAttachment[];
  uploadRequestDraftRows: UploadRequestDraftRow[];
  uploadRequestDraftStorageKey: string;
}) {
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");

  async function parseFile(
    file: File,
    documentRequirement?: WorkflowDocumentRequirement,
    adHocFields: WorkflowField[] = [],
    options: ParseFileOptions = {},
  ) {
    const startState = getWorkspaceParseFileStartState(file);
    const currentRow = options.mergeIntoCurrentRequest
      ? uploadRequestDraftRows.find(
          (row) => row.id === selectedUploadRequestDraftRowId,
        )
      : undefined;
    const baseParseResult = options.preserveExistingRequestData
      ? currentRow?.parseResult || parseResult
      : null;
    const baseEditedFields = options.preserveExistingRequestData
      ? currentRow?.editedFields || editedFields
      : {};
    const baseAttachments = options.preserveExistingRequestData
      ? currentRow?.uploadedAttachments || uploadedAttachments
      : [];
    setFileName(startState.fileName);
    setParseError(startState.parseError);
    setSubmissionMessage(startState.submissionMessage);
    setIsParsing(startState.isParsing);
    if (!options.preserveExistingRequestData) {
      setParseResult(startState.parseResult);
      setEditedFields(startState.editedFields);
    }
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

    const storedAttachmentState = getWorkspaceParseFileStoredAttachmentState({
      uploadedAttachments: [],
      selectedTemplate,
      file,
      documentRequirement,
      activeUser,
      storagePath: storage?.storagePath,
      publicUrl: storage?.publicUrl,
    });
    const storedAttachment = storedAttachmentState.uploadedAttachments[0];
    const nextAttachments = storedAttachment
      ? [...baseAttachments, storedAttachment]
      : baseAttachments;
    const nextUploadedAttachments = options.preserveExistingRequestData
      ? nextAttachments
      : storedAttachment
        ? [...uploadedAttachments, storedAttachment]
        : uploadedAttachments;
    setUploadedAttachments(nextUploadedAttachments);

    try {
      if (options.skipExtraction) {
        const nextDocumentPreviewPages = await buildDocumentPreviewPages(file);
        setDocumentPreviewPages(nextDocumentPreviewPages);
        setParseResult(baseParseResult);
        setEditedFields(baseEditedFields);
        setIsParsing(false);
        if (currentRow && options.mergeIntoCurrentRequest) {
          const nextRow: UploadRequestDraftRow = {
            ...currentRow,
            uploadedAttachments: nextAttachments,
            documentPreviewPages: nextDocumentPreviewPages,
          };
          setUploadRequestDraftRows((rows) =>
            rows.map((row) => (row.id === nextRow.id ? nextRow : row)),
          );
        } else {
          const nextRow: UploadRequestDraftRow = {
            id: crypto.randomUUID(),
            fileName: file.name,
            parseResult: baseParseResult,
            editedFields: baseEditedFields,
            uploadedAttachments: nextAttachments,
            parsedDocumentId: documentRequirement?.id,
            documentPreviewPages: nextDocumentPreviewPages,
          };
          setUploadRequestDraftRows((rows) => [...rows, nextRow]);
          setSelectedUploadRequestDraftRowId(nextRow.id);
        }
        return;
      }
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      const nextDocumentPreviewPages = await buildDocumentPreviewPages(file);
      setDocumentPreviewPages(nextDocumentPreviewPages);
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
      const nextParseResult = options.preserveExistingRequestData
        ? mergeParsedWorkspaceFilePayload(baseParseResult, successState.parseResult)
        : successState.parseResult;
      const nextEditedFields = options.preserveExistingRequestData
        ? { ...baseEditedFields, ...successState.editedFields }
        : successState.editedFields;
      setParseResult(nextParseResult);
      setEditedFields(nextEditedFields);
      setIsParsing(successState.isParsing);
      if (currentRow && options.mergeIntoCurrentRequest) {
        const nextRow: UploadRequestDraftRow = {
          ...currentRow,
          parseResult: nextParseResult,
          editedFields: nextEditedFields,
          uploadedAttachments: nextAttachments,
          parsedDocumentId: documentRequirement?.id || currentRow.parsedDocumentId,
          documentPreviewPages: nextDocumentPreviewPages,
        };
        setUploadRequestDraftRows((rows) =>
          rows.map((row) => (row.id === nextRow.id ? nextRow : row)),
        );
      } else {
        const nextRow: UploadRequestDraftRow = {
          id: crypto.randomUUID(),
          fileName: file.name,
          parseResult: nextParseResult,
          editedFields: nextEditedFields,
          uploadedAttachments: nextAttachments,
          parsedDocumentId: documentRequirement?.id,
          documentPreviewPages: nextDocumentPreviewPages,
        };
        setUploadRequestDraftRows((rows) => [...rows, nextRow]);
        setSelectedUploadRequestDraftRowId(nextRow.id);
      }
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
      const payloadFields = payload.fields || {};
      setParseResult((current) => {
        const nextParseResult = {
        ...(current || payload),
        fields: {
          ...(current?.fields || {}),
          ...payloadFields,
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
        };
        if (selectedUploadRequestDraftRowId) {
          setUploadRequestDraftRows((rows) =>
            rows.map((row) =>
              row.id === selectedUploadRequestDraftRowId
                ? { ...row, parseResult: nextParseResult }
                : row,
            ),
          );
        }
        return nextParseResult;
      });
      setEditedFields((current) => ({
        ...current,
        ...payloadFields,
      }));
      if (selectedUploadRequestDraftRowId) {
        setUploadRequestDraftRows((rows) =>
          rows.map((row) =>
            row.id === selectedUploadRequestDraftRowId
              ? {
                  ...row,
                  editedFields: {
                    ...row.editedFields,
                    ...payloadFields,
                  },
                }
              : row,
          ),
        );
      }
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

  async function submitParsedRequest(
    participantEmails: WorkflowParticipantEmailMap = requestParticipantEmails,
  ) {
    const nextState = getWorkspaceRequestSubmissionState({
      selectedTemplate,
      participantEmails,
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
    const submittedTask = nextState.tasks.find(
      (task) => task.id === nextState.selectedTaskId,
    );
    if (submittedTask) {
      void sendWorkflowEmailNotifications(submittedTask);
    }
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
    const syncResult = await persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        approvalTasks: nextState.tasks,
        workflowTemplates: nextTemplates,
      }),
    );
    setSubmissionMessage(
      getWorkspaceRequestSubmissionPersistenceMessage({
        submissionMessage: nextState.submissionMessage,
        syncMode: syncResult.mode,
        syncReason: syncResult.mode === "local" ? syncResult.reason : undefined,
      }),
    );
  }

  async function submitAllParsedRequests(
    participantEmails: WorkflowParticipantEmailMap = requestParticipantEmails,
  ) {
    if (uploadRequestDraftRows.length < 2) {
      await submitParsedRequest(participantEmails);
      return;
    }

    const nextState = getWorkspaceBatchRequestSubmissionState({
      selectedTemplate,
      participantEmails,
      activeUser,
      drafts: uploadRequestDraftRows.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        parseResult: row.parseResult,
        editedFields: row.editedFields,
        uploadedAttachments: row.uploadedAttachments,
      })),
      tasks,
      taskIdPrefix: `APR-BATCH-${Math.floor(Date.now() / 1000)}`,
    });

    if (!nextState.didSubmit) {
      setSubmissionMessage(nextState.submissionMessage);
      return;
    }

    const extractionExamples = selectedTemplate
      ? uploadRequestDraftRows.flatMap((row) =>
          buildExtractionTrainingExamples({
            template: selectedTemplate,
            documentId: row.parsedDocumentId,
            parseFields: row.parseResult?.fields || {},
            correctedFields: row.editedFields,
            evidence: row.parseResult?.evidence || {},
            sourceFileName: row.fileName,
            actorEmail: activeUser.email,
          }),
        )
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
    const previousTaskIds = new Set(tasks.map((task) => task.id));
    const submittedTasks = nextState.tasks.filter(
      (task) => !previousTaskIds.has(task.id),
    );

    setTasks(nextState.tasks);
    submittedTasks.forEach((task) => {
      void sendWorkflowEmailNotifications(task);
    });
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
    const syncResult = await persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({
        approvalTasks: nextState.tasks,
        workflowTemplates: nextTemplates,
      }),
    );
    setSubmissionMessage(
      getWorkspaceRequestSubmissionPersistenceMessage({
        submissionMessage: nextState.submissionMessage,
        syncMode: syncResult.mode,
        syncReason: syncResult.mode === "local" ? syncResult.reason : undefined,
      }),
    );
  }

  return {
    extractHighlightedRegion,
    isParsing,
    parseError,
    parseFile,
    setIsParsing,
    setParseError,
    setSubmissionMessage,
    submissionMessage,
    submitAllParsedRequests,
    submitParsedRequest,
  };
}
