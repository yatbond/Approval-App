"use client";

import { Copy, RotateCcw, X } from "lucide-react";
import { getWorkflowTemplateLibraryItems } from "@/lib/workflow-template-library-state";
import type { UserRole, WorkflowTemplate } from "@/lib/types";

export function WorkflowTemplateLibrary({
  workflowTemplates,
  selectedTemplateId,
  onSelectTemplate,
  onLoadTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  activeUserEmail,
  activeUserRole,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onLoadTemplate: (template: WorkflowTemplate) => void;
  onDuplicateTemplate: (template: WorkflowTemplate) => void;
  onDeleteTemplate: (templateId: string) => void | Promise<void>;
  activeUserEmail: string;
  activeUserRole: UserRole;
}) {
  const templateItems = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
    activeUserEmail,
    activeUserRole,
  });

  return (
    <div className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-neutral-300">
        Template library
      </h3>
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
              onClick={() => onSelectTemplate(item.id)}
              className="block w-full text-left"
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
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-neutral-300">
                  {item.statusLabel}
                </span>
                <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-neutral-400">
                  {item.ownershipLabel}
                </span>
              </div>
            </button>
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
                className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-1 text-xs text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw size={13} />
                {item.openActionLabel}
              </button>
              <button
                type="button"
                onClick={() => onDuplicateTemplate(item.template)}
                disabled={!item.canDuplicate}
                title="Create a new editable draft from this workflow."
                className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Copy size={13} />
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
                className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X size={13} />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
