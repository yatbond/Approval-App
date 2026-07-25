import type { UserRole, WorkflowTemplate } from "./types.ts";

export function getWorkflowTemplateFamilyKey(template: WorkflowTemplate) {
  return normalizeTemplateFamilyId(template.sourceTemplateId || template.id);
}

export function getActiveWorkflowRequestTemplates(templates: WorkflowTemplate[]) {
  const publishedTemplates = templates.filter(
    (template) => template.isDraft !== true && template.isArchived !== true,
  );
  const groupedTemplates = new Map<string, WorkflowTemplate[]>();
  const familyOrder: string[] = [];

  publishedTemplates.forEach((template) => {
    const familyKey = getWorkflowTemplateFamilyKey(template);
    if (!groupedTemplates.has(familyKey)) {
      groupedTemplates.set(familyKey, []);
      familyOrder.push(familyKey);
    }
    groupedTemplates.get(familyKey)?.push(template);
  });

  return familyOrder
    .map((familyKey) => selectActiveTemplateVersion(groupedTemplates.get(familyKey) || []))
    .filter((template): template is WorkflowTemplate => Boolean(template));
}

export function isActiveWorkflowTemplateVersion(
  template: WorkflowTemplate,
  templates: WorkflowTemplate[],
) {
  if (template.isDraft === true || template.isArchived === true) {
    return false;
  }

  return getActiveWorkflowRequestTemplates(templates).some(
    (activeTemplate) => activeTemplate.id === template.id,
  );
}

export function canManageWorkflowTemplate({
  template,
  activeUserEmail,
  activeUserRole,
}: {
  template: WorkflowTemplate;
  activeUserEmail: string;
  activeUserRole: UserRole;
}) {
  if (activeUserRole === "superuser") {
    return true;
  }

  return Boolean(template.createdByEmail && template.createdByEmail === activeUserEmail);
}

export function canActivateWorkflowTemplateVersion({
  template,
  activeUserEmail,
  activeUserRole,
}: {
  template: WorkflowTemplate;
  activeUserEmail: string;
  activeUserRole: UserRole;
}) {
  return (
    template.isDraft === false &&
    template.isArchived !== true &&
    canManageWorkflowTemplate({ template, activeUserEmail, activeUserRole })
  );
}

export function setActiveWorkflowTemplateVersion({
  templates,
  templateId,
  activeUserEmail,
  activeUserRole,
  now = new Date(),
}: {
  templates: WorkflowTemplate[];
  templateId: string;
  activeUserEmail: string;
  activeUserRole: UserRole;
  now?: Date;
}) {
  const targetTemplate = templates.find((template) => template.id === templateId);
  if (
    !targetTemplate ||
    !canActivateWorkflowTemplateVersion({
      template: targetTemplate,
      activeUserEmail,
      activeUserRole,
    })
  ) {
    return { didUpdate: false, templates };
  }

  const familyKey = getWorkflowTemplateFamilyKey(targetTemplate);
  const timestamp = now.toISOString();
  return {
    didUpdate: true,
    templates: templates.map((template) => {
      const isFamilyPublishedVersion =
        template.isDraft !== true &&
        template.isArchived !== true &&
        getWorkflowTemplateFamilyKey(template) === familyKey;

      if (!isFamilyPublishedVersion) {
        return template;
      }

      return {
        ...template,
        isActiveVersion: template.id === templateId,
        updatedAt: timestamp,
        updatedByEmail: activeUserEmail,
      };
    }),
  };
}

export function setWorkflowTemplateVersionComment({
  templates,
  templateId,
  comment,
  activeUserEmail,
  activeUserRole,
  now = new Date(),
}: {
  templates: WorkflowTemplate[];
  templateId: string;
  comment: string;
  activeUserEmail: string;
  activeUserRole: UserRole;
  now?: Date;
}) {
  const targetTemplate = templates.find((template) => template.id === templateId);
  if (
    !targetTemplate ||
    targetTemplate.isArchived === true ||
    !canManageWorkflowTemplate({
      template: targetTemplate,
      activeUserEmail,
      activeUserRole,
    })
  ) {
    return { didUpdate: false, templates };
  }

  const timestamp = now.toISOString();
  return {
    didUpdate: true,
    templates: templates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            versionComment: comment.trim(),
            updatedAt: timestamp,
            updatedByEmail: activeUserEmail,
          }
        : template,
    ),
  };
}

function selectActiveTemplateVersion(templates: WorkflowTemplate[]) {
  const explicitActiveTemplates = templates.filter(
    (template) => template.isActiveVersion === true,
  );
  return latestTemplateVersion(
    explicitActiveTemplates.length ? explicitActiveTemplates : templates,
  );
}

function latestTemplateVersion(templates: WorkflowTemplate[]) {
  return templates.reduce<WorkflowTemplate | null>((latestTemplate, template) => {
    if (!latestTemplate) {
      return template;
    }

    const latestVersion = latestTemplate.version || 1;
    const templateVersion = template.version || 1;
    if (templateVersion !== latestVersion) {
      return templateVersion > latestVersion ? template : latestTemplate;
    }

    return (template.publishedAt || "") > (latestTemplate.publishedAt || "")
      ? template
      : latestTemplate;
  }, null);
}

function normalizeTemplateFamilyId(value: string) {
  let currentValue = value;
  let nextValue = stripTemplateIdSuffix(currentValue);

  while (nextValue !== currentValue) {
    currentValue = nextValue;
    nextValue = stripTemplateIdSuffix(currentValue);
  }

  return currentValue;
}

function stripTemplateIdSuffix(value: string) {
  return value.replace(/-copy-\d+$/, "").replace(/-v\d+$/, "");
}
