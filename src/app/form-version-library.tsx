"use client";

import { Archive, CheckCircle2, FilePenLine, GitBranchPlus } from "lucide-react";
import { useMemo, useState } from "react";
import type { FormLibraryDefinition } from "@/lib/types";

export function FormVersionLibrary({
  definitions,
  onActivate,
  onArchive,
  onEdit,
}: {
  definitions: FormLibraryDefinition[];
  onActivate: (definitionId: string) => void;
  onArchive: (definitionId: string) => void;
  onEdit: (definition: FormLibraryDefinition) => void;
}) {
  const [section, setSection] = useState<"available" | "archived">("available");
  const groups = useMemo(() => {
    const grouped = new Map<string, FormLibraryDefinition[]>();
    definitions
      .filter((definition) =>
        section === "archived"
          ? definition.status === "archived"
          : definition.status !== "archived",
      )
      .forEach((definition) => {
        grouped.set(definition.formKey, [
          ...(grouped.get(definition.formKey) || []),
          definition,
        ]);
      });
    return Array.from(grouped.values())
      .map((versions) => [...versions].sort((left, right) => right.version - left.version))
      .sort((left, right) => left[0].name.localeCompare(right[0].name));
  }, [definitions, section]);

  return (
    <section className="rounded-md border border-[#e6e6e6] bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">Form library</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Each form keeps its draft and published versions together. Activating a
            version affects new workflow attachments only.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-1 dark:border-neutral-700 dark:bg-neutral-900">
          <button type="button" onClick={() => setSection("available")} className={tabClassName(section === "available")}>Available</button>
          <button type="button" onClick={() => setSection("archived")} className={tabClassName(section === "archived")}>Archived</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map((versions) => {
          const form = versions[0];
          return (
            <article key={form.formKey} className="rounded-md border border-[#e6e6e6] bg-[#f7f7f5] p-3 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{form.name}</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {[form.business, form.department].filter(Boolean).join(" - ") || "Shared form"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {form.source === "native" ? "Approval App" : "Microsoft Forms"}
              </p>
              <div className="mt-3 space-y-2">
                {versions.map((version) => {
                  const isPublished = version.isDraft !== true && version.status === "ready";
                  const isActive = isPublished && (version.isActiveVersion === true ||
                    !versions.some((item) => item.isActiveVersion === true) &&
                    version.version === Math.max(...versions.filter((item) => item.isDraft !== true && item.status === "ready").map((item) => item.version), 0));
                  return (
                    <div key={version.id} className="rounded-md border border-[#e6e6e6] bg-white p-3 dark:border-neutral-700 dark:bg-neutral-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">Version {version.version}</span>
                          <span className={statusClassName(version, isActive)}>
                            {version.status === "archived" ? "Archived" : version.isDraft ? "Draft" : isActive ? "Active" : version.status === "ready" ? "Published" : "Setup required"}
                          </span>
                        </div>
                        <span className="text-xs text-neutral-500">
                          {new Date(version.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {version.versionComment && <p className="mt-2 text-xs text-neutral-500">{version.versionComment}</p>}
                      {section === "available" && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <button type="button" onClick={() => onEdit(version)} className={actionButtonClassName}>
                            {version.isDraft ? <FilePenLine size={14} /> : <GitBranchPlus size={14} />}
                            {version.isDraft ? "Edit draft" : "New draft"}
                          </button>
                          <button type="button" onClick={() => onActivate(version.id)} disabled={!isPublished || isActive} className={actionButtonClassName}>
                            <CheckCircle2 size={14} /> {isActive ? "Active" : "Activate"}
                          </button>
                          <button type="button" onClick={() => onArchive(version.id)} className={`${actionButtonClassName} border-rose-300 text-rose-800 dark:border-rose-500/40 dark:text-rose-100`}>
                            <Archive size={14} /> Archive
                          </button>
                        </div>
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
            {section === "archived" ? "No archived forms." : "No forms yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function tabClassName(active: boolean) {
  return `min-h-9 rounded px-3 text-sm ${active ? "bg-[#fff4e6] text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100" : "text-neutral-500"}`;
}

function statusClassName(definition: FormLibraryDefinition, active: boolean) {
  const tone = definition.status === "archived"
    ? "border-neutral-300 bg-neutral-100 text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
    : definition.isDraft
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"
      : active
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100"
        : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100";
  return `rounded border px-2 py-1 text-xs ${tone}`;
}

const actionButtonClassName =
  "flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#d2d2d2] px-2 text-xs transition hover:border-[#f7941d] disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700";
