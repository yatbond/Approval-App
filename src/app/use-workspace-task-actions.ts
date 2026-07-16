"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { buildCollaborationNotifications } from "@/lib/collaboration-notification-state";
import {
  getApprovalActionConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import {
  getTaskCorrectionUploadState,
  getTaskSharedFulfillmentDecisionState,
} from "@/lib/shared-fulfillment-state";
import {
  getTaskContributorRequestState,
  getTaskContributorUploadState,
} from "@/lib/task-collaboration-state";
import { attachDocumentToTaskState } from "@/lib/task-document-attachment-state";
import { saveTaskFormValuesState } from "@/lib/task-form-values-state";
import type {
  ApprovalAction,
  ApprovalAttachment,
  ApprovalTask,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import type { UserDirectoryEntry } from "@/lib/user-directory";
import { persistWorkspaceCollaborationTransition } from "@/lib/workspace-collaboration-api";
import {
  getWorkspaceRecordTaskActionState,
  getWorkspaceRunnerTaskActionState,
} from "@/lib/workspace-task-action-state";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import {
  createWorkflowTestRequestState,
} from "@/lib/workflow-test-request-state";
import {
  mergeTaskNotifications,
  type TaskNotification,
} from "@/lib/workflow-system";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export function useWorkspaceTaskActions({
  activeUser,
  buildWorkspaceSnapshot,
  persistWorkspaceSnapshot,
  requestConfirmation,
  selectedTask,
  sendWorkflowEmailNotifications,
  setSelectedTaskId,
  setTasks,
  tasks,
  templates,
}: {
  activeUser: UserDirectoryEntry;
  buildWorkspaceSnapshot: (
    patch?: Partial<WorkspaceStateSnapshot>,
  ) => WorkspaceStateSnapshot;
  persistWorkspaceSnapshot: (snapshot: WorkspaceStateSnapshot) => Promise<unknown>;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
  selectedTask: ApprovalTask | null;
  sendWorkflowEmailNotifications: (
    task: ApprovalTask,
    notificationsOverride?: TaskNotification[],
  ) => Promise<void>;
  setSelectedTaskId: StateSetter<string>;
  setTasks: StateSetter<ApprovalTask[]>;
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
}) {
  const [comment, setComment] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [contributorEmail, setContributorEmail] = useState("");
  const [contributorRequestNote, setContributorRequestNote] = useState("");
  const [contributorDueAt, setContributorDueAt] = useState("");
  const [contributorBlocksApproval, setContributorBlocksApproval] = useState(true);
  const [contributorRequestError, setContributorRequestError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSubmissionTaskId, setActionSubmissionTaskId] = useState("");
  const actionSubmissionTaskIdRef = useRef("");

  async function recordAction(
    action: ApprovalAction,
    returnTargetNodeIds: string[] = [],
  ) {
    if (!selectedTask || actionSubmissionTaskIdRef.current) {
      return;
    }

    const nextState = getWorkspaceRecordTaskActionState({
      tasks,
      selectedTask,
      templates,
      activeUser,
      action,
      comment,
      targetEmail,
      returnTargetNodeIds,
    });

    if (!nextState.didApply) {
      if (nextState.actionError) {
        setActionError(nextState.actionError);
      }
      return;
    }

    actionSubmissionTaskIdRef.current = selectedTask.id;
    setActionSubmissionTaskId(selectedTask.id);
    setTasks(nextState.tasks);
    try {
      await persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
      );
      const changedTask = nextState.tasks.find(
        (task) => task.id === selectedTask.id,
      );
      if (changedTask) {
        void sendWorkflowEmailNotifications(changedTask);
      }
      if (nextState.shouldClearInputs) {
        setComment("");
        setTargetEmail("");
      }
      setActionError(nextState.actionError);
    } catch (error) {
      setTasks(tasks);
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to save this task decision.",
      );
    } finally {
      actionSubmissionTaskIdRef.current = "";
      setActionSubmissionTaskId("");
    }
  }

  async function confirmRecordAction(
    action: ApprovalAction,
    returnTargetNodeIds: string[] = [],
  ) {
    const confirmation = getApprovalActionConfirmation({
      action,
      taskTitle: selectedTask?.title || "this request",
      targetEmail,
    });
    if (confirmation && !(await requestConfirmation(confirmation))) {
      return;
    }

    await recordAction(action, returnTargetNodeIds);
  }

  async function requestTaskContributor() {
    if (!selectedTask) {
      return;
    }

    const result = getTaskContributorRequestState({
      task: selectedTask,
      actor: activeUser,
      contributorName,
      contributorEmail,
      requestNote: contributorRequestNote,
      dueAt: contributorDueAt,
      blocksApproval: contributorBlocksApproval,
    });
    if (!result.didApply) {
      setContributorRequestError(result.errorMessage);
      return;
    }

    try {
      await persistWorkspaceCollaborationTransition({
        task: result.task,
        notifications: [],
      });
      const nextTasks = tasks.map((task) =>
        task.id === selectedTask.id ? result.task : task,
      );
      setTasks(nextTasks);
      void sendWorkflowEmailNotifications(result.task);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setContributorName("");
      setContributorEmail("");
      setContributorRequestNote("");
      setContributorDueAt("");
      setContributorBlocksApproval(true);
      setContributorRequestError("");
    } catch (error) {
      setContributorRequestError(
        error instanceof Error
          ? error.message
          : "Unable to persist contributor request.",
      );
    }
  }

  async function submitContributorRequestUpload({
    taskId,
    collaborationRequestId,
    requestNote,
    file,
  }: {
    taskId: string;
    collaborationRequestId: string;
    requestNote: string;
    file: File;
  }) {
    try {
      const [pdfPages, workspaceFiles] = await Promise.all([
        import("@/lib/pdf-page-images"),
        import("@/lib/workspace-file-api"),
      ]);
      const {
        getPdfOcrRenderOptions,
        renderPdfFileToPageImages,
        shouldRenderPdfForVision,
      } = pdfPages;
      const { parseWorkspaceFile, uploadWorkspaceAttachmentFile } = workspaceFiles;
      const storage = await uploadWorkspaceAttachmentFile({ file });
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      const payload = await parseWorkspaceFile({
        file,
        pageImages,
        adHocFields: [
          {
            name: "contributor_response",
            label: "Contributor",
            type: "text",
            required: false,
            source: "ai",
            instructions:
              requestNote ||
              "Extract the key submitted information from this contributor document.",
          },
        ],
      });
      const attachment: ApprovalAttachment = {
        id: `contributor-${Date.now()}-${file.name}`,
        fileName: file.name,
        documentType: "Contributor upload",
        format: "ad_hoc",
        storagePath: storage.storagePath,
        publicUrl: storage.publicUrl,
        uploadedBy: activeUser.email,
        uploadedAt: new Date().toISOString(),
      };
      const task = tasks.find((item) => item.id === taskId);
      if (!task) {
        setActionError("Task was not found.");
        return;
      }
      const result = getTaskContributorUploadState({
        task,
        collaborationRequestId,
        actor: activeUser,
        attachment,
        extractedFields: payload.fields || {},
      });
      if (!result.didApply) {
        setActionError(result.errorMessage);
        return;
      }

      const collaborationNotifications = buildCollaborationNotifications({
        task: result.task,
        event: {
          type: "contributor_submitted",
          collaborationRequestId,
        },
      });
      await persistWorkspaceCollaborationTransition({
        task: result.task,
        notifications: collaborationNotifications,
      });
      const nextTasks = tasks.map((item) =>
        item.id === taskId ? result.task : item,
      );
      setTasks(nextTasks);
      void sendWorkflowEmailNotifications(result.task, collaborationNotifications);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to submit contributor upload.",
      );
    }
  }

  async function decideSharedFulfillment({
    taskId,
    fulfillmentId,
    decision,
    note,
  }: {
    taskId: string;
    fulfillmentId: string;
    decision: "confirm" | "reject";
    note?: string;
  }) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      setActionError("Task was not found.");
      return;
    }
    const result = getTaskSharedFulfillmentDecisionState({
      task,
      fulfillmentId,
      actor: activeUser,
      currentOwnerEmail: task.currentOwner,
      decision,
      note,
    });
    if (!result.didApply) {
      setActionError(result.errorMessage);
      return;
    }

    const notifications = mergeTaskNotifications([
      ...buildCollaborationNotifications({
        task: result.task,
        event: {
          type: decision === "confirm" ? "shared_confirmed" : "shared_rejected",
          fulfillmentId,
        },
      }),
      ...(decision === "reject"
        ? buildCollaborationNotifications({
            task: result.task,
            event: {
              type: "correction_created",
              correctionRequestId:
                result.task.sharedFulfillments?.find((item) => item.id === fulfillmentId)
                  ?.correctionRequestId || "",
            },
          })
        : []),
    ]);

    try {
      await persistWorkspaceCollaborationTransition({
        task: result.task,
        notifications,
      });
      const nextTasks = tasks.map((item) =>
        item.id === taskId ? result.task : item,
      );
      setTasks(nextTasks);
      void sendWorkflowEmailNotifications(result.task, notifications);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to persist shared fulfillment decision.",
      );
    }
  }

  async function submitCorrectionUpload({
    taskId,
    correctionRequestId,
    file,
  }: {
    taskId: string;
    correctionRequestId: string;
    file: File;
  }) {
    try {
      const [pdfPages, workspaceFiles] = await Promise.all([
        import("@/lib/pdf-page-images"),
        import("@/lib/workspace-file-api"),
      ]);
      const {
        getPdfOcrRenderOptions,
        renderPdfFileToPageImages,
        shouldRenderPdfForVision,
      } = pdfPages;
      const { parseWorkspaceFile, uploadWorkspaceAttachmentFile } = workspaceFiles;
      const storage = await uploadWorkspaceAttachmentFile({ file });
      const pageImages = shouldRenderPdfForVision(file)
        ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
        : [];
      const payload = await parseWorkspaceFile({
        file,
        pageImages,
        adHocFields: [
          {
            name: "correction_response",
            label: "Correction",
            type: "text",
            required: false,
            source: "ai",
            instructions:
              "Extract the corrected information from this resubmitted document.",
          },
        ],
      });
      const attachment: ApprovalAttachment = {
        id: `correction-${Date.now()}-${file.name}`,
        fileName: file.name,
        documentType: "Correction upload",
        format: "ad_hoc",
        storagePath: storage.storagePath,
        publicUrl: storage.publicUrl,
        uploadedBy: activeUser.email,
        uploadedAt: new Date().toISOString(),
      };
      const task = tasks.find((item) => item.id === taskId);
      if (!task) {
        setActionError("Task was not found.");
        return;
      }
      const result = getTaskCorrectionUploadState({
        task,
        correctionRequestId,
        actor: activeUser,
        attachment,
        extractedFields: payload.fields || {},
      });
      if (!result.didApply) {
        setActionError(result.errorMessage);
        return;
      }
      const correction = result.task.correctionRequests?.find(
        (item) => item.id === correctionRequestId,
      );
      const notifications = mergeTaskNotifications([
        ...buildCollaborationNotifications({
          task: result.task,
          event: {
            type: "correction_resolved",
            correctionRequestId,
          },
        }),
        ...(correction?.resolvedByFulfillmentId
          ? buildCollaborationNotifications({
              task: result.task,
              event: {
                type: "shared_pending_confirmation",
                fulfillmentId: correction.resolvedByFulfillmentId,
              },
            })
          : []),
      ]);

      await persistWorkspaceCollaborationTransition({
        task: result.task,
        notifications,
      });
      const nextTasks = tasks.map((item) =>
        item.id === taskId ? result.task : item,
      );
      setTasks(nextTasks);
      void sendWorkflowEmailNotifications(result.task, notifications);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError("");
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to submit correction upload.",
      );
    }
  }

  async function attachTaskDocument(
    taskId: string,
    file: File,
    documentRequirement: WorkflowDocumentRequirement,
  ) {
    try {
      const [pdfPages, workspaceFiles] = await Promise.all([
        import("@/lib/pdf-page-images"),
        import("@/lib/workspace-file-api"),
      ]);
      const {
        getPdfOcrRenderOptions,
        renderPdfFileToPageImages,
        shouldRenderPdfForVision,
      } = pdfPages;
      const { parseWorkspaceFile, uploadWorkspaceAttachmentFile } = workspaceFiles;
      const storage = await uploadWorkspaceAttachmentFile({
        file,
        documentRequirement,
      });
      let extractedFields: Record<string, string> = {};
      let extractionWarning = "";
      if (documentRequirement.fields.length) {
        try {
          const pageImages = shouldRenderPdfForVision(file)
            ? await renderPdfFileToPageImages(file, getPdfOcrRenderOptions())
            : [];
          const parsed = await parseWorkspaceFile({
            file,
            documentRequirement,
            pageImages,
          });
          extractedFields = parsed.fields || {};
        } catch (error) {
          extractionWarning = `Document uploaded, but AI/OCR could not extract its values. Enter them in Document data before approving. ${
            error instanceof Error ? error.message : ""
          }`.trim();
        }
      }
      const nextTasks = attachDocumentToTaskState({
        tasks,
        templates,
        taskId,
        file,
        documentRequirement,
        activeUser,
        storagePath: storage.storagePath,
        publicUrl: storage.publicUrl,
        extractedFields,
      });
      setTasks(nextTasks);
      void persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: nextTasks }),
      );
      setActionError(extractionWarning);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to upload document.",
      );
    }
  }

  async function saveTaskFormValues(
    taskId: string,
    values: Record<string, string>,
  ) {
    const result = saveTaskFormValuesState({
      tasks,
      taskId,
      values,
      actor: activeUser,
    });
    if (!result.didUpdate) {
      setActionError("");
      return;
    }
    setTasks(result.tasks);
    try {
      await persistWorkspaceSnapshot(
        buildWorkspaceSnapshot({ approvalTasks: result.tasks }),
      );
      setActionError("");
    } catch (error) {
      setTasks(tasks);
      setActionError(
        error instanceof Error ? error.message : "Unable to save form values.",
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
    const changedTask = nextState.tasks.find((task) => task.id === taskId);
    if (changedTask) {
      void sendWorkflowEmailNotifications(changedTask);
    }
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: nextState.tasks }),
    );
    if (nextState.selectedTaskId) {
      setSelectedTaskId(nextState.selectedTaskId);
    }
  }

  function createWorkflowTestRequest(
    template: WorkflowTemplate,
    testerEmail: string,
  ) {
    const result = createWorkflowTestRequestState({
      tasks,
      template,
      testerEmail,
      startedByEmail: activeUser.email,
    });
    if (!result.didCreate || !result.task) {
      return result;
    }

    setTasks(result.tasks);
    setSelectedTaskId(result.task.id);
    void persistWorkspaceSnapshot(
      buildWorkspaceSnapshot({ approvalTasks: result.tasks }),
    );
    void sendWorkflowEmailNotifications(result.task);
    return result;
  }

  return {
    actionError,
    actionSubmissionTaskId,
    attachTaskDocument,
    comment,
    confirmRecordAction,
    contributorBlocksApproval,
    contributorDueAt,
    contributorEmail,
    contributorName,
    contributorRequestError,
    contributorRequestNote,
    createWorkflowTestRequest,
    decideSharedFulfillment,
    requestTaskContributor,
    runWorkflowAction,
    saveTaskFormValues,
    setComment,
    setContributorBlocksApproval,
    setContributorDueAt,
    setContributorEmail,
    setContributorName,
    setContributorRequestNote,
    setTargetEmail,
    submitContributorRequestUpload,
    submitCorrectionUpload,
    targetEmail,
  };
}
