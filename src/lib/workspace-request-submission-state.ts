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
  confidence?: Record<string, string>;
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

  if (selectedTemplate.isArchived === true) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "Archived workflow templates cannot create new requests.",
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

  const missingRequiredFields = getMissingRequiredExtractedFields({
    selectedTemplate,
    editedFields,
  });
  if (missingRequiredFields.length) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: `Missing required extracted field(s): ${missingRequiredFields.join(", ")}.`,
    };
  }

  const lowConfidenceFields = getLowConfidenceExtractedFields({
    parseResult,
    editedFields,
  });
  if (lowConfidenceFields.length) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: `Review low confidence field(s) before submitting: ${lowConfidenceFields.join(", ")}.`,
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

export function getWorkspaceRequestSubmissionPersistenceMessage({
  submissionMessage,
  syncMode,
  syncReason,
}: {
  submissionMessage: string;
  syncMode: "supabase" | "local";
  syncReason?: string;
}) {
  if (syncMode === "supabase") {
    return `${submissionMessage} Saved to Supabase.`;
  }

  return `${submissionMessage} Saved locally. Supabase save failed: ${
    syncReason || "Remote save unavailable"
  }.`;
}

function getMissingRequiredExtractedFields({
  selectedTemplate,
  editedFields,
}: {
  selectedTemplate: WorkflowTemplate;
  editedFields: Record<string, string>;
}) {
  const requiredFields = [
    ...selectedTemplate.fields,
    ...selectedTemplate.documents.flatMap((document) => document.fields),
  ].filter((field) => field.required);

  return requiredFields
    .filter((field) => {
      const labelValue = editedFields[field.label]?.trim();
      const nameValue = editedFields[field.name]?.trim();
      return !labelValue && !nameValue;
    })
    .map((field) => field.label);
}

function getLowConfidenceExtractedFields({
  parseResult,
  editedFields,
}: {
  parseResult: ParseResultLike;
  editedFields: Record<string, string>;
}) {
  return Object.entries(parseResult.confidence || {})
    .filter(([field, confidence]) => confidence === "low" && editedFields[field]?.trim())
    .map(([field]) => field);
}
