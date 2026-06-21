"use client";

import { RotateCcw, X } from "lucide-react";
import { getWorkflowTemplateLibraryItems } from "@/lib/workflow-template-library-state";
import type { WorkflowTemplate } from "@/lib/types";

export function WorkflowTemplateLibrary({
  workflowTemplates,
  selectedTemplateId,
  onSelectTemplate,
  onLoadTemplate,
  onDeleteTemplate,
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onLoadTemplate: (template: WorkflowTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}) {
  const templateItems = getWorkflowTemplateLibraryItems({
    workflowTemplates,
    selectedTemplateId,
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
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onLoadTemplate(item.template)}
                className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 py-1 text-xs text-sky-100 transition hover:bg-sky-400/20"
              >
                <RotateCcw size={13} />
                Load
              </button>
              <button
                type="button"
                onClick={() => onDeleteTemplate(item.id)}
                className="flex min-h-8 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-500/20"
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
