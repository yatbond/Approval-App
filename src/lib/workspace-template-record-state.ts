import type {
  AdminAuditEvent,
  AdminAuditEventAction,
  UserRole,
  WorkflowTemplate,
} from "./types.ts";

type TemplateActor = {
  name: string;
  email: string;
  role: UserRole;
};

export function getCreatedTemplateRecordState({
  templates,
  template,
  actor,
  now = new Date(),
  action = "template_created",
}: {
  templates: WorkflowTemplate[];
  template: WorkflowTemplate;
  actor?: TemplateActor;
  now?: Date;
  action?: AdminAuditEventAction;
}) {
  const stampedTemplate = actor ? stampCreatedTemplate(template, actor, now) : template;
  return {
    templates: [stampedTemplate, ...templates],
    selectedTemplateId: stampedTemplate.id,
    auditEvent: actor
      ? buildTemplateAdminAuditEvent({
          action,
          template: stampedTemplate,
          actor,
          now,
        })
      : undefined,
  };
}

export function getUpdatedTemplateRecordState({
  templates,
  template,
  actor,
  now = new Date(),
  action = "template_updated",
}: {
  templates: WorkflowTemplate[];
  template: WorkflowTemplate;
  actor?: TemplateActor;
  now?: Date;
  action?: AdminAuditEventAction;
}) {
  const stampedTemplate = actor ? stampUpdatedTemplate(template, actor, now) : template;
  return {
    templates: templates.map((item) =>
      item.id === stampedTemplate.id ? stampedTemplate : item,
    ),
    auditEvent: actor
      ? buildTemplateAdminAuditEvent({
          action,
          template: stampedTemplate,
          actor,
          now,
        })
      : undefined,
  };
}

export function getDeletedTemplateRecordState({
  templates,
  selectedTemplateId,
  templateId,
  actor,
  now = new Date(),
}: {
  templates: WorkflowTemplate[];
  selectedTemplateId: string;
  templateId: string;
  actor?: TemplateActor;
  now?: Date;
}) {
  if (actor) {
    const archivedTemplate = templates.find((template) => template.id === templateId);
    const nextTemplates = templates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            isArchived: true,
            archivedAt: now.toISOString(),
            archivedByEmail: actor.email,
            updatedAt: now.toISOString(),
            updatedByEmail: actor.email,
          }
        : template,
    );
    const activeTemplates = nextTemplates.filter((template) => !template.isArchived);

    return {
      templates: nextTemplates,
      selectedTemplateId:
        selectedTemplateId === templateId
          ? activeTemplates[0]?.id || ""
          : selectedTemplateId,
      auditEvent: archivedTemplate
        ? buildTemplateAdminAuditEvent({
            action: "template_archived",
            template: {
              ...archivedTemplate,
              isArchived: true,
              archivedAt: now.toISOString(),
              archivedByEmail: actor.email,
            },
            actor,
            now,
          })
        : undefined,
    };
  }

  const nextTemplates = templates.filter((template) => template.id !== templateId);

  return {
    templates: nextTemplates,
    selectedTemplateId:
      selectedTemplateId === templateId
        ? nextTemplates[0]?.id || ""
        : selectedTemplateId,
  };
}

function stampCreatedTemplate(
  template: WorkflowTemplate,
  actor: TemplateActor,
  now: Date,
): WorkflowTemplate {
  return {
    ...template,
    createdByEmail: template.createdByEmail || actor.email,
    createdByName: template.createdByName || actor.name,
    createdAt: template.createdAt || now.toISOString(),
    updatedByEmail: actor.email,
    updatedAt: now.toISOString(),
  };
}

function stampUpdatedTemplate(
  template: WorkflowTemplate,
  actor: TemplateActor,
  now: Date,
): WorkflowTemplate {
  return {
    ...template,
    updatedByEmail: actor.email,
    updatedAt: now.toISOString(),
  };
}

function buildTemplateAdminAuditEvent({
  action,
  template,
  actor,
  now,
}: {
  action: AdminAuditEventAction;
  template: WorkflowTemplate;
  actor: TemplateActor;
  now: Date;
}): AdminAuditEvent {
  return {
    id: `template-${template.id}-${now.getTime()}-${action.replace("template_", "")}`,
    action,
    actor: actor.name,
    actorEmail: actor.email,
    timestamp: now.toISOString(),
    detail: `${formatTemplateAuditVerb(action)} template ${template.name}.`,
    templateId: template.id,
    templateName: template.name,
    templateVersion: template.version || 1,
  };
}

function formatTemplateAuditVerb(action: AdminAuditEventAction) {
  if (action === "template_created") {
    return "Created";
  }
  if (action === "template_published") {
    return "Published";
  }
  if (action === "template_duplicated") {
    return "Duplicated";
  }
  if (action === "template_archived") {
    return "Archived";
  }
  return "Updated";
}
