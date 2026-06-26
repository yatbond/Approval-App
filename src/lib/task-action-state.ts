import type {
  ApprovalAction,
  TaskCollaborationRequest,
  WorkflowDocumentRequirement,
} from "./types.ts";

export function getTaskActionPreflightState({
  action,
  targetEmail,
  missingCurrentDocuments,
  pendingBlockingContributorRequests = [],
}: {
  action: ApprovalAction;
  targetEmail: string;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
  pendingBlockingContributorRequests?: TaskCollaborationRequest[];
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
    pendingBlockingContributorRequests.length
  ) {
    return {
      canProceed: false,
      errorMessage: `Resolve contributor request(s) before approving: ${pendingBlockingContributorRequests
        .map((request) => request.contributorEmail)
        .join(", ")}.`,
    };
  }

  return { canProceed: true, errorMessage: "" };
}
