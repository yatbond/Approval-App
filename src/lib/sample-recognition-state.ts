import type { DocumentPreviewPage } from "./document-preview.ts";
import type { PdfPageImageInput } from "./parser.ts";
import type { WorkflowField } from "./types.ts";
import type { ParsedWorkspaceFilePayload } from "./workspace-file-api.ts";

export function buildSampleRecognitionPageImages({
  selectedPreviewPage,
  samplePageImages,
}: {
  selectedPreviewPage?: DocumentPreviewPage | null;
  samplePageImages: PdfPageImageInput[];
}): PdfPageImageInput[] {
  if (selectedPreviewPage?.imageBase64) {
    return [
      {
        pageNumber: selectedPreviewPage.pageNumber,
        mimeType: selectedPreviewPage.mimeType,
        imageBase64: selectedPreviewPage.imageBase64,
        ...(selectedPreviewPage.pageText
          ? { pageText: selectedPreviewPage.pageText }
          : {}),
      },
    ];
  }

  return samplePageImages;
}

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

export function getSampleRecognitionFailureMessage(
  payload: ParsedWorkspaceFilePayload,
) {
  const notes = payload.notes || [];
  const missingOpenRouterKey = notes.some((note) =>
    note.includes("OPENROUTER_API_KEY is not configured"),
  );
  const diagnosticId = payload.diagnostics?.requestId
    ? ` Diagnostic ID: ${payload.diagnostics.requestId}.`
    : "";

  if (missingOpenRouterKey) {
    return [
      "AI provider is not configured for this deployment. Missing OPENROUTER_API_KEY.",
      diagnosticId.trim(),
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "AI did not recognize a value for this field. Adjust the instruction or use Extract box.",
    diagnosticId.trim(),
  ]
    .filter(Boolean)
    .join(" ");
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
