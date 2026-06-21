import type { UserRole, WorkflowTemplate } from "./types.ts";

export function getWorkflowTemplateLibraryItems({
  workflowTemplates,
  selectedTemplateId,
  activeUserEmail = "",
  activeUserRole = "participant",
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  activeUserEmail?: string;
  activeUserRole?: UserRole;
}) {
  const selectedTemplate =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];

  return workflowTemplates.map((template) => {
    const canManage = canManageTemplate(template, activeUserEmail, activeUserRole);
    const isArchived = template.isArchived === true;

    return {
      id: template.id,
      template,
      isSelected: template.id === selectedTemplate?.id,
      businessDepartmentLabel: `${template.business} - ${template.department}`,
      countsLabel: `${template.documents.length} document(s), ${template.fields.length} field(s), ${template.steps.length} step(s)`,
      statusLabel: formatTemplateStatus(template),
      ownershipLabel: formatTemplateOwnership(template, activeUserEmail, activeUserRole),
      canOpen: !isArchived && canManage && template.isDraft !== false,
      canDuplicate: !isArchived,
      canDelete: !isArchived && canManage,
      openActionLabel: "Open in Canvas",
      duplicateActionLabel: "Duplicate as New Template",
    };
  });
}

function canManageTemplate(
  template: WorkflowTemplate,
  activeUserEmail: string,
  activeUserRole: UserRole,
) {
  if (activeUserRole === "superuser") {
    return true;
  }

  return Boolean(template.createdByEmail && template.createdByEmail === activeUserEmail);
}

function formatTemplateStatus(template: WorkflowTemplate) {
  if (template.isArchived) {
    return "Archived";
  }
  return template.isDraft === false ? "Published" : "Draft";
}

function formatTemplateOwnership(
  template: WorkflowTemplate,
  activeUserEmail: string,
  activeUserRole: UserRole,
) {
  if (activeUserRole === "superuser") {
    return "Superuser access";
  }
  if (template.createdByEmail && template.createdByEmail === activeUserEmail) {
    return "Created by me";
  }
  return "Cannot edit";
}
