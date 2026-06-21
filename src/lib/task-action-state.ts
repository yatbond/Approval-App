import type {
  ApprovalAction,
  WorkflowDocumentRequirement,
} from "./types.ts";

export function getTaskActionPreflightState({
  action,
  targetEmail,
  missingCurrentDocuments,
}: {
  action: ApprovalAction;
  targetEmail: string;
  missingCurrentDocuments: WorkflowDocumentRequirement[];
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

  return { canProceed: true, errorMessage: "" };
}
