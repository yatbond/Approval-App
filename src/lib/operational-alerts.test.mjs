import assert from "node:assert/strict";
import test from "node:test";
import { evaluateApprovalOperationalAlerts } from "./operational-alerts.ts";

test("operational alerts apply explicit pilot thresholds", () => {
  const alerts = evaluateApprovalOperationalAlerts({
    databaseConnections: 18,
    databaseConnectionLimit: 20,
    lockWaits: 2,
    outboxPending: 3,
    outboxFailed: 1,
    oldestPendingSeconds: 301,
    schedulerLastCompletedAt: "2026-07-19T09:55:00.000Z",
    schedulerLastFailedAt: null,
  }, new Date("2026-07-19T10:00:00.000Z"));
  assert.deepEqual(alerts.map((alert) => alert.code), [
    "connections_high", "lock_wait", "outbox_failed", "outbox_stale", "scheduler_stale",
  ]);
});

test("healthy operational metrics produce no alerts", () => {
  assert.deepEqual(evaluateApprovalOperationalAlerts({
    databaseConnections: 12,
    databaseConnectionLimit: 100,
    lockWaits: 0,
    outboxPending: 0,
    outboxFailed: 0,
    oldestPendingSeconds: 0,
    schedulerLastCompletedAt: "2026-07-19T09:59:00.000Z",
    schedulerLastFailedAt: null,
  }, new Date("2026-07-19T10:00:00.000Z")), []);
});
