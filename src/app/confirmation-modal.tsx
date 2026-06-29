"use client";

import { useEffect } from "react";
import type { ConfirmationRequest } from "@/lib/confirmation-policy";

export function ConfirmationModal({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmationRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!request) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, request]);

  if (!request) {
    return null;
  }

  const confirmTone =
    request.tone === "danger"
      ? "border-rose-500/40 bg-rose-500/90 text-white hover:bg-rose-500"
      : "border-amber-400/40 bg-amber-400/90 text-neutral-950 hover:bg-amber-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        className="w-full max-w-md rounded-md border border-white/10 bg-[#121518] p-5 shadow-2xl"
      >
        <h2 id="confirmation-title" className="text-base font-semibold text-neutral-100">
          {request.title}
        </h2>
        <p id="confirmation-message" className="mt-2 text-sm leading-6 text-neutral-300">
          {request.message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-md border border-white/10 bg-white/[0.03] px-4 text-sm text-neutral-200 transition hover:bg-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-md border px-4 text-sm font-medium transition ${confirmTone}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
