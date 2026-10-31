import type { TemplateCopilotV3ProviderQuoteTransportFailureReason } from "./template-copilot-v3-provider-quotes.ts";

export const templateCopilotProviderRequestOutcomes = [
  "success",
  "outage",
  "timeout",
  "malformed_output",
  "privacy_route_rejected",
] as const;

export type TemplateCopilotProviderRequestOutcome =
  (typeof templateCopilotProviderRequestOutcomes)[number];

export const templateCopilotProviderFailureReasons = [
  "invalid_json",
  "transport_limit",
  "missing_content",
  "incomplete_output",
  "output_capacity_exhausted",
] as const satisfies readonly TemplateCopilotV3ProviderQuoteTransportFailureReason[];

export type TemplateCopilotProviderFailureReason =
  (typeof templateCopilotProviderFailureReasons)[number];

export type TemplateCopilotProviderResponseTelemetry = Readonly<{
  requestedModel: string;
  returnedModel: string | null;
  upstreamProvider: string | null;
  finishState: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  routerAttemptCount: number | null;
  providerLatencyMs: number;
}>;

export type TemplateCopilotProviderRequestObservation = Readonly<{
  outcome: TemplateCopilotProviderRequestOutcome;
  latencyMs: number;
  providerFailureReason?: TemplateCopilotProviderFailureReason | null;
  responseTelemetry?: TemplateCopilotProviderResponseTelemetry;
}>;

export type TemplateCopilotProviderRequestSummary = Readonly<{
  requestCount: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  outcome: TemplateCopilotProviderRequestOutcome;
  providerFailureReason: TemplateCopilotProviderFailureReason | null;
  responseTelemetry?: TemplateCopilotProviderResponseTelemetry;
}>;

const providerFailureReasonSet = new Set<TemplateCopilotProviderFailureReason>(
  templateCopilotProviderFailureReasons,
);

export function sanitizeTemplateCopilotProviderFailureReason(
  value: unknown,
): TemplateCopilotProviderFailureReason | null {
  return typeof value === "string" &&
    providerFailureReasonSet.has(value as TemplateCopilotProviderFailureReason)
    ? (value as TemplateCopilotProviderFailureReason)
    : null;
}

export function classifyTemplateCopilotProviderTransportFailureReason(
  error: unknown,
): TemplateCopilotProviderFailureReason | null {
  const record =
    error && typeof error === "object"
      ? (error as Readonly<Record<string, unknown>>)
      : {};
  return sanitizeTemplateCopilotProviderFailureReason(record.reasonCode);
}

export function classifyTemplateCopilotProviderRequestOutcome(
  error: unknown,
): Exclude<TemplateCopilotProviderRequestOutcome, "success"> {
  const record =
    error && typeof error === "object"
      ? (error as Readonly<Record<string, unknown>>)
      : {};
  const providerFailureReason =
    classifyTemplateCopilotProviderTransportFailureReason(error);
  const reason = [
    typeof record.reasonCode === "string" ? record.reasonCode : "",
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
  ].join(" ");
  if (/privacy|zdr/i.test(reason)) return "privacy_route_rejected";
  if (/timeout|abort/i.test(reason)) return "timeout";
  if (providerFailureReason) return "malformed_output";
  if (/malformed|schema|json|output/i.test(reason)) return "malformed_output";
  return "outage";
}

export function classifyTemplateCopilotProviderFailureReasonCode(
  error: unknown,
): "privacy_route_rejected" | "timeout" | "provider_error" {
  const outcome = classifyTemplateCopilotProviderRequestOutcome(error);
  if (outcome === "privacy_route_rejected" || outcome === "timeout") {
    return outcome;
  }
  return "provider_error";
}

export function createTemplateCopilotProviderRequestTracker() {
  const observations: TemplateCopilotProviderRequestObservation[] = [];
  return Object.freeze({
    observe(observation: TemplateCopilotProviderRequestObservation) {
      const latencyMs = Math.min(
        Math.max(Math.round(observation.latencyMs), 0),
        300_000,
      );
      const responseTelemetry = sanitizeProviderResponseTelemetry(
        observation.responseTelemetry,
      );
      const providerFailureReason =
        observation.outcome === "malformed_output"
          ? sanitizeTemplateCopilotProviderFailureReason(
              observation.providerFailureReason,
            )
          : null;
      observations.push(
        Object.freeze({
          outcome: observation.outcome,
          latencyMs,
          providerFailureReason,
          ...(responseTelemetry ? { responseTelemetry } : {}),
        }),
      );
    },
    snapshot(): TemplateCopilotProviderRequestSummary {
      const failures = observations.filter(
        (observation) => observation.outcome !== "success",
      );
      const totalLatencyMs = observations.reduce(
        (total, observation) => total + observation.latencyMs,
        0,
      );
      const responseTelemetry =
        observations.length === 1
          ? observations[0]?.responseTelemetry
          : undefined;
      const outcome = aggregateOutcome(failures);
      return Object.freeze({
        requestCount: observations.length,
        successCount: observations.length - failures.length,
        failureCount: failures.length,
        averageLatencyMs: observations.length
          ? Math.round(totalLatencyMs / observations.length)
          : 0,
        outcome,
        providerFailureReason: aggregateProviderFailureReason(
          failures,
          outcome,
        ),
        ...(responseTelemetry ? { responseTelemetry } : {}),
      });
    },
  });
}

function aggregateProviderFailureReason(
  failures: readonly TemplateCopilotProviderRequestObservation[],
  outcome: TemplateCopilotProviderRequestOutcome,
): TemplateCopilotProviderFailureReason | null {
  if (outcome !== "malformed_output") return null;
  const reasons = new Set(
    failures
      .map((failure) =>
        sanitizeTemplateCopilotProviderFailureReason(
          failure.providerFailureReason,
        ),
      )
      .filter(
        (reason): reason is TemplateCopilotProviderFailureReason =>
          reason !== null,
      ),
  );
  return reasons.size === 1 ? [...reasons][0] ?? null : null;
}

const providerFinishStates = new Set([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call",
  "completed",
  "incomplete",
  "failed",
  "in_progress",
  "interpreting",
]);

function sanitizeProviderResponseTelemetry(
  telemetry: TemplateCopilotProviderResponseTelemetry | undefined,
): TemplateCopilotProviderResponseTelemetry | null {
  if (!telemetry || typeof telemetry !== "object") return null;
  const requestedModel = safeRoutingLabel(telemetry.requestedModel, 160);
  const returnedModel = safeNullableRoutingLabel(telemetry.returnedModel, 160);
  const upstreamProvider = safeNullableRoutingLabel(
    telemetry.upstreamProvider,
    80,
  );
  if (
    requestedModel === null ||
    returnedModel === undefined ||
    upstreamProvider === undefined ||
    !providerFinishStates.has(telemetry.finishState)
  ) {
    return null;
  }
  return Object.freeze({
    requestedModel,
    returnedModel,
    upstreamProvider,
    finishState: telemetry.finishState,
    inputTokens: safeNullableCount(telemetry.inputTokens, 10_000_000),
    outputTokens: safeNullableCount(telemetry.outputTokens, 10_000_000),
    totalTokens: safeNullableCount(telemetry.totalTokens, 20_000_000),
    routerAttemptCount: safeNullableCount(telemetry.routerAttemptCount, 100),
    providerLatencyMs: Math.min(
      Math.max(Math.round(telemetry.providerLatencyMs), 0),
      300_000,
    ),
  });
}

function safeNullableRoutingLabel(value: unknown, maximumLength: number) {
  if (value === null) return null;
  return safeRoutingLabel(value, maximumLength) ?? undefined;
}

function safeRoutingLabel(value: unknown, maximumLength: number) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    !/^[A-Za-z0-9 ._:/-]+$/u.test(value)
  ) {
    return null;
  }
  return value;
}

function safeNullableCount(value: unknown, maximum: number): number | null {
  if (value === null) return null;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}

function aggregateOutcome(
  failures: readonly TemplateCopilotProviderRequestObservation[],
): TemplateCopilotProviderRequestOutcome {
  for (const outcome of [
    "privacy_route_rejected",
    "timeout",
    "malformed_output",
    "outage",
  ] as const) {
    if (failures.some((failure) => failure.outcome === outcome)) return outcome;
  }
  return "success";
}
