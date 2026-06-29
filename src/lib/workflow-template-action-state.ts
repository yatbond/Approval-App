import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowTemplateFromDraft } from "./template-builder.ts";
import { createWorkflowGraphFromTemplate, validateWorkflowTemplate } from "./workflow-graph.ts";
import { publishWorkflowTemplateVersion } from "./workflow-system.ts";
import {
  getActiveWorkflowRequestTemplates,
  isActiveWorkflowTemplateVersion,
} from "./workflow-template-version-state.ts";

type WorkflowTemplateActionState = {
  didCreate: boolean;
  template: WorkflowTemplate | null;
  message?: string;
  selectedTemplateId?: string;
  workflowEditorTab?: "canvas";
  shouldResetCanvasView?: boolean;
};

export function getWorkflowCreateTemplateActionState({
  templateName,
  selectedBusinessName,
  departmentName,
  baseTemplate,
  existingTemplates = [],
}: {
  templateName: string;
  selectedBusinessName: string | null;
  departmentName: string;
  baseTemplate?: WorkflowTemplate | null;
  existingTemplates?: WorkflowTemplate[];
}): WorkflowTemplateActionState {
  const cleanName = templateName.trim();
  const cleanDepartment = departmentName.trim();
  if (!cleanName || !selectedBusinessName || !cleanDepartment) {
    return { didCreate: false, template: null };
  }

  const hasDuplicate = existingTemplates.some(
    (template) =>
      !template.isArchived &&
      normalizeComparableValue(template.name) === normalizeComparableValue(cleanName) &&
      normalizeComparableValue(template.business) ===
        normalizeComparableValue(selectedBusinessName) &&
      normalizeComparableValue(template.department) ===
        normalizeComparableValue(cleanDepartment),
  );
  if (hasDuplicate) {
    return {
      didCreate: false,
      template: null,
      message: `A workflow named ${cleanName} already exists for ${selectedBusinessName} / ${cleanDepartment}.`,
    };
  }

  const template = createWorkflowTemplateFromDraft({
    name: cleanName,
    business: selectedBusinessName,
    department: cleanDepartment,
    documents: [],
    steps: [],
  });
  const basedTemplate = baseTemplate
    ? applyBaseTemplate(template, baseTemplate)
    : template;

  return {
    didCreate: true,
    template: basedTemplate,
    selectedTemplateId: basedTemplate.id,
    workflowEditorTab: "canvas",
    shouldResetCanvasView: true,
  };
}

export function getWorkflowTemplateBaseOptions({
  templates,
  excludeTemplateId = "",
}: {
  templates: WorkflowTemplate[];
  excludeTemplateId?: string;
}) {
  const activePublishedTemplateIds = new Set(
    getActiveWorkflowRequestTemplates(templates).map((template) => template.id),
  );

  return templates.filter(
    (template) =>
      !template.isArchived &&
      template.id !== excludeTemplateId &&
      (template.isDraft !== false ||
        activePublishedTemplateIds.has(template.id) ||
        isActiveWorkflowTemplateVersion(template, templates)),
  );
}

export function formatWorkflowTemplateOptionLabel(template: WorkflowTemplate) {
  return `${template.name} - ${template.business} / ${template.department}`;
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

  const blockingIssues = validateWorkflowTemplate(template).filter((issue) =>
    isBlockingPublishIssue(issue.message, issue.severity),
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

function isBlockingPublishIssue(
  message: string,
  severity: "error" | "warning",
) {
  if (severity === "error") {
    return true;
  }

  return [
    "has no fields to extract",
    "has no outcome boxes selected",
    "has no rule",
    "approved upstream box(es) are not routed",
    "No conditions are configured",
    "uses \"",
    "has an empty numeric value",
    "can both match",
    "cannot be reached from Start",
    "Box is not connected",
  ].some((pattern) => message.includes(pattern));
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

function applyBaseTemplate(
  template: WorkflowTemplate,
  baseTemplate: WorkflowTemplate,
): WorkflowTemplate {
  return {
    ...template,
    documentTypes: cloneValue(baseTemplate.documentTypes),
    documents: cloneValue(baseTemplate.documents),
    languages: cloneValue(baseTemplate.languages),
    fields: cloneValue(baseTemplate.fields),
    steps: cloneValue(baseTemplate.steps),
    graph: cloneValue(createWorkflowGraphFromTemplate(baseTemplate)),
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeComparableValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
