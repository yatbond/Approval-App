import type {
  ApprovalAction,
  TaskCollaborationRequest,
  TaskCorrectionRequest,
  TaskSharedFulfillment,
  WorkflowDocumentRequirement,
} from "./types.ts";

export function getTaskActionPreflightState({
  action,
  targetEmail,
  missingCurrentDocuments,
  missingCurrentForms = [],
  missingCurrentDocumentFields = [],
  pendingBlockingContributorRequests = [],
  pendingSharedFulfillments = [],
  pendingCorrectionRequests = [],
  missingRequiredSubmissionLabels = [],
}: {
  action: ApprovalAction;
  targetEmail: string;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
  missingCurrentForms?: Array<{
    document: Pick<WorkflowDocumentRequirement, "documentType">;
  }>;
  missingCurrentDocumentFields?: Array<{
    fields: Array<{ label: string }>;
  }>;
  pendingBlockingContributorRequests?: TaskCollaborationRequest[];
  pendingSharedFulfillments?: TaskSharedFulfillment[];
  pendingCorrectionRequests?: TaskCorrectionRequest[];
  missingRequiredSubmissionLabels?: string[];
}) {
  if ((action === "reassign" || action === "delegate") && !targetEmail.trim()) {
    return { canProceed: false, errorMessage: "" };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    missingCurrentDocuments.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Upload required document(s) before approving: ${missingCurrentDocuments
        .map((document) => document.documentType)
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    missingCurrentForms.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Complete required form(s) before approving: ${missingCurrentForms
        .map((issue) => issue.document.documentType)
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    missingCurrentDocumentFields.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Confirm required extracted value(s) before approving: ${missingCurrentDocumentFields
        .flatMap((issue) => issue.fields.map((field) => field.label))
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    pendingBlockingContributorRequests.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Resolve contributor request(s) before approving: ${pendingBlockingContributorRequests
        .map((request) => request.contributorEmail)
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    pendingSharedFulfillments.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Resolve shared fulfillment confirmation(s) before approving: ${pendingSharedFulfillments
        .map((fulfillment) => fulfillment.documentType)
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    pendingCorrectionRequests.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Resolve correction request(s) before approving: ${pendingCorrectionRequests
        .map((request) => request.id)
        .join(", ")}.`,
    };
  }

  if (
    (action === "approve" || action === "approve_with_comment") &&
    missingRequiredSubmissionLabels.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Resolve required submission(s) before approving: ${missingRequiredSubmissionLabels.join(", ")}.`,
    };
  }

  return { canProceed: true, errorMessage: "" };
}
