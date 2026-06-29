import type { WorkflowTemplate } from "./types";

export function getWorkflowHandoffFieldNames(template: WorkflowTemplate) {
  const fieldNames = [
    ...template.fields.map((field) => field.label || field.name),
    ...template.documents.flatMap((document) =>
      document.fields.map((field) => field.label || field.name),
    ),
  ];

  return Array.from(
    new Set(fieldNames.map((fieldName) => fieldName.trim()).filter(Boolean)),
  );
}

export function toggleWorkflowHandoffFieldName(
  fieldNames: string[] | undefined,
  fieldName: string,
  isSelected: boolean,
) {
  const existing = fieldNames || [];

  if (isSelected) {
    return existing.includes(fieldName) ? existing : [...existing, fieldName];
  }

  return existing.filter((name) => name !== fieldName);
}
