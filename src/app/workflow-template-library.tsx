"use client";

import { Archive, CheckCircle2, FilePenLine, GitBranchPlus, Save } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getWorkflowTemplateLibraryItems,
  type WorkflowTemplateLibrarySection,
} from "@/lib/workflow-template-library-state";
import { getWorkflowTemplateFamilyKey } from "@/lib/workflow-template-version-state";
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
    useState<Extract<WorkflowTemplateLibrarySection, "versions" | "archive">>("versions");
  const [versionComments, setVersionComments] = useState<Record<string, string>>({});
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
    activeUserEmail,
    activeUserRole,
    section,
  });
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof items>();
    items.forEach((item) => {
      const familyKey = getWorkflowTemplateFamilyKey(item.template);
      grouped.set(familyKey, [...(grouped.get(familyKey) || []), item]);
    });
    return Array.from(grouped.values())
      .map((versions) => {
        const uniqueVersions = new Map<string, (typeof versions)[number]>();
        versions.forEach((item) => {
          const key = `${item.template.isDraft === false ? "published" : "draft"}:${item.template.version || 1}`;
          const current = uniqueVersions.get(key);
          const itemTimestamp = item.template.updatedAt || item.template.publishedAt || item.template.createdAt || "";
          const currentTimestamp = current?.template.updatedAt || current?.template.publishedAt || current?.template.createdAt || "";
          if (!current || item.statusTone === "active" && current.statusTone !== "active" || itemTimestamp > currentTimestamp) {
            uniqueVersions.set(key, item);
          }
        });
        return Array.from(uniqueVersions.values()).sort(
          (left, right) => (right.template.version || 1) - (left.template.version || 1),
        );
      })
      .sort((left, right) => left[0].template.name.localeCompare(right[0].template.name));
  }, [items]);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Workflow library</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Each workflow keeps its drafts and published versions together. The active
            version is used only for new requests.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-1 dark:border-neutral-700 dark:bg-neutral-900">
          <button type="button" onClick={() => setSection("versions")} className={tabClassName(section === "versions")}>Available</button>
          <button type="button" onClick={() => setSection("archive")} className={tabClassName(section === "archive")}>Archived</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((versions) => {
          const workflow = versions[0].template;
          const activeVersionId = versions
            .filter((item) => item.statusTone === "active")
            .sort((left, right) => (right.template.version || 1) - (left.template.version || 1))[0]?.id;
          return (
            <article key={getWorkflowTemplateFamilyKey(workflow)} className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{workflow.name}</h3>
              <p className="mt-1 text-xs text-neutral-500">{workflow.business} - {workflow.department}</p>
              <div className="mt-3 space-y-2">
                {versions.map((item) => {
                  const isPublished = item.template.isDraft === false;
                  const effectiveStatusTone =
                    item.statusTone === "active" && item.id !== activeVersionId
                      ? "inactive"
                      : item.statusTone;
                  const effectiveStatusLabel =
                    item.statusTone === "active" && item.id !== activeVersionId
                      ? "Inactive"
                      : item.statusLabel;
                  const canActivate =
                    item.canActivate ||
                    (isPublished && item.canComment && item.id !== activeVersionId);
                  return (
                  <div
                    key={item.id}
                    className={`rounded-md border bg-white p-3 dark:bg-neutral-950 ${
                      item.isSelected ? "border-[#f7941d]" : "border-[#e6e6e6] dark:border-neutral-700"
                    }`}
                  >
                    <button type="button" onClick={() => onSelectTemplate(item.id)} disabled={section === "archive"} className="w-full text-left">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">Version {item.template.version || 1}</span>
                          <span className={`rounded border px-2 py-1 text-xs ${statusToneClassName(effectiveStatusTone)}`}>{effectiveStatusLabel}</span>
                        </div>
                        <span className="text-xs text-neutral-500">{item.countsLabel}</span>
                      </div>
                    </button>

                    {section === "versions" && (
                      <>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs text-neutral-500">Version note</span>
                          <textarea
                            value={versionComments[item.id] ?? item.versionComment}
                            onChange={(event) => setVersionComments((comments) => ({ ...comments, [item.id]: event.target.value }))}
                            disabled={!item.canComment}
                            rows={2}
                            placeholder="What changed and why"
                            className="w-full resize-y rounded-md border border-[#d2d2d2] bg-white px-2 py-2 text-sm text-neutral-900 outline-none focus:border-[#f7941d] disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                          />
                        </label>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => item.template.isDraft ? onLoadTemplate(item.template) : onDuplicateTemplate(item.template)}
                            disabled={item.template.isDraft ? !item.canOpen : !item.canDuplicate}
                            className={actionButtonClassName}
                          >
                            {item.template.isDraft ? <FilePenLine size={14} /> : <GitBranchPlus size={14} />}
                            {item.template.isDraft ? "Edit draft" : "New draft"}
                          </button>
                          <button type="button" onClick={() => onActivateTemplateVersion(item.id)} disabled={!canActivate} className={actionButtonClassName}>
                            <CheckCircle2 size={14} /> {item.id === activeVersionId ? "Active" : "Make active"}
                          </button>
                          <button type="button" onClick={() => onUpdateTemplateVersionComment(item.id, versionComments[item.id] ?? item.versionComment)} disabled={!item.canComment} className={actionButtonClassName}>
                            <Save size={14} /> Save note
                          </button>
                          <button type="button" onClick={() => void onDeleteTemplate(item.id)} disabled={!item.canDelete} className={`${actionButtonClassName} border-rose-300 text-rose-800 dark:border-rose-500/40 dark:text-rose-100`}>
                            <Archive size={14} /> Archive
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {!groups.length && (
          <p className="rounded-md border border-dashed border-[#d2d2d2] p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 lg:col-span-2">
            {section === "archive" ? "No archived workflows." : "No workflows yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function tabClassName(active: boolean) {
  return `min-h-9 rounded px-3 text-sm ${active ? "bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100" : "text-neutral-500"}`;
}

function statusToneClassName(statusTone: string) {
  if (statusTone === "active") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100";
  if (statusTone === "draft") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100";
  if (statusTone === "archived") return "border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100";
}

const actionButtonClassName =
  "flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#d2d2d2] px-2 text-xs transition hover:border-[#f7941d] disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700";
