import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowTemplateFromDraft } from "./template-builder.ts";
import { validateWorkflowTemplate } from "./workflow-graph.ts";
import { publishWorkflowTemplateVersion } from "./workflow-system.ts";

type WorkflowTemplateActionState = {
  didCreate: boolean;
  template: WorkflowTemplate | null;
  message?: string;
  selectedTemplateId?: string;
  workflowEditorTab?: "canvas";
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
    return { didCreate: false, template: null, message: "Select a template to publish." };
  }

  if (template.isDraft === false) {
    return {
      didCreate: false,
      template: null,
      message: "This version is already published. Duplicate it to create a new draft.",
    };
  }

  const blockingIssues = validateWorkflowTemplate(template).filter(
    (issue) => issue.severity === "error",
  );
  if (blockingIssues.length) {
    return {
      didCreate: false,
      template: null,
      message: blockingIssues.map((issue) => issue.message).join(" "),
    };
  }

  return {
    didCreate: true,
    template: publishWorkflowTemplateVersion(template, now),
  };
}

export function getWorkflowDuplicateTemplateActionState({
  template,
  now = new Date(),
}: {
  template: WorkflowTemplate | null;
  now?: Date;
}): WorkflowTemplateActionState {
  if (!template) {
    return { didCreate: false, template: null, message: "Select a template to duplicate." };
  }

  const id = `${template.id.replace(/-copy-\d+$/, "")}-copy-${now.getTime()}`;
  const nextTemplate: WorkflowTemplate = {
    ...cloneTemplate(template),
    id,
    name: `${template.name} copy`,
    version: 1,
    isDraft: true,
    publishedAt: undefined,
    sourceTemplateId: template.id,
  };

  return {
    didCreate: true,
    template: nextTemplate,
    selectedTemplateId: id,
    workflowEditorTab: "canvas",
  };
}

function cloneTemplate(template: WorkflowTemplate): WorkflowTemplate {
  return JSON.parse(JSON.stringify(template)) as WorkflowTemplate;
}
