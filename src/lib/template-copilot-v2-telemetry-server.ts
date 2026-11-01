import "server-only";

import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertTemplateCopilotV2TelemetryMinimized,
  templateCopilotV2TelemetryEventSchema,
  templateCopilotV2TelemetryRetentionDays,
  type TemplateCopilotV2TelemetryAdminEvent,
  type TemplateCopilotV2TelemetryEvent,
} from "./template-copilot-v2-telemetry.ts";

type TelemetryWrite = Omit<
  TemplateCopilotV2TelemetryEvent,
  "schemaVersion" | "eventId" | "occurredAt" | "sessionPseudonym" | "actorPseudonym"
> & {
  actorId: string;
  sessionId: string;
  deduplicationKey: string;
};

export function isTemplateCopilotV2TelemetryEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED?.trim().toLowerCase() === "true";
}

export async function recordTemplateCopilotV2Telemetry({
  service,
  event,
  hmacSecret = process.env.TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET,
  now = () => new Date(),
}: {
  service: SupabaseClient;
  event: TelemetryWrite;
  hmacSecret?: string;
  now?: () => Date;
}) {
  const secret = requireTelemetrySecret(hmacSecret);
  const parsed = assertTemplateCopilotV2TelemetryMinimized({
    schemaVersion: 1,
    eventId: deterministicTelemetryEventId({
      secret,
      sessionId: event.sessionId,
      eventType: event.eventType,
      deduplicationKey: event.deduplicationKey,
    }),
    occurredAt: now().toISOString(),
    sessionPseudonym: pseudonymize("session", event.sessionId, secret),
    actorPseudonym: pseudonymize("actor", event.actorId, secret),
    locale: event.locale,
    mode: event.mode,
    eventType: event.eventType,
    revision: event.revision,
    ...(event.questionId ? { questionId: event.questionId } : {}),
    outcomeCode: event.outcomeCode,
    ...(event.readiness ? { readiness: event.readiness } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    counts: event.counts,
  });
  const { data, error } = await service.rpc(
    "record_template_copilot_v2_telemetry",
    telemetryRpcArguments(parsed),
  );
  if (error) throw error;
  if (data !== parsed.eventId) {
    throw new Error("The telemetry store returned an unexpected event identifier.");
  }
  return parsed;
}

export async function recordTemplateCopilotV2TelemetryBestEffort(input: {
  service: SupabaseClient;
  event: TelemetryWrite;
}) {
  if (!isTemplateCopilotV2TelemetryEnabled()) return null;
  try {
    return await recordTemplateCopilotV2Telemetry(input);
  } catch (error) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        service: "approval-workflow",
        event: "template_copilot_v2_telemetry_write_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      }),
    );
    return null;
  }
}

export async function listTemplateCopilotV2TelemetryForAdmin({
  service,
  actorId,
  limit,
  before,
}: {
  service: SupabaseClient;
  actorId: string;
  limit: number;
  before?: string;
}) {
  const { data, error } = await service.rpc(
    "list_template_copilot_v2_telemetry_for_admin",
    {
      p_actor_id: actorId,
      p_limit: Math.min(Math.max(limit, 1), 200),
      p_before: before || null,
    },
  );
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(parseAdminRow);
}

export async function purgeExpiredTemplateCopilotV2Telemetry({
  service,
  before,
}: {
  service: SupabaseClient;
  before?: string;
}) {
  const { data, error } = await service.rpc(
    "purge_expired_template_copilot_v2_telemetry",
    { p_before: before || new Date().toISOString() },
  );
  if (error) throw error;
  const deleted = Number(data);
  if (!Number.isSafeInteger(deleted) || deleted < 0) {
    throw new Error("The telemetry retention purge returned an invalid count.");
  }
  return { status: "completed" as const, deleted };
}

export async function runTemplateCopilotV2TelemetryRetention({
  service,
}: {
  service?: SupabaseClient;
} = {}) {
  if (!isTemplateCopilotV2TelemetryEnabled()) {
    return { status: "disabled" as const, deleted: 0 };
  }
  try {
    return await purgeExpiredTemplateCopilotV2Telemetry({
      service: service || createTelemetryServiceClient(),
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        service: "approval-workflow",
        event: "template_copilot_v2_telemetry_retention_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { status: "failed" as const, deleted: 0 };
  }
}

export { templateCopilotV2TelemetryRetentionDays };

function requireTelemetrySecret(value: string | undefined) {
  const secret = value?.trim() || "";
  if (secret.length < 32) {
    throw new Error(
      "TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET must contain at least 32 characters.",
    );
  }
  return secret;
}

function createTelemetryServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error("Server telemetry database credentials are not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function pseudonymize(kind: "actor" | "session", value: string, secret: string) {
  return `hmac-sha256:${createHmac("sha256", secret)
    .update(`${kind}:${value}`)
    .digest("hex")}`;
}

function deterministicTelemetryEventId({
  secret,
  sessionId,
  eventType,
  deduplicationKey,
}: {
  secret: string;
  sessionId: string;
  eventType: string;
  deduplicationKey: string;
}) {
  const hex = createHmac("sha256", secret)
    .update(`event:${sessionId}:${eventType}:${deduplicationKey}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join(""),
  ].join("-");
}

function telemetryRpcArguments(event: TemplateCopilotV2TelemetryEvent) {
  return {
    p_event_id: event.eventId,
    p_occurred_at: event.occurredAt,
    p_session_pseudonym: event.sessionPseudonym,
    p_actor_pseudonym: event.actorPseudonym,
    p_locale: event.locale,
    p_mode: event.mode,
    p_event_type: event.eventType,
    p_revision: event.revision,
    p_question_id: event.questionId || null,
    p_outcome_code: event.outcomeCode,
    p_readiness: event.readiness || null,
    p_provider: event.provider || null,
    p_counts: event.counts,
  };
}

function parseAdminRow(input: unknown): TemplateCopilotV2TelemetryAdminEvent {
  const row = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const provider = row.provider === null || row.provider === undefined
    ? undefined
    : templateCopilotV2TelemetryEventSchema.shape.provider.unwrap().parse(row.provider);
  const event = assertTemplateCopilotV2TelemetryMinimized({
    schemaVersion: 1,
    eventId: row.event_id,
    occurredAt: row.occurred_at,
    sessionPseudonym: row.session_pseudonym,
    actorPseudonym: row.actor_pseudonym,
    locale: row.locale,
    mode: row.mode,
    eventType: row.event_type,
    revision: Number(row.revision),
    ...(row.question_id ? { questionId: row.question_id } : {}),
    outcomeCode: row.outcome_code,
    ...(row.readiness ? { readiness: row.readiness } : {}),
    ...(provider ? { provider } : {}),
    counts: row.counts,
  });
  const expiresAt = typeof row.expires_at === "string"
    ? row.expires_at
    : "";
  if (!zonedDateTime(expiresAt)) {
    throw new Error("The telemetry store returned an invalid expiry.");
  }
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    expiresAt,
    sessionPseudonym: event.sessionPseudonym,
    actorPseudonym: event.actorPseudonym,
    locale: event.locale,
    mode: event.mode,
    eventType: event.eventType,
    revision: event.revision,
    ...(event.questionId ? { questionId: event.questionId } : {}),
    outcomeCode: event.outcomeCode,
    ...(event.readiness ? { readiness: event.readiness } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    counts: event.counts,
  };
}

function zonedDateTime(value: string) {
  return Number.isFinite(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}
