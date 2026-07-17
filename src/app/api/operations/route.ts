import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";
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
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("workflow_operation_events")
    .select(
      "id,owner_user_id,owner_email,operation_type,outcome,request_no,duration_ms,message,details,created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { error: "Operation health is unavailable.", reason: error.message },
      { status: 503 },
    );
  }

  const events = (data || []) as WorkflowOperationEventRow[];
  return NextResponse.json({
    windowHours: 24,
    generatedAt: new Date().toISOString(),
    summary: summarizeWorkflowOperationEvents(events),
  });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
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
    return NextResponse.json({ error: "Invalid operation event." }, { status: 400 });
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

  return NextResponse.json({ recorded }, { status: recorded ? 200 : 503 });
}
