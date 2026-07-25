"use client";

import { BadgeCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useBuildVersion } from "./use-build-version";

type BuildVersionIndicatorProps = {
  variant?: "compact" | "panel";
  collapsed?: boolean;
};

function reloadApplication() {
  window.location.reload();
}

export function BuildVersionIndicator({
  variant = "compact",
  collapsed = false,
}: BuildVersionIndicatorProps) {
  const state = useBuildVersion();
  const metadata = "metadata" in state ? state.metadata : null;
  const shortRevision = metadata?.source?.shortRevision ?? null;

  if (variant === "panel") {
    const statusLabel =
      state.kind === "loading"
        ? "Checking identity"
        : state.kind === "current"
          ? metadata?.canonicalProduction
            ? "Live identity verified"
            : "Deployment identity verified"
          : state.kind === "update-available"
            ? "Update available"
            : state.kind === "local"
              ? "Local development"
              : "Identity unavailable";
    const statusClass =
      state.kind === "current"
        ? "border-[#7b791c]/40 bg-[#f5f6df] text-[#4d4c10]"
        : state.kind === "update-available" || state.kind === "unavailable"
          ? "border-amber-500/40 bg-amber-50 text-amber-800"
          : "border-[#e6e6e6] bg-[#f7f7f5] text-[#666162]";

    return (
      <section
        data-build-version-panel
        className="rounded-md border border-[#e6e6e6] bg-white p-4"
        aria-labelledby="application-release-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="application-release-heading" className="font-semibold">
              Application release
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Source and deployed artifact identity
            </p>
          </div>
          <span className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        {metadata ? (
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <dt className="text-neutral-500">Release</dt>
            <dd className="break-all text-right font-mono">{metadata.release.name}</dd>
            <dt className="text-neutral-500">Git revision</dt>
            <dd className="break-all text-right font-mono">
              {metadata.source?.revision ?? "Local source"}
            </dd>
            <dt className="text-neutral-500">Environment</dt>
            <dd className="text-right capitalize">{metadata.deployment.environment}</dd>
            <dt className="text-neutral-500">Deployment</dt>
            <dd className="break-all text-right font-mono">
              {metadata.deployment.id ?? "Local"}
            </dd>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">
            {state.kind === "loading"
              ? "Reading deployment metadata..."
              : "This deployment did not provide a verifiable build identity."}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#e6e6e6] pt-3 text-xs">
          {state.kind === "update-available" ? (
            <button
              type="button"
              onClick={reloadApplication}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#f7941d] bg-[#fff4e6] px-3 font-medium text-[#713d00]"
            >
              <RefreshCw size={14} />
              Reload current release
            </button>
          ) : null}
          <a
            href="/api/version"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#7b791c] underline-offset-2 hover:underline"
          >
            Open version API
          </a>
        </div>
      </section>
    );
  }

  const isProblem =
    state.kind === "update-available" || state.kind === "unavailable";
  const label =
    state.kind === "loading"
      ? "Checking build"
      : state.kind === "update-available"
        ? "Update available"
        : state.kind === "unavailable"
          ? "Version unavailable"
          : state.kind === "local"
            ? "Local development"
            : `Build ${shortRevision}`;
  const title =
    state.kind === "current" && metadata?.source
      ? `${metadata.release.name} · ${metadata.source.revision} · ${metadata.deployment.id}`
      : label;

  return (
    <div
      data-build-version-indicator
      className={`border-t border-[#e6e6e6] p-2 lg:mt-auto lg:p-3 ${
        isProblem ? "text-amber-800" : "text-[#666162]"
      }`}
      title={title}
    >
      <div
        className={`flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#f7f7f5] px-2 text-xs ${
          collapsed ? "lg:px-0" : "lg:justify-start"
        }`}
        aria-live="polite"
      >
        {isProblem ? (
          <TriangleAlert className="size-4 shrink-0" />
        ) : (
          <BadgeCheck className="size-4 shrink-0" />
        )}
        <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
        {collapsed && shortRevision ? (
          <span className="hidden font-mono text-[10px] lg:inline">
            {shortRevision.slice(0, 4)}
          </span>
        ) : null}
        {state.kind === "update-available" ? (
          <button
            type="button"
            onClick={reloadApplication}
            title="Reload current release"
            aria-label="Reload current release"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#f7941d]/50 bg-white"
          >
            <RefreshCw size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
