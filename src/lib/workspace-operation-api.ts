import type {
  WorkflowOperationOutcome,
  WorkflowOperationType,
} from "./workflow-operation-monitor";

export async function recordWorkspaceOperation({
  operationType,
  outcome,
  requestNo,
  durationMs,
  message,
  details,
}: {
  operationType: WorkflowOperationType;
  outcome: WorkflowOperationOutcome;
  requestNo?: string;
  durationMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationType,
        outcome,
        requestNo,
        durationMs,
        message,
        details,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
