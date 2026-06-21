import {
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import type { ApprovalAttachment, WorkflowTemplate } from "./types.ts";

export function getUploadViewState({
  workflowTemplates,
  selectedTemplateId,
  uploadedAttachments,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  uploadedAttachments: ApprovalAttachment[];
}) {
  const selectedTemplate =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];
  const uploadDocuments = selectedTemplate
    ? getSubmissionDocumentRequirements(selectedTemplate)
    : [];
  const uploadedDocumentIds = new Set(
    uploadedAttachments
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );
  const missingRequiredDocuments = selectedTemplate
    ? getMissingRequiredSubmissionDocuments(selectedTemplate, uploadedAttachments)
    : [];

  return {
    selectedTemplate,
    uploadDocuments,
    uploadedDocumentIds,
    missingRequiredDocuments,
  };
}
