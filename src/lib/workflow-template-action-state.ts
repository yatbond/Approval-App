import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowTemplateFromDraft } from "./template-builder.ts";
import { createWorkflowGraphFromTemplate, validateWorkflowTemplate } from "./workflow-graph.ts";
import { publishWorkflowTemplateVersion } from "./workflow-system.ts";
import {
  getActiveWorkflowRequestTemplates,
  getWorkflowTemplateFamilyKey,
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

  const hasDuplicate = hasWorkflowTemplateIdentityConflict({
    templates: existingTemplates,
    name: cleanName,
    business: selectedBusinessName,
    department: cleanDepartment,
  });
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

export function getWorkflowBuilderTemplateOptions(
  templates: WorkflowTemplate[],
  selectedTemplateId?: string,
) {
  const groups = new Map<string, WorkflowTemplate[]>();
  templates
    .filter((template) => template.isArchived !== true)
    .forEach((template) => {
      const familyKey = getWorkflowTemplateFamilyKey(template);
      groups.set(familyKey, [...(groups.get(familyKey) || []), template]);
    });

  return Array.from(groups.values())
    .map((versions) => {
      const selectedVersion = versions.find(
        (template) => template.id === selectedTemplateId,
      );
      if (selectedVersion) {
        return selectedVersion;
      }

      const drafts = versions.filter((template) => template.isDraft !== false);
      const published = versions.filter((template) => template.isDraft === false);
      const candidates = drafts.length
        ? drafts
        : published.some((template) => template.isActiveVersion === true)
          ? published.filter((template) => template.isActiveVersion === true)
          : published;
      return candidates.reduce((latest, template) => {
        const versionDifference = (template.version || 1) - (latest.version || 1);
        if (versionDifference !== 0) return versionDifference > 0 ? template : latest;
        return (template.updatedAt || template.publishedAt || template.createdAt || "") >
          (latest.updatedAt || latest.publishedAt || latest.createdAt || "")
          ? template
          : latest;
      });
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.business.localeCompare(right.business) ||
        left.department.localeCompare(right.department),
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
  existingTemplates = [],
  now = new Date(),
}: {
  template: WorkflowTemplate | null;
  existingTemplates?: WorkflowTemplate[];
  now?: Date;
}): WorkflowTemplateActionState {
  if (!template) {
    return { didCreate: false, template: null, message: "Select a template to duplicate." };
  }

  const id = `${template.id.replace(/-copy-\d+$/, "")}-copy-${now.getTime()}`;
  const familyKey = getWorkflowTemplateFamilyKey(template);
  const latestFamilyVersion = [template, ...existingTemplates]
    .filter((item) => getWorkflowTemplateFamilyKey(item) === familyKey)
    .reduce((latest, item) => Math.max(latest, item.version || 1), 1);
  const nextTemplate: WorkflowTemplate = {
    ...cloneTemplate(template),
    id,
    name: template.name,
    version: latestFamilyVersion,
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

export function hasWorkflowTemplateIdentityConflict({
  templates,
  name,
  business,
  department,
  excludeFamilyKey,
}: {
  templates: WorkflowTemplate[];
  name: string;
  business: string;
  department: string;
  excludeFamilyKey?: string;
}) {
  return templates.some(
    (template) =>
      !template.isArchived &&
      (!excludeFamilyKey || getWorkflowTemplateFamilyKey(template) !== excludeFamilyKey) &&
      normalizeComparableValue(template.name) === normalizeComparableValue(name) &&
      normalizeComparableValue(template.business) === normalizeComparableValue(business) &&
      normalizeComparableValue(template.department) === normalizeComparableValue(department),
  );
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
