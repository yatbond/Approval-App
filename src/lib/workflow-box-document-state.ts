import type {
  DocumentFormat,
  WorkflowDocumentInputMode,
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
  inputMode?: WorkflowDocumentInputMode;
  required: boolean;
};

export function getWorkflowAddBoxDocumentState({
  template,
  selectedNodeId,
  selectedNodeLabel,
  documentType,
  format,
  inputMode = "upload",
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

  const isManualForm = inputMode === "manual_form";

  return {
    didUpdate: true,
    template: addWorkflowDocumentToNode(template, selectedNodeId, {
      documentType: trimmedDocumentType,
      format,
      inputMode,
      required,
      fields: [
        {
          name: `${trimmedDocumentType.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_field`,
          label: "New field",
          type: "text",
          required: false,
          source: isManualForm ? "manual" : fieldSourceForDocumentFormat(format),
          instructions: isManualForm
            ? "Describe what the requester should enter for this form field."
            : "Describe what should be extracted from this document.",
        },
      ],
    }),
    label: `Added document to ${selectedNodeLabel}`,
    resetForm: {
      documentType: "Supporting document",
      format: "pdf" as DocumentFormat,
      inputMode: "upload" as WorkflowDocumentInputMode,
      required: true,
    },
  };
}
