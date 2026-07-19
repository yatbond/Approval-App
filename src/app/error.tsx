"use client";

import { useEffect } from "react";
import { clearRecoverableApprovalLocalState } from "@/lib/local-recovery";

export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Approval workspace render failed", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  function clearLocalCacheAndRetry() {
    clearRecoverableApprovalLocalState(window.localStorage);
    unstable_retry();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5] p-6 text-[#231f20]">
      <section className="w-full max-w-lg rounded-md border border-[#d2d2d2] bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold">The workspace could not be displayed</h1>
        <p className="mt-3 text-sm leading-6 text-[#4b4647]">
          Try loading the workspace again first; that keeps this app&apos;s local
          recovery data. If a damaged local cache caused the problem, clear only
          that recoverable data and retry.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-neutral-500">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="min-h-11 rounded-md border border-[#e6810c] bg-[#f7941d] px-4 text-sm font-medium"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={clearLocalCacheAndRetry}
            className="min-h-11 rounded-md border border-[#d2d2d2] bg-white px-4 text-sm"
          >
            Clear local cache and retry
          </button>
        </div>
      </section>
    </main>
  );
}
