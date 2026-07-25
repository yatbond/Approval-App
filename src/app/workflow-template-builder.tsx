"use client";

import { GitBranchPlus, Plus, Save } from "lucide-react";
import {
  getDepartmentForBusiness,
  getWorkflowTemplateBuilderBusinessState,
} from "@/lib/workflow-template-builder-state";
import { formatWorkflowTemplateOptionLabel } from "@/lib/workflow-template-action-state";
import { getWorkflowBuilderTemplateOptions } from "@/lib/workflow-template-action-state";
import type { BusinessUnit, WorkflowTemplate } from "@/lib/types";
import { InfoTip } from "./ui-hint";

export function WorkflowTemplateBuilder({
  templateName,
  setTemplateName,
  businessDirectory,
  businessId,
  setBusinessId,
  departmentName,
  setDepartmentName,
  baseTemplateId,
  setBaseTemplateId,
  baseTemplates,
  onCreateTemplate,
  isCreating,
  selectedTemplate,
  workflowTemplates,
  onSelectTemplate,
  onStartNew,
  onSaveDetails,
  onCreateDraftVersion,
}: {
  templateName: string;
  setTemplateName: (name: string) => void;
  businessDirectory: BusinessUnit[];
  businessId: string;
  setBusinessId: (businessId: string) => void;
  departmentName: string;
  setDepartmentName: (departmentName: string) => void;
  baseTemplateId: string;
  setBaseTemplateId: (templateId: string) => void;
  baseTemplates: WorkflowTemplate[];
  onCreateTemplate: () => void;
  isCreating: boolean;
  selectedTemplate: WorkflowTemplate | null;
  workflowTemplates: WorkflowTemplate[];
  onSelectTemplate: (templateId: string) => void;
  onStartNew: () => void;
  onSaveDetails: () => void;
  onCreateDraftVersion: () => void;
}) {
  const { selectedBusiness, departmentOptions, usesDepartmentSelect } =
    getWorkflowTemplateBuilderBusinessState({
      businessDirectory,
      businessId,
    });
  const workflowOptions = getWorkflowBuilderTemplateOptions(
    workflowTemplates,
    selectedTemplate?.id,
  );

  return (
    <div className="border-t border-[#e6e6e6] p-4 dark:border-neutral-700">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
        <h2 className="font-semibold">{isCreating ? "New workflow" : "Workflow details"}</h2>
        <InfoTip label="Add boxes on the Canvas tab, then select a box to set people, due hours, escalation, and documents." />
        </div>
        <button
          type="button"
          onClick={onStartNew}
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#f7941d]/50 bg-[#fff4e6] px-3 text-sm font-medium text-neutral-900 dark:bg-[#f7941d]/12 dark:text-neutral-100"
        >
          <Plus size={15} /> New workflow
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Open workflow</span>
          <select
            value={isCreating ? "" : selectedTemplate?.id || ""}
            onChange={(event) =>
              event.target.value ? onSelectTemplate(event.target.value) : onStartNew()
            }
            className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            <option value="">Create a new workflow</option>
            {workflowOptions
              .map((template) => (
                <option key={template.id} value={template.id}>
                  {formatWorkflowTemplateOptionLabel(template)} - v{template.version || 1} - {template.isDraft === false ? "Published" : "Draft"}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Name</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            disabled={!isCreating && selectedTemplate?.isDraft === false}
            className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Business</span>
          <select
            value={selectedBusiness?.id || businessId}
            onChange={(event) => {
              setBusinessId(event.target.value);
              setDepartmentName(
                getDepartmentForBusiness(businessDirectory, event.target.value),
              );
            }}
            disabled={!isCreating && selectedTemplate?.isDraft === false}
            className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            {businessDirectory.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Department</span>
          {usesDepartmentSelect ? (
            <select
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              disabled={!isCreating && selectedTemplate?.isDraft === false}
              className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
            >
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              disabled={!isCreating && selectedTemplate?.isDraft === false}
              placeholder="Add department"
              className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
          )}
        </label>
        {isCreating && <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Base workflow</span>
          <select
            value={baseTemplateId}
            onChange={(event) => setBaseTemplateId(event.target.value)}
            className="h-11 w-full rounded-md border border-[#e6e6e6] bg-white px-3 text-sm outline-none focus:border-emerald-400/60"
          >
            <option value="">Blank workflow</option>
            {baseTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {formatWorkflowTemplateOptionLabel(template)}
              </option>
            ))}
          </select>
        </label>}
        {isCreating ? (
          <button type="button" onClick={onCreateTemplate} className={primaryButtonClassName}>
            <Plus size={16} /> Create workflow
          </button>
        ) : selectedTemplate?.isDraft === false ? (
          <button type="button" onClick={onCreateDraftVersion} className={primaryButtonClassName}>
            <GitBranchPlus size={16} /> Create draft version
          </button>
        ) : (
          <button type="button" onClick={onSaveDetails} className={primaryButtonClassName}>
            <Save size={16} /> Save details
          </button>
        )}
      </div>
    </div>
  );
}

const primaryButtonClassName =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20";
