"use client";

import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const actionHandledRef = useRef(false);

  useEffect(() => {
    if (!request) {
      return;
    }

    actionHandledRef.current = false;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFrame = window.requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!actionHandledRef.current) {
          actionHandledRef.current = true;
          onCancel();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
      if (!focusableElements.length) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel, request]);

  function handleCancel() {
    if (actionHandledRef.current) {
      return;
    }
    actionHandledRef.current = true;
    onCancel();
  }

  function handleConfirm() {
    if (actionHandledRef.current) {
      return;
    }
    actionHandledRef.current = true;
    onConfirm();
  }

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
        ref={dialogRef}
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
            ref={cancelButtonRef}
            type="button"
            onClick={handleCancel}
            className="min-h-10 rounded-md border border-[#d2d2d2] bg-white px-4 text-sm text-[#231f20] transition hover:bg-[#f2f2f2]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`min-h-10 rounded-md border px-4 text-sm font-medium transition ${confirmTone}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
