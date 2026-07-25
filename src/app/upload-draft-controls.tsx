"use client";

import { ChevronDown, FolderOpen, Save, Trash2, X } from "lucide-react";
import { useRef } from "react";
import {
  getUploadWorkInProgressItems,
  type SavedUploadRequestDraft,
  type UploadRequestDraftStatus,
} from "@/lib/upload-request-draft-state";
import { InfoTip } from "./ui-hint";

export function UploadDraftControls({
  uploadDraftStatus,
  savedUploadDrafts,
  selectedUploadDraftId,
  uploadDraftTitle,
  setUploadDraftTitle,
  uploadDraftMessage,
  onSaveRequestDraft,
  onLoadRequestDraft,
  onDeleteRequestDraft,
  onClearRequestDraft,
}: {
  uploadDraftStatus: UploadRequestDraftStatus;
  savedUploadDrafts: SavedUploadRequestDraft[];
  selectedUploadDraftId: string;
  uploadDraftTitle: string;
  setUploadDraftTitle: (title: string) => void;
  uploadDraftMessage: string;
  onSaveRequestDraft: (options?: { asNew?: boolean }) => void;
  onLoadRequestDraft: (draft: SavedUploadRequestDraft) => void;
  onDeleteRequestDraft: (draftId: string) => void;
  onClearRequestDraft: () => void;
}) {
  const workInProgressItems = getUploadWorkInProgressItems({
    activeDraftId: selectedUploadDraftId,
    currentDraftStatus: uploadDraftStatus,
    savedDrafts: savedUploadDrafts,
  });
  const draftMenuRef = useRef<HTMLDetailsElement>(null);
  const autosaveDetail = uploadDraftStatus.label.replace(/^Autosaved\s*/, "");

  return (
    <section className="relative min-w-0 rounded-md border border-[#e6e6e6] bg-white p-3 shadow-sm xl:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-200">Draft controls</h2>
            <InfoTip label="This request is saved automatically. Open the draft list to switch drafts, save a named copy, or discard the current work." />
          </div>
          <p className="mt-1 break-words text-xs text-neutral-500">
            {uploadDraftStatus.hasDraft
              ? `Saved automatically - ${autosaveDetail}`
              : "Your progress will be saved automatically after you add information."}
          </p>
        </div>

        <details ref={draftMenuRef} className="relative w-full sm:w-auto">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-[#d2d2d2] bg-white px-3 text-sm font-medium text-neutral-200 transition hover:border-[#f7941d] hover:bg-[#fff4e5] sm:min-w-32">
            Drafts ({workInProgressItems.length})
            <ChevronDown size={16} />
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-md border border-[#d2d2d2] bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-200">Available drafts</h3>
              <span className="text-xs text-neutral-500">
                {workInProgressItems.length} total
              </span>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {workInProgressItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-sm text-neutral-500">
                  No draft content yet.
                </p>
              ) : null}

              {workInProgressItems.some((item) => item.type === "current") ? (
                <div className="rounded-md border border-[#f7941d]/50 bg-[#fff4e5] p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-100">Current work</p>
                      <p className="mt-1 break-words text-xs text-neutral-500">
                        {uploadDraftStatus.label}
                      </p>
                    </div>
                    <span className="rounded-md border border-[#f7941d]/40 bg-white px-2 py-1 text-xs font-medium text-[#713d00]">
                      Currently open
                    </span>
                  </div>
                </div>
              ) : null}

              {savedUploadDrafts.map((draft) => {
                const summary = workInProgressItems.find((item) => item.id === draft.id);
                const isOpen = draft.id === selectedUploadDraftId;
                return (
                  <div
                    key={draft.id}
                    className={`rounded-md border p-3 text-sm ${
                      isOpen
                        ? "border-[#f7941d]/50 bg-[#fff4e5]"
                        : "border-[#e6e6e6] bg-[#f7f7f5]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-medium text-neutral-100">
                            {draft.title}
                          </p>
                          <span className="rounded-md border border-[#d2d2d2] bg-white px-2 py-0.5 text-[11px] text-neutral-500">
                            Saved draft
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">{summary?.detail}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isOpen ? (
                          <span className="rounded-md border border-[#f7941d]/40 bg-white px-2 py-1 text-xs font-medium text-[#713d00]">
                            Currently open
                          </span>
                        ) : (
                          <button
                            type="button"
                            title={`Open saved draft ${draft.title}`}
                            aria-label={`Open saved draft ${draft.title}`}
                            onClick={() => {
                              onLoadRequestDraft(draft);
                              draftMenuRef.current?.removeAttribute("open");
                            }}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
                          >
                            <FolderOpen size={15} />
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          title={`Delete saved draft ${draft.title}`}
                          aria-label={`Delete saved draft ${draft.title}`}
                          onClick={() => onDeleteRequestDraft(draft.id)}
                          className="inline-flex size-10 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {uploadDraftStatus.hasDraft ? (
              <div className="mt-3 border-t border-[#e6e6e6] pt-3">
                <h3 className="text-sm font-semibold text-neutral-200">Save as new draft</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="block">
                    <span className="sr-only">New draft name</span>
                    <input
                      value={uploadDraftTitle}
                      onChange={(event) => setUploadDraftTitle(event.target.value)}
                      placeholder="Draft name"
                      className="min-h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none transition focus:border-emerald-400/60"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onSaveRequestDraft({ asNew: true })}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20"
                  >
                    <Save size={15} />
                    Save as new
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClearRequestDraft}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20"
                >
                  <X size={15} />
                  Discard current work
                </button>
              </div>
            ) : null}
          </div>
        </details>
      </div>

      {uploadDraftMessage ? (
        <p className="mt-2 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] px-3 py-2 text-xs text-neutral-300">
          {uploadDraftMessage}
        </p>
      ) : null}
    </section>
  );
}
