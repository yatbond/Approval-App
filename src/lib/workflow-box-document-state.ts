import type {
  DocumentFormat,
  WorkflowTemplate,
} from "./types.ts";
import { addWorkflowDocumentToNode } from "./workflow-graph.ts";
import { fieldSourceForDocumentFormat } from "./workflow-documents.ts";

type WorkflowAddBoxDocumentStateInput = {
  template: WorkflowTemplate;
  selectedNodeId: string | null;
  selectedNodeLabel: string;
  documentType: string;
  format: DocumentFormat;
  required: boolean;
};

export function getWorkflowAddBoxDocumentState({
  template,
  selectedNodeId,
  selectedNodeLabel,
  documentType,
  format,
  required,
}: WorkflowAddBoxDocumentStateInput) {
  const trimmedDocumentType = documentType.trim();
  if (!selectedNodeId || !trimmedDocumentType) {
    return {
      didUpdate: false,
      template,
      label: "",
      resetForm: null,
    };
  }

  return {
    didUpdate: true,
    template: addWorkflowDocumentToNode(template, selectedNodeId, {
      documentType: trimmedDocumentType,
      format,
      required,
      fields: [
        {
          name: `${trimmedDocumentType.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_field`,
          label: "New field",
          type: "text",
          required: false,
          source: fieldSourceForDocumentFormat(format),
          instructions: "Describe what should be extracted from this document.",
        },
      ],
    }),
    label: `Added document to ${selectedNodeLabel}`,
    resetForm: {
      documentType: "Supporting document",
      format: "pdf" as DocumentFormat,
      required: true,
    },
  };
}
