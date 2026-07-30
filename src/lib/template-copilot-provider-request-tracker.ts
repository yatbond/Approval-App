export const templateCopilotProviderRequestOutcomes = [
  "success",
  "outage",
  "timeout",
  "malformed_output",
  "privacy_route_rejected",
] as const;

export type TemplateCopilotProviderRequestOutcome =
  (typeof templateCopilotProviderRequestOutcomes)[number];

export type TemplateCopilotProviderRequestObservation = Readonly<{
  outcome: TemplateCopilotProviderRequestOutcome;
  latencyMs: number;
}>;

export type TemplateCopilotProviderRequestSummary = Readonly<{
  requestCount: number;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  outcome: TemplateCopilotProviderRequestOutcome;
}>;

export function classifyTemplateCopilotProviderRequestOutcome(
  error: unknown,
): Exclude<TemplateCopilotProviderRequestOutcome, "success"> {
  const record =
    error && typeof error === "object"
      ? (error as Readonly<Record<string, unknown>>)
      : {};
  const reason = [
    typeof record.reasonCode === "string" ? record.reasonCode : "",
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
  ].join(" ");
  if (/privacy|zdr/i.test(reason)) return "privacy_route_rejected";
  if (/timeout|abort/i.test(reason)) return "timeout";
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
      observations.push(
        Object.freeze({ outcome: observation.outcome, latencyMs }),
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
      return Object.freeze({
        requestCount: observations.length,
        successCount: observations.length - failures.length,
        failureCount: failures.length,
        averageLatencyMs: observations.length
          ? Math.round(totalLatencyMs / observations.length)
          : 0,
        outcome: aggregateOutcome(failures),
      });
    },
  });
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
