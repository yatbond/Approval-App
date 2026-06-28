import type { WorkflowField } from "./types.ts";
import type { ParsedWorkspaceFilePayload } from "./workspace-file-api.ts";

export function readRecognizedSampleField(
  payload: ParsedWorkspaceFilePayload,
  field: WorkflowField,
) {
  const fieldValue = readFromRecord(payload.fields || {}, field);
  if (fieldValue.value) {
    return {
      value: fieldValue.value,
      evidence: readFromRecord(payload.evidence || {}, field).value,
    };
  }

  const matchingSuggestion = (payload.suggestedFields || []).find((suggestion) =>
    labelsMatch(suggestion.label, field.label || field.name),
  );

  if (matchingSuggestion) {
    return {
      value: matchingSuggestion.value,
      evidence: matchingSuggestion.evidence || "",
    };
  }

  return {
    value: "",
    evidence: "",
  };
}

function readFromRecord(record: Record<string, string>, field: WorkflowField) {
  const keys = [field.label, field.name].filter(Boolean);

  for (const key of keys) {
    const value = record[key];
    if (value) {
      return { key, value };
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (value && keys.some((fieldKey) => labelsMatch(key, fieldKey))) {
      return { key, value };
    }
  }

  const values = Object.values(record).filter(Boolean);
  return {
    key: "",
    value: values.length === 1 ? values[0] : "",
  };
}

function labelsMatch(left: string, right: string) {
  const normalizedLeft = normalizeLabel(left);
  const normalizedRight = normalizeLabel(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
