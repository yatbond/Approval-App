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
import { isManualFormRequirement } from "./workflow-documents.ts";

type ParseResultLike = {
  fields?: Record<string, string>;
  confidence?: Record<string, string>;
};

export type UploadRequestSubmissionDraft = {
  id: string;
  fileName: string;
  parseResult: ParseResultLike | null;
  editedFields: Record<string, string>;
  uploadedAttachments: ApprovalAttachment[];
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
  if (!selectedTemplate) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "",
    };
  }
  const hasManualFormRequirements = selectedTemplate.documents.some(
    isManualFormRequirement,
  );
  if (!parseResult && !hasManualFormRequirements) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "",
    };
  }
  const effectiveParseResult = parseResult || {
    fields: editedFields,
    confidence: {},
  };

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
    parseResult: effectiveParseResult,
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

export function getWorkspaceBatchRequestSubmissionState({
  selectedTemplate,
  activeUser,
  drafts,
  tasks,
  now,
  taskIdPrefix,
}: {
  selectedTemplate: WorkflowTemplate | null;
  activeUser: ApprovalActor;
  drafts: UploadRequestSubmissionDraft[];
  tasks: ApprovalTask[];
  now?: Date;
  taskIdPrefix?: string;
}) {
  if (drafts.length === 0) {
    return {
      didSubmit: false,
      tasks,
      selectedTaskId: "",
      shouldClearUploadedAttachments: false,
      submissionMessage: "Add at least one request draft before submitting.",
    };
  }

  let nextTasks = tasks;
  const submittedTaskIds: string[] = [];
  const batchTaskIdPrefix =
    taskIdPrefix ||
    (drafts.length > 1
      ? `APR-BATCH-${Math.floor((now || new Date()).getTime() / 1000)}`
      : undefined);

  for (const [index, draft] of drafts.entries()) {
    const nextState = getWorkspaceRequestSubmissionState({
      selectedTemplate,
      parseResult: draft.parseResult,
      activeUser,
      fileName: draft.fileName,
      editedFields: draft.editedFields,
      uploadedAttachments: draft.uploadedAttachments,
      tasks: nextTasks,
      now,
      taskId: batchTaskIdPrefix ? `${batchTaskIdPrefix}-${index + 1}` : undefined,
    });

    if (!nextState.didSubmit) {
      return {
        didSubmit: false,
        tasks,
        selectedTaskId: "",
        shouldClearUploadedAttachments: false,
        submissionMessage: `Request ${index + 1} (${draft.fileName || draft.id}): ${
          nextState.submissionMessage || "Unable to submit this request."
        }`,
      };
    }

    nextTasks = nextState.tasks;
    submittedTaskIds.push(nextState.selectedTaskId);
  }

  const latestTaskId = submittedTaskIds[submittedTaskIds.length - 1] || "";
  return {
    didSubmit: true,
    tasks: nextTasks,
    selectedTaskId: latestTaskId,
    shouldClearUploadedAttachments: true,
    submissionMessage: `${submittedTaskIds.length} requests submitted and routed. Latest request: ${latestTaskId}. They are now visible in Tracking.`,
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
