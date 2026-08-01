import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTemplateCopilotProviderFailureReasonCode,
  classifyTemplateCopilotProviderRequestOutcome,
  classifyTemplateCopilotProviderTransportFailureReason,
  createTemplateCopilotProviderRequestTracker,
  sanitizeTemplateCopilotProviderFailureReason,
  templateCopilotProviderFailureReasons,
} from "./template-copilot-provider-request-tracker.ts";

test("provider request tracker counts actual requests and uses request-only average latency", () => {
  const tracker = createTemplateCopilotProviderRequestTracker();
  tracker.observe({ outcome: "success", latencyMs: 100 });
  tracker.observe({ outcome: "timeout", latencyMs: 300 });
  tracker.observe({ outcome: "success", latencyMs: 200 });
  assert.deepEqual(tracker.snapshot(), {
    requestCount: 3,
    successCount: 2,
    failureCount: 1,
    averageLatencyMs: 200,
    outcome: "timeout",
    providerFailureReason: null,
  });
});

test("provider request tracker preserves only the five v3 transport failure reasons", () => {
  assert.deepEqual(templateCopilotProviderFailureReasons, [
    "invalid_json",
    "transport_limit",
    "missing_content",
    "incomplete_output",
    "output_capacity_exhausted",
  ]);

  for (const providerFailureReason of templateCopilotProviderFailureReasons) {
    const tracker = createTemplateCopilotProviderRequestTracker();
    tracker.observe({
      outcome: "malformed_output",
      latencyMs: 1,
      providerFailureReason,
    });
    assert.equal(
      tracker.snapshot().providerFailureReason,
      providerFailureReason,
    );
    assert.equal(
      classifyTemplateCopilotProviderTransportFailureReason({
        reasonCode: providerFailureReason,
        message: "MUST_NOT_BE_READ_OR_STORED",
        issuePaths: ["private.path"],
      }),
      providerFailureReason,
    );
    assert.equal(
      classifyTemplateCopilotProviderRequestOutcome({
        reasonCode: providerFailureReason,
      }),
      "malformed_output",
    );
  }

  for (const arbitrary of [
    "provider secret detail",
    "invalid_json.private.path",
    "timeout",
    "",
    null,
    { reasonCode: "missing_content" },
  ]) {
    assert.equal(sanitizeTemplateCopilotProviderFailureReason(arbitrary), null);
  }
  assert.equal(
    classifyTemplateCopilotProviderTransportFailureReason({
      reasonCode: "provider secret detail",
    }),
    null,
  );
});

test("provider request tracker nulls transport reasons for success, timeout, outage, and privacy failures", () => {
  for (const outcome of [
    "success",
    "timeout",
    "outage",
    "privacy_route_rejected",
  ]) {
    const tracker = createTemplateCopilotProviderRequestTracker();
    tracker.observe({
      outcome,
      latencyMs: 1,
      providerFailureReason: "invalid_json",
    });
    assert.equal(tracker.snapshot().providerFailureReason, null, outcome);
  }

  const forged = createTemplateCopilotProviderRequestTracker();
  forged.observe({
    outcome: "malformed_output",
    latencyMs: 1,
    providerFailureReason: "raw provider message",
  });
  assert.equal(forged.snapshot().providerFailureReason, null);
});

test("provider request tracker preserves only allowlisted response telemetry", () => {
  const tracker = createTemplateCopilotProviderRequestTracker();
  tracker.observe({
    outcome: "success",
    latencyMs: 321,
    responseTelemetry: {
      requestedModel: "qwen/qwen3.5-35b-a3b",
      returnedModel: "qwen/qwen3.5-35b-a3b",
      upstreamProvider: "CoreWeave",
      finishState: "stop",
      inputTokens: 1_234,
      outputTokens: 567,
      totalTokens: 1_801,
      routerAttemptCount: 1,
      providerLatencyMs: 320.6,
    },
  });
  assert.deepEqual(tracker.snapshot().responseTelemetry, {
    requestedModel: "qwen/qwen3.5-35b-a3b",
    returnedModel: "qwen/qwen3.5-35b-a3b",
    upstreamProvider: "CoreWeave",
    finishState: "stop",
    inputTokens: 1_234,
    outputTokens: 567,
    totalTokens: 1_801,
    routerAttemptCount: 1,
    providerLatencyMs: 321,
  });

  const invalid = createTemplateCopilotProviderRequestTracker();
  invalid.observe({
    outcome: "success",
    latencyMs: 1,
    responseTelemetry: {
      requestedModel: "qwen\nsecret",
      returnedModel: null,
      upstreamProvider: null,
      finishState: "arbitrary-secret-state",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      routerAttemptCount: null,
      providerLatencyMs: 1,
    },
  });
  assert.equal(invalid.snapshot().responseTelemetry, undefined);
});

test("provider failure classification remains bounded and privacy-safe", () => {
  assert.equal(
    classifyTemplateCopilotProviderRequestOutcome({
      reasonCode: "privacy_route_rejected",
    }),
    "privacy_route_rejected",
  );
  assert.equal(
    classifyTemplateCopilotProviderRequestOutcome(
      Object.assign(new Error("request aborted"), { name: "AbortError" }),
    ),
    "timeout",
  );
  assert.equal(
    classifyTemplateCopilotProviderRequestOutcome({
      reasonCode: "schema_validation",
    }),
    "malformed_output",
  );
  assert.equal(
    classifyTemplateCopilotProviderRequestOutcome(new Error("offline")),
    "outage",
  );
});

test("provider transport failures preserve timeout and privacy reason codes", () => {
  assert.equal(
    classifyTemplateCopilotProviderFailureReasonCode(
      Object.assign(new Error("request aborted"), { name: "AbortError" }),
    ),
    "timeout",
  );
  assert.equal(
    classifyTemplateCopilotProviderFailureReasonCode({
      reasonCode: "privacy_route_rejected",
    }),
    "privacy_route_rejected",
  );
  assert.equal(
    classifyTemplateCopilotProviderFailureReasonCode(
      new Error("provider unavailable"),
    ),
    "provider_error",
  );
  assert.equal(
    classifyTemplateCopilotProviderFailureReasonCode({
      reasonCode: "schema_validation",
    }),
    "provider_error",
  );
});
