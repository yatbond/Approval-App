"use client";

import { Plus } from "lucide-react";
import {
  getDepartmentForBusiness,
  getWorkflowTemplateBuilderBusinessState,
} from "@/lib/workflow-template-builder-state";
import type { BusinessUnit } from "@/lib/types";
import { InfoTip } from "./ui-hint";

export function WorkflowTemplateBuilder({
  templateName,
  setTemplateName,
  businessDirectory,
  businessId,
  setBusinessId,
  departmentName,
  setDepartmentName,
  onCreateTemplate,
}: {
  templateName: string;
  setTemplateName: (name: string) => void;
  businessDirectory: BusinessUnit[];
  businessId: string;
  setBusinessId: (businessId: string) => void;
  departmentName: string;
  setDepartmentName: (departmentName: string) => void;
  onCreateTemplate: () => void;
}) {
  const { selectedBusiness, departmentOptions, usesDepartmentSelect } =
    getWorkflowTemplateBuilderBusinessState({
      businessDirectory,
      businessId,
    });

  return (
    <section className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Builder</h2>
        <InfoTip label="Add boxes on the Canvas tab, then select a box to set people, due hours, escalation, and documents." />
      </div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-400">Template name</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
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
            className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
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
              className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
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
              placeholder="Add department name"
              className="h-11 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
            />
          )}
        </label>
        <button
          type="button"
          onClick={onCreateTemplate}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
        >
          <Plus size={16} />
          Create template
        </button>
      </div>
    </section>
  );
}
