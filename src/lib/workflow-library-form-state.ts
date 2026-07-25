import type {
  ApprovalAttachment,
  FormLibraryAttachmentField,
  WorkflowDocumentRequirement,
  WorkflowField,
} from "./types.ts";

export function isLibraryFormRequirement(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
) {
  return Boolean(document.formLibraryRef);
}

export function isMicrosoftFormsRequirement(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
) {
  return document.formLibraryRef?.source === "microsoft_forms";
}

export function getLibraryFormSourceLabel(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
) {
  return isMicrosoftFormsRequirement(document)
    ? "Microsoft Forms"
    : "Approval App form";
}

export function getWorkflowFormAttachmentFields(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
): FormLibraryAttachmentField[] {
  if (document.formLibraryRef?.attachmentFields?.length) {
    return document.formLibraryRef.attachmentFields;
  }
  return (document.formLibraryRef?.selectedAttachmentNames || []).map((name) => ({
    name,
    label: name.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase()),
    required: false,
  }));
}

export function getLocallyEditableWorkflowFormFields(
  document: Pick<WorkflowDocumentRequirement, "fields" | "formLibraryRef">,
) {
  return isMicrosoftFormsRequirement(document) ? [] : document.fields;
}

export function getLocallyUploadableWorkflowFormAttachments(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
) {
  return isMicrosoftFormsRequirement(document)
    ? []
    : getWorkflowFormAttachmentFields(document);
}

export function isUploadedWorkflowFormAttachment(
  attachment: Pick<ApprovalAttachment, "documentId" | "documentType">,
  document: Pick<WorkflowDocumentRequirement, "id">,
  field: Pick<FormLibraryAttachmentField, "name" | "label">,
) {
  const documentType = attachment.documentType.trim().toLowerCase();
  return (
    attachment.documentId === document.id &&
    (documentType === field.name.trim().toLowerCase() ||
      documentType === field.label.trim().toLowerCase())
  );
}

export function getWorkflowFormFieldSourceLabel(
  document: Pick<WorkflowDocumentRequirement, "formLibraryRef">,
  field: Pick<WorkflowField, "inputSource" | "attachmentFieldName">,
) {
  if (field.inputSource === "attachment_extraction") {
    const attachment = getWorkflowFormAttachmentFields(document).find(
      (item) => item.name === field.attachmentFieldName,
    );
    return attachment
      ? `AI from ${attachment.label}`
      : "AI from attachment";
  }
  return isMicrosoftFormsRequirement(document)
    ? "Microsoft Forms answer"
    : "Approval App entry";
}
