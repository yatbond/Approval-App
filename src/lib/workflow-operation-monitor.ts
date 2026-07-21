export const workflowOperationTypes = [
  "autosave",
  "extraction",
  "notification",
  "form_intake",
  "collaboration",
  "routing",
] as const;

export type WorkflowOperationType = (typeof workflowOperationTypes)[number];
export type WorkflowOperationOutcome = "succeeded" | "failed" | "skipped";

export type WorkflowOperationEvent = {
  id?: string;
  ownerUserId: string;
  ownerEmail: string;
  operationType: WorkflowOperationType;
  outcome: WorkflowOperationOutcome;
  requestNo?: string;
  durationMs?: number;
  message?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
};

export type WorkflowOperationEventRow = {
  id: string;
  owner_user_id: string;
  owner_email: string;
  operation_type: WorkflowOperationType;
  outcome: WorkflowOperationOutcome;
  request_no: string | null;
  duration_ms: number | null;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type OperationEventClient = {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{
      error: { message?: string } | null;
    }>;
  };
};

export async function recordWorkflowOperationEvent(
  supabase: OperationEventClient,
  event: WorkflowOperationEvent,
) {
  try {
    const { error } = await supabase.from("workflow_operation_events").insert({
      owner_user_id: event.ownerUserId,
      owner_email: event.ownerEmail,
      operation_type: event.operationType,
      outcome: event.outcome,
      request_no: event.requestNo || null,
      duration_ms:
        typeof event.durationMs === "number"
          ? Math.max(0, Math.round(event.durationMs))
          : null,
      message: event.message || "",
      details: event.details || {},
    });
    if (error) {
      console.warn(
        "[approval-app:operation-monitor]",
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "warn",
          service: "approval-workflow",
          event: "operation_monitor_write_failed",
          operationType: event.operationType,
          outcome: event.outcome,
          monitorError: error.message || "Unable to record operation event.",
        }),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      "[approval-app:operation-monitor]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "warn",
        service: "approval-workflow",
        event: "operation_monitor_write_failed",
        operationType: event.operationType,
        outcome: event.outcome,
        monitorError:
          error instanceof Error ? error.message : "Unable to record operation event.",
      }),
    );
    return false;
  }
}

export function summarizeWorkflowOperationEvents(
  events: WorkflowOperationEventRow[],
) {
  const byType = Object.fromEntries(
    workflowOperationTypes.map((operationType) => [
      operationType,
      { succeeded: 0, failed: 0, skipped: 0, total: 0 },
    ]),
  ) as Record<
    WorkflowOperationType,
    { succeeded: number; failed: number; skipped: number; total: number }
  >;

  for (const event of events) {
    const summary = byType[event.operation_type];
    if (!summary) continue;
    summary[event.outcome] += 1;
    summary.total += 1;
  }

  return {
    total: events.length,
    failed: events.filter((event) => event.outcome === "failed").length,
    latestAt: events[0]?.created_at || null,
    byType,
    recentFailures: events
      .filter((event) => event.outcome === "failed")
      .slice(0, 8),
  };
}
