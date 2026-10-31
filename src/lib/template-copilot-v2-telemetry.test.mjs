import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTemplateCopilotV2TelemetryMinimized,
  templateCopilotV2TelemetryEventSchema,
  templateCopilotV2TelemetryRetentionDays,
} from "./template-copilot-v2-telemetry.ts";

const pseudonym = `hmac-sha256:${"a".repeat(64)}`;
const valid = {
  schemaVersion: 1,
  eventId: "a1100000-0001-5000-8000-000000000001",
  occurredAt: "2026-07-30T00:00:00Z",
  sessionPseudonym: pseudonym,
  actorPseudonym: pseudonym,
  locale: "zh-Hant",
  mode: "describe_everything",
  eventType: "provider_call_completed",
  revision: 3,
  questionId: "v2.workflow.purpose",
  outcomeCode: "provider_success",
  provider: {
    providerCode: "openrouter",
    modelCode: "qwen:qwen3.5-35b-a3b",
    privacyMode: "zdr",
    outcome: "success",
    latencyMs: 420,
  },
  counts: {
    guided_fallbacks: 0,
    candidates_accepted: 2,
    candidates_rejected: 1,
    extraction_blocks_attempted: 3,
    extraction_blocks_completed: 2,
    extraction_blocks_failed: 1,
    rejection_untraceable_normalization: 1,
    rejected_fact_workflow_name: 1,
  },
};

test("the runtime telemetry contract accepts only bounded structured metadata", () => {
  assert.deepEqual(assertTemplateCopilotV2TelemetryMinimized(valid), valid);
  assert.equal(templateCopilotV2TelemetryRetentionDays, 30);
  assert.equal(templateCopilotV2TelemetryEventSchema.safeParse({
    ...valid,
    provider: {
      ...valid.provider,
      inputTokens: 120,
      outputTokens: 40,
      estimatedCostUsd: 0.002,
    },
  }).success, true);
});

test("runtime telemetry rejects direct identifiers and raw corporate text", () => {
  for (const unsafe of [
    { ...valid, rawAnswer: "Confidential acquisition" },
    { ...valid, outcomeCode: "person@example.com" },
    { ...valid, actorPseudonym: `sha256:${"a".repeat(64)}` },
    { ...valid, provider: { ...valid.provider, prompt: "ignore controls" } },
    { ...valid, counts: { employee_name: 1 } },
    { ...valid, counts: { rejected_fact_employee_name: 1 } },
    { ...valid, counts: { raw_rejection_detail: 1 } },
    { ...valid, counts: { document_blocks_attempted: 1 } },
  ]) {
    assert.throws(
      () => assertTemplateCopilotV2TelemetryMinimized(unsafe),
      /unrecognized|email-like|invalid|forbidden/i,
    );
  }
});

test("provider usage and cost remain absent when the provider does not return them", () => {
  const parsed = assertTemplateCopilotV2TelemetryMinimized(valid);
  assert.equal("inputTokens" in parsed.provider, false);
  assert.equal("outputTokens" in parsed.provider, false);
  assert.equal("estimatedCostUsd" in parsed.provider, false);
});
