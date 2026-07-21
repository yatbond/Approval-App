"use client";

import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { InfoTip } from "./ui-hint";
import {
  workflowOperationTypes,
  type WorkflowOperationEventRow,
  type WorkflowOperationType,
} from "@/lib/workflow-operation-monitor";
import type {
  ApprovalOperationalAlert,
  ApprovalOperationalMetrics,
} from "@/lib/operational-alerts";

type OperationCounts = {
  succeeded: number;
  failed: number;
  skipped: number;
  total: number;
};

type HealthPayload = {
  windowHours: number;
  generatedAt: string;
  summary: {
    total: number;
    failed: number;
    latestAt: string | null;
    byType: Record<WorkflowOperationType, OperationCounts>;
    recentFailures: WorkflowOperationEventRow[];
  };
  platform: ApprovalOperationalMetrics | null;
  platformError: string | null;
  alerts: ApprovalOperationalAlert[];
};

async function fetchOperationHealth() {
  const response = await fetch("/api/operations", { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as
    | HealthPayload
    | { error?: string; reason?: string };
  if (!response.ok || !("summary" in body)) {
    throw new Error(
      "error" in body
        ? body.reason || body.error || "Operation health is unavailable."
        : "Operation health is unavailable.",
    );
  }
  return body;
}

const operationLabels: Record<WorkflowOperationType, string> = {
  autosave: "Autosave",
  extraction: "Document extraction",
  notification: "Email notification",
  form_intake: "Form intake",
  collaboration: "Collaboration",
  routing: "Workflow routing",
};

export function OperationalHealthPanel() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchOperationHealth());
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Operation health is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchOperationHealth()
      .then((body) => {
        if (!active) return;
        setPayload(body);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Operation health is unavailable.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasFailures = Boolean(payload?.summary.failed);

  return (
    <div className="rounded-md border border-[#e6e6e6] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">System health</h2>
            <InfoTip label="Server-recorded results from the last 24 hours. Monitoring failures never block the workflow action itself." />
          </div>
          <p className="mt-1 text-xs text-neutral-500">Last 24 hours</p>
        </div>
        <button
          type="button"
          onClick={() => void loadHealth()}
          disabled={loading}
          title="Refresh system health"
          aria-label="Refresh system health"
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-[#e6e6e6] bg-white transition hover:border-orange-400 disabled:opacity-45"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : loading && !payload ? (
        <p className="mt-3 text-sm text-neutral-500">Loading health data...</p>
      ) : payload ? (
        <>
          <div
            className={`mt-3 flex items-center gap-2 rounded-md border p-3 text-sm ${
              hasFailures
                ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
            }`}
          >
            {hasFailures ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>
              {hasFailures
                ? `${payload.summary.failed} failed operation(s) need review.`
                : payload.summary.total
                  ? "No recorded failures."
                  : "No server operations recorded yet."}
            </span>
          </div>

          <div className="mt-3 grid gap-2">
            {workflowOperationTypes.map((operationType) => {
              const counts = payload.summary.byType[operationType];
              return (
                <div
                  key={operationType}
                  className="flex items-center justify-between gap-3 rounded-md border border-[#e6e6e6] bg-white p-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Activity size={15} className="shrink-0 text-neutral-500" />
                    <span className="break-words">{operationLabels[operationType]}</span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {counts.failed ? `${counts.failed} failed / ` : ""}
                    {counts.total} total
                  </span>
                </div>
              );
            })}
          </div>

          {payload.summary.recentFailures.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Recent failures</h3>
              <div className="mt-2 space-y-2">
                {payload.summary.recentFailures.slice(0, 3).map((failure) => (
                  <div
                    key={failure.id}
                    className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs"
                  >
                    <p className="font-medium">
                      {operationLabels[failure.operation_type]}
                      {failure.request_no ? ` - ${failure.request_no}` : ""}
                    </p>
                    <p className="mt-1 break-words text-neutral-600 dark:text-neutral-300">
                      {failure.message || "Operation failed."}
                    </p>
                    <p className="mt-1 text-neutral-500">
                      {new Date(failure.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {payload.platform ? (
            <div className="mt-4" aria-label="Platform metrics">
              <h3 className="text-sm font-semibold">Platform metrics</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric label="DB connections" value={`${payload.platform.databaseConnections}/${payload.platform.databaseConnectionLimit}`} />
                <Metric label="Lock waits" value={payload.platform.lockWaits} />
                <Metric label="Outbox pending" value={payload.platform.outboxPending} />
                <Metric label="Outbox failed" value={payload.platform.outboxFailed} />
              </dl>
              {payload.alerts.length ? (
                <ul className="mt-3 space-y-2" aria-label="Operational alerts">
                  {payload.alerts.map((alert) => (
                    <li key={alert.code} className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
                      {alert.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-emerald-700">No platform alerts are active.</p>
              )}
            </div>
          ) : null}
          {payload.platformError ? (
            <p className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
              {payload.platformError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-[#e6e6e6] p-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}
