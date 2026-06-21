import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowTemplateFromDraft } from "./template-builder.ts";
import { publishWorkflowTemplateVersion } from "./workflow-system.ts";

type WorkflowTemplateActionState = {
  didCreate: boolean;
  template: WorkflowTemplate | null;
};

export function getWorkflowCreateTemplateActionState({
  templateName,
  selectedBusinessName,
  departmentName,
}: {
  templateName: string;
  selectedBusinessName: string | null;
  departmentName: string;
}): WorkflowTemplateActionState {
  const cleanName = templateName.trim();
  const cleanDepartment = departmentName.trim();
  if (!cleanName || !selectedBusinessName || !cleanDepartment) {
    return { didCreate: false, template: null };
  }

  return {
    didCreate: true,
    template: createWorkflowTemplateFromDraft({
      name: cleanName,
      business: selectedBusinessName,
      department: cleanDepartment,
      documents: [],
      steps: [],
    }),
  };
}

export function getWorkflowPublishTemplateActionState({
  template,
  now,
}: {
  template: WorkflowTemplate | null;
  now?: Date;
}): WorkflowTemplateActionState {
  if (!template) {
    return { didCreate: false, template: null };
  }

  return {
    didCreate: true,
    template: publishWorkflowTemplateVersion(template, now),
  };
}
