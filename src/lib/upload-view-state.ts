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
  const requestTemplates = workflowTemplates.filter(
    (template) => template.isDraft !== true,
  );
  const selectedTemplate =
    requestTemplates.find((template) => template.id === selectedTemplateId) ||
    requestTemplates[0];
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
    requestTemplates,
    selectedTemplate,
    uploadDocuments,
    uploadedDocumentIds,
    missingRequiredDocuments,
  };
}
