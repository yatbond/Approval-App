import { z } from "zod";

export const templateCopilotV2TelemetrySchemaVersion = 1 as const;
export const templateCopilotV2TelemetryRetentionDays = 30 as const;
export const templateCopilotV2TelemetryModes = [
  "guided",
  "describe_everything",
  "similar_template",
] as const;
export const templateCopilotV2TelemetryProviderOutcomes = [
  "success",
  "outage",
  "timeout",
  "malformed_output",
  "privacy_route_rejected",
] as const;
export const templateCopilotV2TelemetryEventTypes = [
  "question_selected",
  "candidate_recorded",
  "conflict_recorded",
  "readiness_changed",
  "compile_completed",
  "validation_completed",
  "provider_call_completed",
  "accessibility_checkpoint",
  "pilot_observation_recorded",
] as const;

const safeCode = z.string().regex(/^[a-z0-9_.:-]{1,96}$/);
const pseudonym = z
  .string()
  .regex(/^hmac-sha256:[0-9a-f]{64}$/);

export const templateCopilotV2TelemetryProviderSchema = z
  .object({
    providerCode: safeCode,
    modelCode: safeCode,
    privacyMode: z.enum(["zdr", "standard"]),
    outcome: z.enum(templateCopilotV2TelemetryProviderOutcomes),
    latencyMs: z.number().int().min(0).max(300_000),
    inputTokens: z.number().int().min(0).max(1_000_000).optional(),
    outputTokens: z.number().int().min(0).max(1_000_000).optional(),
    estimatedCostUsd: z.number().min(0).max(10_000).optional(),
  })
  .strict();

export const templateCopilotV2TelemetryEventSchema = z
  .object({
    schemaVersion: z.literal(templateCopilotV2TelemetrySchemaVersion),
    eventId: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    sessionPseudonym: pseudonym,
    actorPseudonym: pseudonym,
    locale: z.enum(["en", "zh-Hant", "zh-Hans"]),
    mode: z.enum(templateCopilotV2TelemetryModes),
    eventType: z.enum(templateCopilotV2TelemetryEventTypes),
    revision: z.number().int().min(1),
    questionId: safeCode.optional(),
    outcomeCode: safeCode,
    readiness: z
      .enum([
        "incomplete",
        "draft_ready",
        "publication_ready",
        "activation_ready",
      ])
      .optional(),
    provider: templateCopilotV2TelemetryProviderSchema.optional(),
    counts: z.record(safeCode, z.number().int().min(0).max(1_000_000)),
  })
  .strict();

export type TemplateCopilotV2TelemetryEvent = z.infer<
  typeof templateCopilotV2TelemetryEventSchema
>;
export type TemplateCopilotV2TelemetryAdminEvent =
  TemplateCopilotV2TelemetryEvent & Readonly<{ expiresAt: string }>;
export type TemplateCopilotV2TelemetryAdminViewEvent = Omit<
  TemplateCopilotV2TelemetryAdminEvent,
  "sessionPseudonym" | "actorPseudonym"
>;

const forbiddenTelemetryKey =
  /(?:answer|message|prompt|content|transcript|document|excerpt|email|name|raw|text)/i;
const emailLikeValue = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;

export function assertTemplateCopilotV2TelemetryMinimized(input: unknown) {
  const event = templateCopilotV2TelemetryEventSchema.parse(input);
  inspectTelemetryValue(event, "$");
  return event;
}

function inspectTelemetryValue(value: unknown, path: string) {
  if (typeof value === "string" && emailLikeValue.test(value)) {
    throw new Error(`Telemetry contains an email-like value at ${path}.`);
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenTelemetryKey.test(key)) {
      throw new Error(`Telemetry contains forbidden raw-text key ${path}.${key}.`);
    }
    inspectTelemetryValue(child, `${path}.${key}`);
  }
}
