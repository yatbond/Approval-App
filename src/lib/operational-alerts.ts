export type ApprovalOperationalMetrics = {
  databaseConnections: number;
  databaseConnectionLimit: number;
  lockWaits: number;
  outboxPending: number;
  outboxFailed: number;
  oldestPendingSeconds: number;
  schedulerLastCompletedAt: string | null;
  schedulerLastFailedAt: string | null;
};

export type ApprovalOperationalAlert = {
  code: "connections_high" | "lock_wait" | "outbox_failed" | "outbox_stale" | "scheduler_stale";
  severity: "warning" | "critical";
  message: string;
};

export function evaluateApprovalOperationalAlerts(
  metrics: ApprovalOperationalMetrics,
  now = new Date(),
): ApprovalOperationalAlert[] {
  const alerts: ApprovalOperationalAlert[] = [];
  if (
    metrics.databaseConnectionLimit > 0 &&
    metrics.databaseConnections / metrics.databaseConnectionLimit >= 0.8
  ) {
    alerts.push({ code: "connections_high", severity: "warning", message: `Database connections are at ${metrics.databaseConnections} of ${metrics.databaseConnectionLimit}.` });
  }
  if (metrics.lockWaits > 0) {
    alerts.push({ code: "lock_wait", severity: "critical", message: `${metrics.lockWaits} database session(s) are waiting on locks.` });
  }
  if (metrics.outboxFailed > 0) {
    alerts.push({ code: "outbox_failed", severity: "critical", message: `${metrics.outboxFailed} email delivery item(s) are exhausted.` });
  }
  if (metrics.oldestPendingSeconds > 300) {
    alerts.push({ code: "outbox_stale", severity: "warning", message: "The oldest pending email has waited more than five minutes." });
  }
  const completedAt = metrics.schedulerLastCompletedAt
    ? new Date(metrics.schedulerLastCompletedAt).getTime()
    : 0;
  if (!completedAt || now.getTime() - completedAt > 3 * 60 * 1000) {
    alerts.push({ code: "scheduler_stale", severity: "critical", message: "The approval scheduler has not completed in the last three minutes." });
  }
  return alerts;
}
