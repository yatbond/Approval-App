"use client";

import { Activity, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { fetchTemplateCopilotApi } from "@/lib/template-copilot-client";
import type { TemplateCopilotV2TelemetryAdminViewEvent } from "@/lib/template-copilot-v2-telemetry";
import { formatCopilotDateTime } from "./copilot-transcript";

type TelemetryResponse = {
  enabled: boolean;
  retentionDays: number;
  events: TemplateCopilotV2TelemetryAdminViewEvent[];
};

export function AdminCopilotTelemetryPanel() {
  const [response, setResponse] = useState<TelemetryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const summary = useMemo(() => summarize(response?.events || []), [response]);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<TelemetryResponse>(
        "/api/admin/template-copilot-telemetry?limit=100",
      );
      setResponse(payload);
    } catch {
      setError("Copilot operational telemetry is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex items-start gap-2">
        <Activity
          aria-hidden="true"
          size={18}
          className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"
        />
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            Copilot operational telemetry
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Active Admins can review structured outcomes, timing, and provider
            routing. Raw answers, prompts, documents, names, and email addresses
            are never stored here.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void load()}
        disabled={busy}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 disabled:opacity-50 dark:bg-emerald-400/10 dark:text-emerald-100"
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        ) : response ? (
          <RefreshCw aria-hidden="true" size={16} />
        ) : (
          <ShieldCheck aria-hidden="true" size={16} />
        )}
        {response ? "Refresh operational evidence" : "Load operational evidence"}
      </button>

      {response ? (
        response.enabled ? (
          <>
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Latest {response.events.length} events · automatic deletion after{" "}
              {response.retentionDays} days
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Recorded events" value={response.events.length} />
              <Metric label="Provider calls" value={summary.providerCalls} />
              <Metric label="ZDR provider calls" value={summary.zdrProviderCalls} />
              <Metric label="Non-success outcomes" value={summary.nonSuccess} />
              <Metric
                label="Rejected candidates"
                value={summary.rejectedCandidates}
              />
            </dl>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {response.events.map((event) => (
                <article
                  key={event.eventId}
                  className="rounded-md border border-[#e6e6e6] p-3 text-xs dark:border-neutral-700"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      {humanize(event.eventType)}
                    </strong>
                    <time className="text-neutral-500 dark:text-neutral-400">
                      {formatCopilotDateTime(event.occurredAt, "en-HK")}
                    </time>
                  </div>
                  <p className="mt-1 break-words text-neutral-600 dark:text-neutral-300">
                    {event.locale} · {humanize(event.mode)} ·{" "}
                    {humanize(event.outcomeCode)} · revision {event.revision}
                  </p>
                  {event.provider ? (
                    <>
                      <p className="mt-1 break-words text-neutral-500 dark:text-neutral-400">
                        {event.provider.providerCode} / {event.provider.modelCode} ·{" "}
                        {event.provider.privacyMode.toUpperCase()} ·{" "}
                        {event.provider.latencyMs} ms average request latency
                      </p>
                      <ProviderDiagnostics counts={event.counts} />
                    </>
                  ) : null}
                </article>
              ))}
              {!response.events.length ? (
                <p className="rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  No retained Copilot telemetry is available.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            Operational telemetry is disabled in this environment.
          </p>
        )
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-50 p-2 dark:bg-neutral-900">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function summarize(events: TemplateCopilotV2TelemetryAdminViewEvent[]) {
  return {
    providerCalls: events.reduce(
      (total, event) => total + providerRequestCount(event),
      0,
    ),
    zdrProviderCalls: events.reduce(
      (total, event) =>
        total +
        (event.provider?.privacyMode === "zdr"
          ? providerRequestCount(event)
          : 0),
      0,
    ),
    nonSuccess: events.reduce(
      (total, event) =>
        total +
        (event.counts.provider_request_failures ??
          (event.provider && event.provider.outcome !== "success" ? 1 : 0)),
      0,
    ),
    rejectedCandidates: events.reduce(
      (total, event) => total + (event.counts.candidates_rejected || 0),
      0,
    ),
  };
}

function providerRequestCount(
  event: TemplateCopilotV2TelemetryAdminViewEvent,
) {
  return event.counts.provider_requests ?? (event.provider ? 1 : 0);
}

function ProviderDiagnostics({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const reasons = Object.entries(counts)
    .filter(([key, count]) => key.startsWith("rejection_") && count > 0)
    .map(([key, count]) => `${humanize(key.slice("rejection_".length))}: ${count}`);
  return (
    <div className="mt-2 rounded bg-neutral-50 p-2 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
      <p>
        Provider requests: {counts.provider_requests || 0} · succeeded:{" "}
        {counts.provider_request_successes || 0} · failed:{" "}
        {counts.provider_request_failures || 0}
      </p>
      <p className="mt-1">
        Accepted candidates: {counts.candidates_accepted || 0} · rejected:{" "}
        {counts.candidates_rejected || 0}
      </p>
      {reasons.length ? (
        <p className="mt-1 break-words">Reasons: {reasons.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}
