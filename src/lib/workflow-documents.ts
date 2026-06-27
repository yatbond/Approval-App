import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";
import type {
  ApprovalAttachment,
  DocumentFormat,
  WorkflowDocumentInputMode,
  WorkflowDocumentRequirement,
  WorkflowField,
  WorkflowTemplate,
} from "./types.ts";

export const documentFormatOptions: { value: DocumentFormat; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "excel_csv", label: "Excel/CSV" },
];

export const documentInputModeOptions: {
  value: WorkflowDocumentInputMode;
  label: string;
}[] = [
  { value: "upload", label: "OCR upload" },
  { value: "manual_form", label: "Manual form" },
];

export type CreateAttachmentRecordInput = {
  file: { name: string };
  documentRequirement?: WorkflowDocumentRequirement;
  template: WorkflowTemplate;
  uploadedBy: string;
  storagePath?: string;
  publicUrl?: string;
  idPrefix?: string;
  uploadedAt?: string;
};

export function formatDocumentFormat(format: DocumentFormat | string) {
  return (
    documentFormatOptions.find((option) => option.value === format)?.label ||
    "Document"
  );
}

export function getDocumentInputMode(
  documentRequirement: Pick<WorkflowDocumentRequirement, "inputMode">,
): WorkflowDocumentInputMode {
  return documentRequirement.inputMode || "upload";
}

export function isManualFormRequirement(
  documentRequirement: Pick<WorkflowDocumentRequirement, "inputMode">,
) {
  return getDocumentInputMode(documentRequirement) === "manual_form";
}

export function formatDocumentInputMode(inputMode: WorkflowDocumentInputMode) {
  return (
    documentInputModeOptions.find((option) => option.value === inputMode)?.label ||
    "OCR upload"
  );
}

export function acceptForDocumentFormat(format: DocumentFormat) {
  if (format === "text") {
    return ".txt,.md,.rtf";
  }

  if (format === "pdf") {
    return ".pdf";
  }

  if (format === "image") {
    return ".png,.jpg,.jpeg,.webp";
  }

  return ".xlsx,.xls,.csv";
}

export function fieldSourceForDocumentFormat(
  format: DocumentFormat,
): WorkflowField["source"] {
  if (format === "excel_csv") {
    return "excel";
  }

  if (format === "image") {
    return "ai";
  }

  if (format === "text") {
    return "manual";
  }

  return "ocr";
}

export function createAttachmentRecord({
  file,
  documentRequirement,
  template,
  uploadedBy,
  storagePath,
  publicUrl,
  idPrefix = `attachment-${Date.now()}`,
  uploadedAt = new Date().toISOString(),
}: CreateAttachmentRecordInput): ApprovalAttachment {
  const graph = createWorkflowGraphFromTemplate(template);
  const workflowNode = documentRequirement
    ? graph.nodes.find((node) => node.documentIds?.includes(documentRequirement.id))
    : undefined;

  return {
    id: `${idPrefix}-${file.name}`,
    fileName: file.name,
    documentId: documentRequirement?.id,
    documentType: documentRequirement?.documentType || "Ad hoc document",
    format: documentRequirement?.format || "ad_hoc",
    workflowNodeId: workflowNode?.id,
    storagePath,
    publicUrl,
    uploadedBy,
    uploadedAt,
  };
}
