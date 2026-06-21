import type { UserRole, WorkflowTemplate } from "./types.ts";

export type WorkflowTemplateLibrarySection = "all" | "library" | "archive";

export function getWorkflowTemplateLibraryItems({
  workflowTemplates,
  selectedTemplateId,
  activeUserEmail = "",
  activeUserRole = "participant",
  section = "all",
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  activeUserEmail?: string;
  activeUserRole?: UserRole;
  section?: WorkflowTemplateLibrarySection;
}) {
  const visibleTemplates = workflowTemplates.filter((template) =>
    isTemplateVisibleInSection(template, section),
  );
  const selectedTemplate =
    visibleTemplates.find((template) => template.id === selectedTemplateId) ||
    visibleTemplates[0];

  return visibleTemplates.map((template) => {
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
      archiveActionLabel: isArchived ? "Archived" : "Delete",
    };
  });
}

function isTemplateVisibleInSection(
  template: WorkflowTemplate,
  section: WorkflowTemplateLibrarySection,
) {
  if (section === "archive") {
    return template.isArchived === true;
  }
  if (section === "library") {
    return template.isArchived !== true;
  }
  return true;
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
