"use client";

import { FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  getUploadDraftResumeItems,
  type SavedUploadRequestDraft,
  type UploadRequestDraft,
  type UploadRequestDraftStatus,
} from "@/lib/upload-request-draft-state";
import type { WorkflowTemplate } from "@/lib/types";

export function UploadDraftsView({
  currentDraft,
  uploadDraftStatus,
  savedUploadDrafts,
  workflowTemplates,
  selectedUploadDraftId,
  onResumeSavedDraft,
  onDeleteRequestDraft,
}: {
  currentDraft: UploadRequestDraft | null;
  uploadDraftStatus: UploadRequestDraftStatus;
  savedUploadDrafts: SavedUploadRequestDraft[];
  workflowTemplates: WorkflowTemplate[];
  selectedUploadDraftId: string;
  onResumeSavedDraft: (draft: SavedUploadRequestDraft) => void;
  onDeleteRequestDraft: (draftId: string) => void;
}) {
  const resumeItems = getUploadDraftResumeItems({
    currentDraft,
    currentDraftStatus: uploadDraftStatus,
    savedDrafts: savedUploadDrafts,
    templates: workflowTemplates,
  });
  const savedDraftById = new Map(savedUploadDrafts.map((draft) => [draft.id, draft]));

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Request drafts</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Resume interrupted uploads, OCR review, highlighted fields, and saved attachments.
          </p>
        </div>
        <Link
          href="/?tab=upload"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
        >
          <Plus size={16} />
          New request
        </Link>
      </div>

      {resumeItems.length === 0 ? (
        <div className="p-5">
          <div className="rounded-md border border-dashed border-white/10 bg-[#121518] p-6 text-center">
            <FileText className="mx-auto text-neutral-500" size={28} />
            <p className="mt-3 text-sm font-medium text-neutral-200">
              No request drafts
            </p>
            <p className="mx-auto mt-1 max-w-xl text-sm text-neutral-500">
              Upload a document or save a named draft from the Upload tab to resume it here later.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 p-5 xl:grid-cols-2">
          {resumeItems.map((item) => {
            const savedDraft = savedDraftById.get(item.id);
            return (
              <article
                key={item.id}
                className={`rounded-md border p-4 ${
                  item.id === selectedUploadDraftId
                    ? "border-emerald-400/50 bg-emerald-400/5"
                    : "border-white/10 bg-[#121518]"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold text-neutral-100">
                        {item.title}
                      </p>
                      <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-neutral-400">
                        {item.type === "current" ? "Autosave" : "Saved draft"}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm text-neutral-400">
                      {item.templateName}
                    </p>
                    <p className="mt-1 break-words text-xs text-neutral-500">
                      {item.fileName}
                    </p>
                  </div>
                  <div className="text-left text-xs text-neutral-500 sm:text-right">
                    <p>{item.detail}</p>
                    <p className="mt-1">{formatDraftDate(item.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  {item.type === "current" ? (
                    <Link
                      href="/?tab=upload"
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
                    >
                      <RotateCcw size={15} />
                      Resume autosave
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => savedDraft && onResumeSavedDraft(savedDraft)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
                    >
                      <RotateCcw size={15} />
                      Resume
                    </button>
                  )}
                  {item.type === "saved" && (
                    <button
                      type="button"
                      onClick={() => onDeleteRequestDraft(item.id)}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20 sm:flex-none"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatDraftDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved time unavailable";
  }

  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate(),
  )} ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())} UTC`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
