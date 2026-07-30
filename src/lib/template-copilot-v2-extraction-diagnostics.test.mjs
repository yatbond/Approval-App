import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeTemplateCopilotV2ExtractionDiagnostics,
  templateCopilotV2ExtractionDiagnosticTelemetryCounts,
} from "./template-copilot-v2-extraction-diagnostics.ts";

test("extraction diagnostics retain bounded reason and fact counts without source detail", () => {
  const diagnostics = summarizeTemplateCopilotV2ExtractionDiagnostics({
    acceptedCandidateCount: 1,
    terminalCode: "candidates_applied",
    rejected: [
      {
        code: "model_schema_invalid",
        detail: "candidates.0.value.0.required",
      },
      {
        code: "untraceable",
        detail: "workflow.stages:normalization",
      },
      {
        code: "untraceable",
        detail: "request.fields:ambiguous_quote",
      },
      {
        code: "overlapping_span",
        detail: "workflow.conditions:source:private",
      },
      {
        code: "untraceable",
        detail: "workflow.stages:unexpected_internal_detail",
      },
    ],
  });

  assert.deepEqual(diagnostics, {
    schemaVersion: 1,
    terminalCode: "candidates_applied",
    acceptedCandidateCount: 1,
    rejectedCandidateCount: 5,
    rejectionCodeCounts: {
      model_schema_invalid: 1,
      untraceable_normalization: 1,
      untraceable_ambiguous_quote: 1,
      overlapping_span: 1,
      untraceable_other: 1,
    },
    rejectedFactCounts: {
      "workflow.stages": 2,
      "request.fields": 1,
      "workflow.conditions": 1,
    },
  });
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("Purchase approval"), false);
  assert.equal(serialized.includes("source:private"), false);
  assert.equal(serialized.includes("unexpected_internal_detail"), false);
});

test("telemetry diagnostics use only bounded count keys", () => {
  const diagnostics = summarizeTemplateCopilotV2ExtractionDiagnostics({
    acceptedCandidateCount: 1,
    terminalCode: "no_usable_candidates",
    rejected: [
      {
        code: "untraceable",
        detail: "attachments.requirements:evidence_shape",
      },
    ],
  });
  assert.deepEqual(
    templateCopilotV2ExtractionDiagnosticTelemetryCounts(diagnostics),
    {
      candidates_accepted: 1,
      candidates_rejected: 1,
      rejection_untraceable_evidence_shape: 1,
      rejected_fact_attachments_requirements: 1,
    },
  );
  assert.deepEqual(
    templateCopilotV2ExtractionDiagnosticTelemetryCounts(null),
    {
      candidates_accepted: 0,
      candidates_rejected: 0,
    },
  );
});
