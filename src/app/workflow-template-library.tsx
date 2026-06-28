"use client";

import { useState } from "react";
import { Archive, CheckCircle2, Copy, RotateCcw, Save } from "lucide-react";
import {
  getWorkflowTemplateLibraryItems,
  type WorkflowTemplateLibrarySection,
} from "@/lib/workflow-template-library-state";
import type { UserRole, WorkflowTemplate } from "@/lib/types";

export function WorkflowTemplateLibrary({
  workflowTemplates,
  selectedTemplateId,
  onSelectTemplate,
  onLoadTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onActivateTemplateVersion,
  onUpdateTemplateVersionComment,
  activeUserEmail,
  activeUserRole,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onLoadTemplate: (template: WorkflowTemplate) => void;
  onDuplicateTemplate: (template: WorkflowTemplate) => void;
  onDeleteTemplate: (templateId: string) => void | Promise<void>;
  onActivateTemplateVersion: (templateId: string) => void;
  onUpdateTemplateVersionComment: (templateId: string, comment: string) => void;
  activeUserEmail: string;
  activeUserRole: UserRole;
}) {
  const [section, setSection] =
    useState<Exclude<WorkflowTemplateLibrarySection, "all">>("library");
  const [versionComments, setVersionComments] = useState<Record<string, string>>({});
  const templateItems = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
    activeUserEmail,
    activeUserRole,
    section,
  });
  const libraryCount = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
    activeUserEmail,
    activeUserRole,
    section: "library",
  }).length;
  const versionsCount = workflowTemplates.filter(
    (template) => template.isArchived !== true,
  ).length;
  const archiveCount = workflowTemplates.length - versionsCount;
  const isArchive = section === "archive";
  const isVersions = section === "versions";
  const sectionTitle = isArchive
    ? "Archived workflows"
    : isVersions
      ? "Workflow versions"
      : "Active workflows";
  const sectionDescription = isArchive
    ? "Archived workflows are kept for history and cannot be used for new requests."
    : isVersions
      ? "Choose which published version is active and document why each version exists."
      : "Drafts and active published workflow templates for new requests.";

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">
            {sectionTitle}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">{sectionDescription}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-md border border-white/10 bg-[#101214] p-1 text-sm sm:w-auto">
          <button
            type="button"
            onClick={() => setSection("library")}
            className={`min-h-11 rounded px-3 transition ${
              section === "library"
                ? "bg-emerald-400/15 text-emerald-100"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
            }`}
          >
            Active ({libraryCount})
          </button>
          <button
            type="button"
            onClick={() => setSection("versions")}
            className={`min-h-11 rounded px-3 transition ${
              section === "versions"
                ? "bg-sky-400/15 text-sky-100"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
            }`}
          >
            Versions ({versionsCount})
          </button>
          <button
            type="button"
            onClick={() => setSection("archive")}
            className={`min-h-11 rounded px-3 transition ${
              section === "archive"
                ? "bg-amber-400/15 text-amber-100"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
            }`}
          >
            Archived ({archiveCount})
          </button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {templateItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-md border p-3 text-left transition ${
              item.isSelected
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-white/10 bg-[#121518] hover:border-white/20"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (!isArchive) {
                  onSelectTemplate(item.id);
                }
              }}
              disabled={isArchive}
              title={
                isArchive
                  ? "Archived workflows are read-only and cannot be selected for editing."
                  : "Select this workflow template."
              }
              className="block w-full text-left disabled:cursor-default"
            >
              <p className="break-words text-sm font-medium">
                {item.template.name}
              </p>
              <p className="mt-1 break-words text-xs text-neutral-400">
                {item.businessDepartmentLabel}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                {item.countsLabel}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-neutral-300">
                  {item.versionLabel}
                </span>
                <span className={`rounded border px-2 py-1 ${statusToneClassName(item.statusTone)}`}>
                  {item.statusLabel}
                </span>
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-neutral-400">
                  {item.ownershipLabel}
                </span>
              </div>
            </button>
            {isVersions && (
              <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-[#0d1013] p-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-500">
                    Version note
                  </span>
                  <textarea
                    value={versionComments[item.id] ?? item.versionComment}
                    onChange={(event) =>
                      setVersionComments((comments) => ({
                        ...comments,
                        [item.id]: event.target.value,
                      }))
                    }
                    disabled={!item.canComment}
                    rows={2}
                    placeholder="Why this version exists or when to use it."
                    title={
                      item.canComment
                        ? "Document why this workflow version exists."
                        : "Only superusers or the workflow creator can edit version notes."
                    }
                    className="w-full resize-y rounded-md border border-white/10 bg-[#121518] px-2 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateTemplateVersionComment(
                        item.id,
                        versionComments[item.id] ?? item.versionComment,
                      )
                    }
                    disabled={!item.canComment}
                    title={
                      item.canComment
                        ? "Save this version note."
                        : "Only superusers or the workflow creator can save version notes."
                    }
                    className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save size={15} />
                    {item.commentActionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onActivateTemplateVersion(item.id)}
                    disabled={!item.canActivate}
                    title={
                      item.canActivate
                        ? "Use this published version for new requests."
                        : "Only inactive published versions managed by you can be made active."
                    }
                    className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <CheckCircle2 size={15} />
                    {item.activateActionLabel}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => onLoadTemplate(item.template)}
                disabled={!item.canOpen}
                title={
                  item.canOpen
                    ? "Open this editable draft in the canvas."
                    : "Only editable, non-archived templates can be opened directly."
                }
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw size={15} />
                {item.openActionLabel}
              </button>
              <button
                type="button"
                onClick={() => onDuplicateTemplate(item.template)}
                disabled={!item.canDuplicate}
                title="Create a new editable draft from this workflow."
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Copy size={15} />
                {item.duplicateActionLabel}
              </button>
              <button
                type="button"
                onClick={() => void onDeleteTemplate(item.id)}
                disabled={!item.canDelete}
                title={
                  item.canDelete
                    ? "Archive this template so it cannot be used for new requests."
                    : "Only superusers or template creators can archive editable templates."
                }
                className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Archive size={15} />
                {item.archiveActionLabel}
              </button>
            </div>
          </div>
        ))}
        {!templateItems.length && (
          <div className="rounded-md border border-white/10 bg-[#121518] p-4 text-sm text-neutral-400 lg:col-span-2">
            {isArchive
              ? "No archived workflows."
              : isVersions
                ? "No workflow versions."
              : "No active workflows."}
          </div>
        )}
      </div>
    </div>
  );
}

function statusToneClassName(statusTone: string) {
  if (statusTone === "active") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }
  if (statusTone === "inactive") {
    return "border-sky-400/30 bg-sky-400/10 text-sky-100";
  }
  if (statusTone === "archived") {
    return "border-neutral-500/30 bg-neutral-500/10 text-neutral-300";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-100";
}
