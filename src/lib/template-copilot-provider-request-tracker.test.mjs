import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTemplateCopilotProviderFailureReasonCode,
  classifyTemplateCopilotProviderRequestOutcome,
  createTemplateCopilotProviderRequestTracker,
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
  });
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
