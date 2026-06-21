import type {
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "./types.ts";

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
    label: "Updated document requirements",
  };
}
