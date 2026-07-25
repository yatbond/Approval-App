"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type RolloutPayload = {
  setting: {
    mode: string;
    cohort_percentage: number;
    legacy_read_fallback_until: string | null;
    legacy_writes_frozen: boolean;
    updated_at: string;
    reason: string;
  };
  unresolvedMismatchCount: number;
};

async function fetchRolloutStatus() {
  const response = await fetch("/api/admin/rollout", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.setting) throw new Error("Rollout status is unavailable.");
  return body as RolloutPayload;
}

export function RolloutStatusPanel() {
  const [payload, setPayload] = useState<RolloutPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchRolloutStatus());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Rollout status is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void fetchRolloutStatus()
      .then((body) => {
        if (!active) return;
        setPayload(body);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Rollout status is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="rounded-md border border-[#e6e6e6] bg-white p-4" aria-label="Approval rollout status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-emerald-700" />
            <h2 className="font-semibold">Approval rollout</h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Server-owned cutover and reconciliation state</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          title="Refresh rollout status" aria-label="Refresh rollout status"
          className="flex size-11 items-center justify-center rounded-md border border-[#e6e6e6] disabled:opacity-45">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {error ? <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700">{error}</p> : null}
      {payload ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Metric label="Mode" value={payload.setting.mode.replaceAll("_", " ")} />
          <Metric label="Cohort" value={`${payload.setting.cohort_percentage}%`} />
          <Metric label="Unresolved mismatches" value={payload.unresolvedMismatchCount} />
          <Metric label="Legacy writes" value={payload.setting.legacy_writes_frozen ? "Frozen" : "Unsafe"} />
          <div className="col-span-2 rounded-md border border-[#e6e6e6] p-3 sm:col-span-4">
            <dt className="text-neutral-500">Read fallback expiry</dt>
            <dd className="mt-1 break-words font-medium">
              {payload.setting.legacy_read_fallback_until
                ? new Date(payload.setting.legacy_read_fallback_until).toLocaleString()
                : "Disabled"}
            </dd>
            <dd className="mt-1 break-words text-neutral-500">{payload.setting.reason}</dd>
          </div>
        </dl>
      ) : loading ? <p className="mt-3 text-sm text-neutral-500">Loading rollout status...</p> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-[#e6e6e6] p-3"><dt className="text-neutral-500">{label}</dt><dd className="mt-1 break-words font-semibold capitalize">{value}</dd></div>;
}
