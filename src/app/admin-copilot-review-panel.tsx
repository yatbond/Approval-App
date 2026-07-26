"use client";

import { LoaderCircle, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  TemplateCopilotSessionSummary,
  TemplateCopilotTranscript,
} from "@/lib/template-copilot-history";
import { fetchTemplateCopilotApi } from "@/lib/template-copilot-client";
import {
  CopilotTranscript,
  formatCopilotDateTime,
} from "./copilot-transcript";

export function AdminCopilotReviewPanel() {
  const [sessions, setSessions] =
    useState<TemplateCopilotSessionSummary[] | null>(null);
  const [selected, setSelected] =
    useState<TemplateCopilotTranscript | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions || [];
    return (sessions || []).filter((session) =>
      [
        session.owner?.fullName,
        session.owner?.email,
        session.businessName,
        session.departmentName,
        session.status,
        session.model,
      ].some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, sessions]);

  async function loadSessions() {
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<{
        sessions: TemplateCopilotSessionSummary[];
      }>(
        "/api/template-authoring/copilot/sessions?view=review&limit=50",
      );
      setSessions(payload.sessions || []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openTranscript(sessionId: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await fetchTemplateCopilotApi<{
        session: TemplateCopilotTranscript;
      }>(
        `/api/template-authoring/copilot/sessions/${sessionId}`,
      );
      const transcript = payload.session;
      const summary = sessions?.find((session) => session.id === sessionId);
      setSelected({
        ...transcript,
        ...(summary?.owner ? { owner: summary.owner } : {}),
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex items-start gap-2">
        <ShieldCheck
          aria-hidden="true"
          size={18}
          className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"
        />
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            Copilot conversation review
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            Active Admins can inspect employee transcripts to find confusing
            questions, missing requirements, and improvement opportunities.
            This view is read-only.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void loadSessions()}
        disabled={busy}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/50 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 disabled:opacity-50 dark:bg-emerald-400/10 dark:text-emerald-100"
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
        ) : sessions ? (
          <RefreshCw aria-hidden="true" size={16} />
        ) : (
          <ShieldCheck aria-hidden="true" size={16} />
        )}
        {sessions ? "Refresh review queue" : "Load review queue"}
      </button>

      {sessions ? (
        <>
          <label
            htmlFor="copilot-review-search"
            className="mt-4 block text-xs font-medium text-neutral-600 dark:text-neutral-300"
          >
            Search employee, workflow scope, status, or model
          </label>
          <div className="relative mt-1">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute left-3 top-3.5 text-neutral-500"
            />
            <input
              id="copilot-review-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search 50 recent sessions"
              className="template-copilot-control min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-emerald-400/60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
            {filtered.map((session) => (
              <button
                key={session.id}
                type="button"
                disabled={busy}
                onClick={() => void openTranscript(session.id)}
                className={`block w-full rounded-md border p-3 text-left transition ${
                  selected?.id === session.id
                    ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-400/10"
                    : "border-[#e6e6e6] hover:border-emerald-400/60 dark:border-neutral-700"
                }`}
              >
                <span className="block break-words text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {session.owner?.fullName || session.owner?.email || "Unknown employee"}
                </span>
                <span className="mt-1 block break-words text-xs text-neutral-500 dark:text-neutral-400">
                  {session.businessName} / {session.departmentName}
                </span>
                <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  {statusLabel(session.status)} ·{" "}
                  {formatCopilotDateTime(session.updatedAt, "en-HK")}
                </span>
              </button>
            ))}
            {!filtered.length ? (
              <p className="rounded-md border border-dashed border-[#d2d2d2] p-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                No Copilot sessions match this search.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {selected ? (
        <div className="mt-4 border-t border-[#e6e6e6] pt-4 dark:border-neutral-700">
          <h3 className="break-words text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {selected.owner?.fullName || selected.owner?.email || "Employee"} ·{" "}
            {selected.businessName} / {selected.departmentName}
          </h3>
          <p className="mt-1 break-words text-xs text-neutral-500 dark:text-neutral-400">
            {statusLabel(selected.status)}
            {selected.model ? ` · ${selected.model}` : ""}
          </p>
          <div className="mt-3">
            <CopilotTranscript
              transcript={selected}
              userLabel="Employee"
              copilotLabel="Copilot"
              emptyLabel="No messages were saved for this session."
              locale="en-HK"
            />
          </div>
        </div>
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

function statusLabel(status: TemplateCopilotSessionSummary["status"]) {
  return {
    interviewing: "Interview in progress",
    ready: "Requirements confirmed",
    draft_created: "Draft created",
    closed: "Closed",
  }[status];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
