import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import {
  isTemplateCopilotV2TelemetryEnabled,
  listTemplateCopilotV2TelemetryForAdmin,
  templateCopilotV2TelemetryRetentionDays,
} from "@/lib/template-copilot-v2-telemetry-server";
import type {
  TemplateCopilotV2TelemetryAdminEvent,
  TemplateCopilotV2TelemetryAdminViewEvent,
} from "@/lib/template-copilot-v2-telemetry";

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    before: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  if (!actor.isAdmin) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "forbidden",
          message: "Administrator access is required to review Copilot telemetry.",
        },
      },
      403,
    );
  }
  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") || undefined,
    before: request.nextUrl.searchParams.get("before") || undefined,
  });
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The Copilot telemetry query is invalid.",
        },
      },
      400,
    );
  }
  if (!isTemplateCopilotV2TelemetryEnabled()) {
    return approvalJson(cookieSource, correlationId, {
      enabled: false,
      retentionDays: templateCopilotV2TelemetryRetentionDays,
      events: [],
    });
  }
  try {
    const events = await listTemplateCopilotV2TelemetryForAdmin({
      service,
      actorId: actor.id,
      limit: parsed.data.limit,
      before: parsed.data.before,
    });
    safeApprovalLog("template_copilot_v2_telemetry_admin_read", correlationId, {
      resultCount: events.length,
    });
    return approvalJson(cookieSource, correlationId, {
      enabled: true,
      retentionDays: templateCopilotV2TelemetryRetentionDays,
      events: events.map(toAdminViewEvent),
    });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_telemetry_admin_read_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "Copilot operational telemetry is temporarily unavailable.",
        },
      },
      503,
    );
  }
}

function toAdminViewEvent(
  event: TemplateCopilotV2TelemetryAdminEvent,
): TemplateCopilotV2TelemetryAdminViewEvent {
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    expiresAt: event.expiresAt,
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
