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
      : "border-[#e6810c] bg-[#f7941d] text-[#231f20] hover:bg-[#e6810c]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#231f20]/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        className="w-full max-w-md rounded-md border border-[#d2d2d2] bg-white p-5 shadow-2xl"
      >
        <h2 id="confirmation-title" className="text-base font-semibold text-[#231f20]">
          {request.title}
        </h2>
        <p id="confirmation-message" className="mt-2 text-sm leading-6 text-[#4b4647]">
          {request.message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-md border border-[#d2d2d2] bg-white px-4 text-sm text-[#231f20] transition hover:bg-[#f2f2f2]"
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
