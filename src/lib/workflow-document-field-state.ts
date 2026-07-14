import type {
  WorkflowDocumentRequirement,
  WorkflowField,
} from "./types.ts";
import { fieldSourceForDocumentFormat } from "./workflow-documents.ts";

type DocumentFieldPatch = Partial<
  Pick<
    WorkflowField,
    "label" | "type" | "instructions" | "placeholder" | "options" | "required"
  >
>;

export function updateWorkflowDocumentField(
  documents: WorkflowDocumentRequirement[],
  documentId: string,
  fieldIndex: number,
  patch: DocumentFieldPatch,
): WorkflowDocumentRequirement[] {
  return documents.map((document) =>
    document.id === documentId
      ? {
          ...document,
          fields: document.fields.map((field, index) =>
            index === fieldIndex ? { ...field, ...patch } : field,
          ),
        }
      : document,
  );
}

export function addWorkflowDocumentField(
  documents: WorkflowDocumentRequirement[],
  documentId: string,
): WorkflowDocumentRequirement[] {
  return documents.map((document) =>
    document.id === documentId
      ? {
          ...document,
          fields: [
            ...document.fields,
            {
              name: `${document.id}-field-${document.fields.length + 1}`,
              label: "New field",
              type: "text",
              required: false,
              source:
                document.inputMode === "manual_form"
                  ? "manual"
                  : fieldSourceForDocumentFormat(document.format),
              instructions:
                document.inputMode === "manual_form"
                  ? ""
                  : "Describe what should be extracted from this document.",
              documentId: document.id,
            },
          ],
        }
      : document,
  );
}

export function removeWorkflowDocumentField(
  documents: WorkflowDocumentRequirement[],
  documentId: string,
  fieldIndex: number,
): WorkflowDocumentRequirement[] {
  return documents.map((document) =>
    document.id === documentId
      ? {
          ...document,
          fields: document.fields.filter((_, index) => index !== fieldIndex),
        }
      : document,
  );
}
