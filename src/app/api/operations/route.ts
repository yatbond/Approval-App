import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getDevelopmentAuthBypassUser } from "@/lib/supabase/development-auth-bypass";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";
import { createSupabaseJsonResponse } from "@/lib/supabase/route-response";
import { approvalError, approvalJson, createApprovalServerContext } from "@/lib/approval-server";
import {
  evaluateApprovalOperationalAlerts,
  type ApprovalOperationalMetrics,
} from "@/lib/operational-alerts";
import { readBoundedJson } from "@/lib/bounded-request";
import {
  recordWorkflowOperationEvent,
  summarizeWorkflowOperationEvents,
  workflowOperationTypes,
  type WorkflowOperationEventRow,
  type WorkflowOperationOutcome,
  type WorkflowOperationType,
} from "@/lib/workflow-operation-monitor";

const outcomes: WorkflowOperationOutcome[] = ["succeeded", "failed", "skipped"];

export async function GET(request: NextRequest) {
  const developmentUser = getDevelopmentAuthBypassUser({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.E2E_AUTH_BYPASS_EMAIL,
  });
  if (developmentUser) {
    return NextResponse.json({
      windowHours: 24,
      generatedAt: new Date().toISOString(),
      summary: summarizeWorkflowOperationEvents([]),
      platform: null,
      platformError: null,
      alerts: [],
    });
  }

  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await session
    .from("workflow_operation_events")
    .select(
      "id,owner_user_id,owner_email,operation_type,outcome,request_no,duration_ms,message,details,created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return approvalJson(cookieSource, correlationId,
      { error: "Operation health is unavailable.", reason: error.message },
      503,
    );
  }

  const events = (data || []) as WorkflowOperationEventRow[];
  let platform: ApprovalOperationalMetrics | null = null;
  let platformError: string | null = null;
  if (actor.isAdmin) {
    const { data: platformData, error: metricsError } = await service.rpc(
      "get_approval_operational_metrics",
    );
    if (!metricsError && platformData && typeof platformData === "object") {
      const raw = platformData as Record<string, unknown>;
      platform = {
        databaseConnections: Number(raw.databaseConnections || 0),
        databaseConnectionLimit: Number(raw.databaseConnectionLimit || 0),
        lockWaits: Number(raw.lockWaits || 0),
        outboxPending: Number(raw.outboxPending || 0),
        outboxFailed: Number(raw.outboxFailed || 0),
        oldestPendingSeconds: Number(raw.oldestPendingSeconds || 0),
        schedulerLastCompletedAt: typeof raw.schedulerLastCompletedAt === "string" ? raw.schedulerLastCompletedAt : null,
        schedulerLastFailedAt: typeof raw.schedulerLastFailedAt === "string" ? raw.schedulerLastFailedAt : null,
      };
    } else {
      platformError = "Platform metrics are temporarily unavailable.";
    }
  }

  return approvalJson(cookieSource, correlationId, {
    windowHours: 24,
    generatedAt: new Date().toISOString(),
    summary: summarizeWorkflowOperationEvents(events),
    platform,
    platformError,
    alerts: platform ? evaluateApprovalOperationalAlerts(platform) : [],
  });
}

export async function POST(request: NextRequest) {
  const developmentUser = getDevelopmentAuthBypassUser({
    nodeEnv: process.env.NODE_ENV,
    email: process.env.E2E_AUTH_BYPASS_EMAIL,
  });
  if (developmentUser) {
    return NextResponse.json({ recorded: true });
  }

  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return createSupabaseJsonResponse(response, { error: "Not signed in" }, { status: 401 });
  }

  const bounded = await readBoundedJson(request, 16_000);
  if (!bounded.ok || !bounded.value || typeof bounded.value !== "object") {
    return createSupabaseJsonResponse(response, { error: "Invalid operation event." }, { status: 400 });
  }
  const body = bounded.value as {
    operationType?: WorkflowOperationType;
    outcome?: WorkflowOperationOutcome;
    requestNo?: string;
    durationMs?: number;
    message?: string;
    details?: Record<string, unknown>;
  };
  if (
    !workflowOperationTypes.includes(body.operationType as WorkflowOperationType) ||
    !outcomes.includes(body.outcome as WorkflowOperationOutcome)
  ) {
    return createSupabaseJsonResponse(response, { error: "Invalid operation event." }, { status: 400 });
  }

  const recorded = await recordWorkflowOperationEvent(supabase, {
    ownerUserId: user.id,
    ownerEmail: user.email,
    operationType: body.operationType as WorkflowOperationType,
    outcome: body.outcome as WorkflowOperationOutcome,
    requestNo: String(body.requestNo || "").slice(0, 160) || undefined,
    durationMs: body.durationMs,
    message: String(body.message || "").slice(0, 500),
    details:
      body.details && typeof body.details === "object" && !Array.isArray(body.details)
        ? body.details
        : {},
  });

  return createSupabaseJsonResponse(response, { recorded }, { status: recorded ? 200 : 503 });
}
