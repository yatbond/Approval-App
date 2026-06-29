import type {
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "./types.ts";
import { updateWorkflowDocumentRequirement } from "./workflow-graph.ts";

type UpdateDocumentRequirementInput = Partial<
  Pick<
    WorkflowDocumentRequirement,
    "documentType" | "format" | "inputMode" | "required" | "sample"
  >
>;

export function getWorkflowTemplateDocumentState({
  template,
  documents,
}: {
  template: WorkflowTemplate;
  documents: WorkflowDocumentRequirement[];
}) {
  return {
    template: {
      ...template,
      documentTypes: documents.map((document) => document.documentType),
      documents,
      fields: documents.flatMap((document) => document.fields),
    },
      label: "Updated docs",
  };
}

export function getWorkflowUpdateDocumentRequirementState({
  template,
  documentId,
  patch,
}: {
  template: WorkflowTemplate;
  documentId: string;
  patch: UpdateDocumentRequirementInput;
}) {
  return {
    template: updateWorkflowDocumentRequirement(template, documentId, patch),
    label: "Updated doc",
  };
}
