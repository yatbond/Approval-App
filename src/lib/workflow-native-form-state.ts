import type { WorkflowField } from "./types.ts";

export const nativeFormFieldTypeOptions: {
  value: WorkflowField["type"];
  label: string;
}[] = [
  { value: "text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Single choice" },
  { value: "checkbox", label: "Checkbox" },
];

export function isNativeFormChoiceField(type: WorkflowField["type"]) {
  return type === "select" || type === "radio";
}

export function parseNativeFormOptions(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  );
}

export function getNativeFormFieldPlaceholder(field: WorkflowField) {
  if (field.placeholder?.trim()) {
    return field.placeholder.trim();
  }

  if (field.type === "select") {
    return "Select an option";
  }

  return `Enter ${field.label.trim().toLowerCase() || "value"}`;
}
