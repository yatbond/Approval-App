"use client";

import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  GitBranchPlus,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getWorkflowTemplateLibraryItems,
  type WorkflowTemplateLibrarySection,
} from "@/lib/workflow-template-library-state";
import { getWorkflowTemplateFamilyKey } from "@/lib/workflow-template-version-state";
import type { UserRole, WorkflowTemplate } from "@/lib/types";

type WorkflowLibraryItem = ReturnType<typeof getWorkflowTemplateLibraryItems>[number];

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
  const [expandedFamilyKey, setExpandedFamilyKey] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [versionComments, setVersionComments] = useState<Record<string, string>>({});
  const [authoringActivationFamilyIds, setAuthoringActivationFamilyIds] =
    useState<readonly string[]>([]);
  const [canManageAuthoringPublishers, setCanManageAuthoringPublishers] =
    useState(false);
  const [activationFeatureAvailable, setActivationFeatureAvailable] =
    useState(false);
  const [publisherEmails, setPublisherEmails] = useState<
    Record<string, string>
  >({});
  const [publisherMessages, setPublisherMessages] = useState<
    Record<string, string>
  >({});
  const [publisherBusyFamilyIds, setPublisherBusyFamilyIds] = useState<
    readonly string[]
  >([]);
  useEffect(() => {
    let current = true;
    void fetch("/api/template-authoring/context", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (current) {
          setAuthoringActivationFamilyIds(
            Array.isArray(payload?.actor?.activationFamilyIds)
              ? payload.actor.activationFamilyIds.filter(
                  (item: unknown): item is string =>
                    typeof item === "string" && item.length > 0,
                )
              : [],
          );
          setCanManageAuthoringPublishers(
            payload?.actor?.canManagePublishers === true,
          );
          setActivationFeatureAvailable(
            payload?.actor?.activationFeatureAvailable === true,
          );
        }
      })
      .catch(() => {
        if (current) setAuthoringActivationFamilyIds([]);
        if (current) setCanManageAuthoringPublishers(false);
        if (current) setActivationFeatureAvailable(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
    activeUserEmail,
    activeUserRole,
    section,
  });
  const groups = useMemo(() => groupWorkflowLibraryItems(items), [items]);

  function changeSection(nextSection: typeof section) {
    setSection(nextSection);
    setExpandedFamilyKey(null);
    setEditingNoteId(null);
  }

  function saveVersionNote(item: WorkflowLibraryItem) {
    onUpdateTemplateVersionComment(
      item.id,
      versionComments[item.id] ?? item.versionComment,
    );
    setEditingNoteId(null);
  }

  async function setPublisherAccess(familyId: string, enabled: boolean) {
    const publisherEmail = String(publisherEmails[familyId] || "")
      .trim()
      .toLowerCase();
    if (!publisherEmail || !publisherEmail.includes("@")) {
      setPublisherMessages((current) => ({
        ...current,
        [familyId]: "Enter the colleague’s exact directory email.",
      }));
      return;
    }
    setPublisherBusyFamilyIds((current) => [
      ...new Set([...current, familyId]),
    ]);
    setPublisherMessages((current) => ({ ...current, [familyId]: "" }));
    try {
      const response = await fetch(
        `/api/template-authoring/families/${encodeURIComponent(familyId)}/publishers`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            publisherEmail,
            enabled,
            idempotencyKey: `publisher:${crypto.randomUUID()}`,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || "Publisher access could not be updated.",
        );
      }
      setPublisherMessages((current) => ({
        ...current,
        [familyId]: enabled
          ? `${publisherEmail} can now activate this workflow.`
          : `${publisherEmail} can no longer activate this workflow.`,
      }));
      if (
        activationFeatureAvailable &&
        publisherEmail === activeUserEmail.trim().toLowerCase()
      ) {
        setAuthoringActivationFamilyIds((current) =>
          enabled
            ? [...new Set([...current, familyId])]
            : current.filter((item) => item !== familyId),
        );
      }
    } catch (error) {
      setPublisherMessages((current) => ({
        ...current,
        [familyId]:
          error instanceof Error
            ? error.message
            : "Publisher access could not be updated.",
      }));
    } finally {
      setPublisherBusyFamilyIds((current) =>
        current.filter((item) => item !== familyId),
      );
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Workflow library
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Expand a workflow to manage its active version, draft, and version history.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-1 dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => changeSection("versions")}
            className={tabClassName(section === "versions")}
          >
            Available
          </button>
          <button
            type="button"
            onClick={() => changeSection("archive")}
            className={tabClassName(section === "archive")}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((versions) => {
          const group = getWorkflowLibraryGroupSummary(versions, section);
          const isExpanded = expandedFamilyKey === group.familyKey;
          return (
            <article
              key={group.familyKey}
              className={`overflow-hidden rounded-md border bg-white dark:bg-neutral-950 ${
                isExpanded
                  ? "border-[#f7941d]"
                  : "border-[#e6e6e6] dark:border-neutral-700"
              }`}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`workflow-family-${group.familyKey}`}
                onClick={() => {
                  setExpandedFamilyKey(isExpanded ? null : group.familyKey);
                  setEditingNoteId(null);
                }}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#fff8ef] dark:hover:bg-[#f7941d]/8"
              >
                {isExpanded ? (
                  <ChevronDown size={18} className="shrink-0 text-[#f7941d]" />
                ) : (
                  <ChevronRight size={18} className="shrink-0 text-neutral-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-neutral-900 dark:text-neutral-100">
                    {group.workflow.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {group.workflow.business} - {group.workflow.department}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-2">
                  <span className={`rounded border px-2 py-1 text-xs ${statusToneClassName(group.primaryStatusTone)}`}>
                    {group.primaryStatusLabel}
                  </span>
                  {group.draft && group.active && (
                    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
                      Draft available
                    </span>
                  )}
                </span>
              </button>

              {isExpanded && (
                <div
                  id={`workflow-family-${group.familyKey}`}
                  className="border-t border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900 sm:p-4"
                >
                  {section !== "archive" &&
                    canManageAuthoringPublishers &&
                    group.workflow.authoringFamilyId && (
                      <section className="mb-3 rounded-md border border-[#d2d2d2] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950">
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          Activation publisher
                        </h4>
                        <p className="mt-1 text-xs text-neutral-500">
                          IT can grant or revoke who may make an approved
                          version active. Administrator access alone is not
                          enough.
                        </p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <label className="min-w-0 flex-1 text-xs font-medium text-neutral-700 dark:text-neutral-200">
                            Colleague’s directory email
                            <input
                              type="email"
                              value={
                                publisherEmails[
                                  group.workflow.authoringFamilyId
                                ] || ""
                              }
                              onChange={(event) =>
                                setPublisherEmails((current) => ({
                                  ...current,
                                  [group.workflow.authoringFamilyId!]:
                                    event.target.value,
                                }))
                              }
                              placeholder="name@company.com"
                              className="mt-1 min-h-10 w-full rounded-md border border-[#d2d2d2] bg-white px-3 text-sm text-neutral-900 outline-none focus:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                            />
                          </label>
                          <div className="flex items-end gap-2">
                            <button
                              type="button"
                              disabled={
                                publisherBusyFamilyIds.includes(
                                  group.workflow.authoringFamilyId,
                                )
                              }
                              onClick={() =>
                                void setPublisherAccess(
                                  group.workflow.authoringFamilyId!,
                                  true,
                                )
                              }
                              className={actionButtonClassName}
                            >
                              Grant access
                            </button>
                            <button
                              type="button"
                              disabled={
                                publisherBusyFamilyIds.includes(
                                  group.workflow.authoringFamilyId,
                                )
                              }
                              onClick={() =>
                                void setPublisherAccess(
                                  group.workflow.authoringFamilyId!,
                                  false,
                                )
                              }
                              className={actionButtonClassName}
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                        <p
                          className="mt-2 text-xs text-neutral-600 dark:text-neutral-300"
                          aria-live="polite"
                        >
                          {publisherMessages[
                            group.workflow.authoringFamilyId
                          ] || ""}
                        </p>
                      </section>
                    )}
                  {group.active ? (
                    <WorkflowVersionPanel
                      heading="Active version"
                      item={group.active}
                      statusLabel={`Active v${group.active.template.version || 1}`}
                      statusTone="active"
                      editingNoteId={editingNoteId}
                      versionComments={versionComments}
                      showNewDraft={!group.draft}
                      onSelectTemplate={onSelectTemplate}
                      onLoadTemplate={onLoadTemplate}
                      onDuplicateTemplate={onDuplicateTemplate}
                      onDeleteTemplate={onDeleteTemplate}
                      onActivateTemplateVersion={onActivateTemplateVersion}
                      authoringActivationFamilyIds={
                        authoringActivationFamilyIds
                      }
                      activationFeatureAvailable={
                        activationFeatureAvailable
                      }
                      onEditNote={setEditingNoteId}
                      onChangeNote={(id, value) =>
                        setVersionComments((comments) => ({ ...comments, [id]: value }))
                      }
                      onSaveNote={saveVersionNote}
                    />
                  ) : (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                      This workflow has not been published yet.
                    </div>
                  )}

                  {group.draft && (
                    <div className="mt-3">
                      <WorkflowVersionPanel
                        heading="Current draft"
                        item={group.draft}
                        statusLabel={`Draft v${group.draft.template.version || 1}`}
                        statusTone="draft"
                        editingNoteId={editingNoteId}
                        versionComments={versionComments}
                        onSelectTemplate={onSelectTemplate}
                        onLoadTemplate={onLoadTemplate}
                        onDuplicateTemplate={onDuplicateTemplate}
                        onDeleteTemplate={onDeleteTemplate}
                        onActivateTemplateVersion={onActivateTemplateVersion}
                        authoringActivationFamilyIds={
                          authoringActivationFamilyIds
                        }
                        activationFeatureAvailable={
                          activationFeatureAvailable
                        }
                        onEditNote={setEditingNoteId}
                        onChangeNote={(id, value) =>
                          setVersionComments((comments) => ({ ...comments, [id]: value }))
                        }
                        onSaveNote={saveVersionNote}
                      />
                    </div>
                  )}

                  {group.history.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold uppercase text-neutral-500">
                        Version history
                      </h4>
                      <div className="mt-2 space-y-2">
                        {group.history.map((item) => (
                          <details
                            key={item.id}
                            className="rounded-md border border-[#e6e6e6] bg-white dark:border-neutral-700 dark:bg-neutral-950"
                          >
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                              <span className="font-medium">
                                Version {item.template.version || 1}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className={`rounded border px-2 py-1 text-xs ${statusToneClassName(item.statusTone)}`}>
                                  {item.statusLabel}
                                </span>
                                <span className="hidden text-xs text-neutral-500 sm:inline">
                                  {formatVersionDate(item.template)}
                                </span>
                                <ChevronDown size={15} className="text-neutral-500" />
                              </span>
                            </summary>
                            <div className="border-t border-[#e6e6e6] p-3 dark:border-neutral-700">
                              <WorkflowVersionDetails
                                item={item}
                                editingNoteId={editingNoteId}
                                versionComments={versionComments}
                                onSelectTemplate={onSelectTemplate}
                                onLoadTemplate={onLoadTemplate}
                                onDuplicateTemplate={onDuplicateTemplate}
                                onDeleteTemplate={onDeleteTemplate}
                                onActivateTemplateVersion={onActivateTemplateVersion}
                                authoringActivationFamilyIds={
                                  authoringActivationFamilyIds
                                }
                                activationFeatureAvailable={
                                  activationFeatureAvailable
                                }
                                onEditNote={setEditingNoteId}
                                onChangeNote={(id, value) =>
                                  setVersionComments((comments) => ({ ...comments, [id]: value }))
                                }
                                onSaveNote={saveVersionNote}
                              />
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!groups.length && (
          <p className="rounded-md border border-dashed border-[#d2d2d2] p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {section === "archive" ? "No archived workflows." : "No workflows yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function WorkflowVersionPanel({
  heading,
  item,
  statusLabel,
  statusTone,
  showNewDraft = false,
  ...detailsProps
}: {
  heading: string;
  item: WorkflowLibraryItem;
  statusLabel: string;
  statusTone: string;
  showNewDraft?: boolean;
} & WorkflowVersionDetailsProps) {
  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {heading}
          </h4>
          <p className="mt-1 text-xs text-neutral-500">
            {formatVersionDate(item.template)}
          </p>
        </div>
        <span className={`rounded border px-2 py-1 text-xs ${statusToneClassName(statusTone)}`}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-3">
        <WorkflowVersionDetails item={item} showNewDraft={showNewDraft} {...detailsProps} />
      </div>
    </section>
  );
}

type WorkflowVersionDetailsProps = {
  editingNoteId: string | null;
  versionComments: Record<string, string>;
  showNewDraft?: boolean;
  onSelectTemplate: (templateId: string) => void;
  onLoadTemplate: (template: WorkflowTemplate) => void;
  onDuplicateTemplate: (template: WorkflowTemplate) => void;
  onDeleteTemplate: (templateId: string) => void | Promise<void>;
  onActivateTemplateVersion: (templateId: string) => void;
  authoringActivationFamilyIds: readonly string[];
  activationFeatureAvailable: boolean;
  onEditNote: (templateId: string | null) => void;
  onChangeNote: (templateId: string, value: string) => void;
  onSaveNote: (item: WorkflowLibraryItem) => void;
};

function WorkflowVersionDetails({
  item,
  editingNoteId,
  versionComments,
  showNewDraft = false,
  onSelectTemplate,
  onLoadTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  onActivateTemplateVersion,
  authoringActivationFamilyIds,
  activationFeatureAvailable,
  onEditNote,
  onChangeNote,
  onSaveNote,
}: { item: WorkflowLibraryItem } & WorkflowVersionDetailsProps) {
  const isDraft = item.template.isDraft !== false;
  const isArchived = item.template.isArchived === true;
  const isEditingNote = editingNoteId === item.id;
  return (
    <>
      <p className="text-xs text-neutral-500">{item.countsLabel}</p>
      <div className="mt-3 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500">Version note</p>
            {!isEditingNote && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">
                {item.versionComment || "No version note."}
              </p>
            )}
          </div>
          {!isEditingNote && item.canComment && !isArchived && (
            <button
              type="button"
              onClick={() => onEditNote(item.id)}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-[#d2d2d2] px-2 text-xs hover:border-[#f7941d] dark:border-neutral-700"
            >
              <Pencil size={13} /> Edit note
            </button>
          )}
        </div>
        {isEditingNote && (
          <div className="mt-2">
            <textarea
              value={versionComments[item.id] ?? item.versionComment}
              onChange={(event) => onChangeNote(item.id, event.target.value)}
              rows={2}
              aria-label={`Version ${item.template.version || 1} note`}
              placeholder="What changed and why"
              className="w-full resize-y rounded-md border border-[#d2d2d2] bg-white px-2 py-2 text-sm text-neutral-900 outline-none focus:border-[#f7941d] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => onSaveNote(item)} className={actionButtonClassName}>
                <Save size={14} /> Save note
              </button>
              <button type="button" onClick={() => onEditNote(null)} className={actionButtonClassName}>
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!isArchived && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isDraft && (
            <button
              type="button"
              onClick={() => {
                onSelectTemplate(item.id);
                onLoadTemplate(item.template);
              }}
              disabled={!item.canOpen}
              className={actionButtonClassName}
            >
              <FilePenLine size={14} /> Edit draft
            </button>
          )}
          {!isDraft && showNewDraft && (
            <button
              type="button"
              onClick={() => onDuplicateTemplate(item.template)}
              disabled={!item.canDuplicate}
              className={actionButtonClassName}
            >
              <GitBranchPlus size={14} /> New draft
            </button>
          )}
          {!isDraft && item.statusTone !== "active" && (
            <button
              type="button"
              onClick={() => onActivateTemplateVersion(item.id)}
              disabled={
                item.template.authoringFamilyId
                  ? !activationFeatureAvailable ||
                    !authoringActivationFamilyIds.includes(
                      item.template.authoringFamilyId,
                    )
                  : !item.canActivate
              }
              className={actionButtonClassName}
            >
              <CheckCircle2 size={14} /> Make active
            </button>
          )}
          <button
            type="button"
            onClick={() => void onDeleteTemplate(item.id)}
            disabled={!item.canDelete}
            className={`${actionButtonClassName} border-rose-300 text-rose-800 dark:border-rose-500/40 dark:text-rose-100`}
          >
            <Archive size={14} /> Archive
          </button>
        </div>
      )}
    </>
  );
}

function groupWorkflowLibraryItems(items: WorkflowLibraryItem[]) {
  const grouped = new Map<string, WorkflowLibraryItem[]>();
  items.forEach((item) => {
    const familyKey = getWorkflowTemplateFamilyKey(item.template);
    grouped.set(familyKey, [...(grouped.get(familyKey) || []), item]);
  });
  return Array.from(grouped.values())
    .map((versions) => {
      const uniqueVersions = new Map<string, WorkflowLibraryItem>();
      versions.forEach((item) => {
        const key = `${item.template.isDraft === false ? "published" : "draft"}:${item.template.version || 1}`;
        const current = uniqueVersions.get(key);
        const itemTimestamp = versionTimestamp(item.template);
        const currentTimestamp = current ? versionTimestamp(current.template) : "";
        if (
          !current ||
          (item.statusTone === "active" && current.statusTone !== "active") ||
          itemTimestamp > currentTimestamp
        ) {
          uniqueVersions.set(key, item);
        }
      });
      return Array.from(uniqueVersions.values()).sort(
        (left, right) => (right.template.version || 1) - (left.template.version || 1),
      );
    })
    .sort((left, right) => left[0].template.name.localeCompare(right[0].template.name));
}

function getWorkflowLibraryGroupSummary(
  versions: WorkflowLibraryItem[],
  section: "versions" | "archive",
) {
  const published = versions.filter((item) => item.template.isDraft === false);
  const active = published
    .filter((item) => item.statusTone === "active")
    .sort((left, right) => (right.template.version || 1) - (left.template.version || 1))[0];
  const effectiveActive =
    section === "versions"
      ? active ||
        published.sort(
          (left, right) => (right.template.version || 1) - (left.template.version || 1),
        )[0]
      : undefined;
  const draft = versions
    .filter((item) => item.template.isDraft !== false)
    .sort((left, right) => (right.template.version || 1) - (left.template.version || 1))[0];
  const fallback = versions[0];
  const primary = effectiveActive || draft || fallback;
  const history = versions
    .filter((item) => item.id !== effectiveActive?.id && item.id !== draft?.id)
    .map((item) =>
      effectiveActive && item.statusTone === "active"
        ? {
            ...item,
            statusTone: "inactive",
            statusLabel: "Inactive",
            canActivate: item.canActivate || item.canComment,
          }
        : item,
    );
  return {
    familyKey: getWorkflowTemplateFamilyKey(fallback.template),
    workflow: fallback.template,
    active: effectiveActive,
    draft,
    history,
    primaryStatusTone:
      section === "archive" ? "archived" : effectiveActive ? "active" : "draft",
    primaryStatusLabel:
      section === "archive"
        ? `Archived v${primary.template.version || 1}`
        : effectiveActive
          ? `Active v${effectiveActive.template.version || 1}`
          : `Draft v${primary.template.version || 1} · Not published`,
  };
}

function versionTimestamp(template: WorkflowTemplate) {
  return template.updatedAt || template.publishedAt || template.createdAt || "";
}

function formatVersionDate(template: WorkflowTemplate) {
  const timestamp = versionTimestamp(template);
  if (!timestamp) return "Date not recorded";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : date.toLocaleString();
}

function tabClassName(active: boolean) {
  return `min-h-9 rounded px-3 text-sm ${
    active
      ? "bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
      : "text-neutral-500"
  }`;
}

function statusToneClassName(statusTone: string) {
  if (statusTone === "active") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100";
  if (statusTone === "draft") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100";
  if (statusTone === "archived") return "border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100";
}

const actionButtonClassName =
  "flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#d2d2d2] px-3 text-xs transition hover:border-[#f7941d] disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700";
