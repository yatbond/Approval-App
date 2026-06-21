import type {
  ApprovalActor,
  ApprovalAttachment,
  ApprovalTask,
  WorkflowTemplate,
} from "./types.ts";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredSubmissionDocuments,
} from "./request-builder.ts";

type ParseResultLike = {
  fields?: Record<string, string>;
};

export function getWorkspaceRequestSubmissionState({
  selectedTemplate,
  parseResult,
  activeUser,
  fileName,
  editedFields,
  uploadedAttachments,
  tasks,
  now,
  taskId,
}: {
  selectedTemplate: WorkflowTemplate | null;
  parseResult: ParseResultLike | null;
  activeUser: ApprovalActor;
  fileName: string;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
  tasks: ApprovalTask[];
  now?: Date;
  taskId?: string;
}) {
  if (!selectedTemplate || !parseResult) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "",
    };
  }

  if (selectedTemplate.isDraft === true) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "Publish this workflow template before creating requests from it.",
    };
  }

  const missingRequiredDocuments = getMissingRequiredSubmissionDocuments(
    selectedTemplate,
    uploadedAttachments,
  );
  if (missingRequiredDocuments.length) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: `Missing required upload(s): ${missingRequiredDocuments
        .map((document) => document.documentType)
        .join(", ")}.`,
    };
  }

  const task = createApprovalTaskFromTemplate({
    id: taskId,
    now,
    requester: activeUser,
    template: selectedTemplate,
    sourceFileName: fileName,
    extractedFields: editedFields,
    attachments: uploadedAttachments,
  });
  const nextTasks = [task, ...tasks];

  return {
    didSubmit: true,
    tasks: nextTasks,
    selectedTaskId: task.id,
    shouldClearUploadedAttachments: true,
    submissionMessage: `${task.id} submitted and routed to ${task.currentOwner}. It is now visible in Tracking.`,
  };
}
