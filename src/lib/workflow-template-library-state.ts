import type { UserRole, WorkflowTemplate } from "./types.ts";
import {
  canActivateWorkflowTemplateVersion,
  canManageWorkflowTemplate,
  isActiveWorkflowTemplateVersion,
} from "./workflow-template-version-state.ts";

export type WorkflowTemplateLibrarySection = "all" | "library" | "versions" | "archive";

export function getWorkflowTemplateLibraryItems({
  workflowTemplates,
  selectedTemplateId,
  activeUserEmail = "",
  activeUserRole = "participant",
  section = "library",
}: {
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  activeUserEmail?: string;
  activeUserRole?: UserRole;
  section?: WorkflowTemplateLibrarySection;
}) {
  const visibleTemplates = workflowTemplates.filter((template) =>
    isTemplateVisibleInSection(template, section, workflowTemplates),
  );
  const selectedTemplate =
    visibleTemplates.find((template) => template.id === selectedTemplateId) ||
    visibleTemplates[0];

  return visibleTemplates.map((template) => {
    const canManage = canManageWorkflowTemplate({
      template,
      activeUserEmail,
      activeUserRole,
    });
    const isArchived = template.isArchived === true;
    const isActiveVersion = isActiveWorkflowTemplateVersion(template, workflowTemplates);
    const canActivate = canActivateWorkflowTemplateVersion({
      template,
      activeUserEmail,
      activeUserRole,
    }) && !isActiveVersion;

    return {
      id: template.id,
      template,
      isSelected: template.id === selectedTemplate?.id,
      businessDepartmentLabel: `${template.business} - ${template.department}`,
      countsLabel: `${template.documents.length} document(s), ${template.fields.length} field(s), ${template.steps.length} step(s)`,
      versionLabel: `v${template.version || 1}`,
      versionComment: template.versionComment || "",
      statusLabel: formatTemplateStatus(template, isActiveVersion),
      statusTone: getTemplateStatusTone(template, isActiveVersion),
      ownershipLabel: formatTemplateOwnership(template, activeUserEmail, activeUserRole),
      canOpen: !isArchived && canManage && template.isDraft !== false,
      canDuplicate: !isArchived && canManage,
      canDelete: !isArchived && canManage,
      canActivate,
      canComment: !isArchived && canManage,
      openActionLabel: "Open",
      duplicateActionLabel: "Duplicate",
      archiveActionLabel: isArchived ? "Archived" : "Archive",
      activateActionLabel:
        template.isDraft === false && isActiveVersion ? "Active" : "Make active",
      commentActionLabel: "Save note",
    };
  });
}

function isTemplateVisibleInSection(
  template: WorkflowTemplate,
  section: WorkflowTemplateLibrarySection,
  workflowTemplates: WorkflowTemplate[],
) {
  if (section === "archive") {
    return template.isArchived === true;
  }
  if (section === "versions") {
    return template.isArchived !== true;
  }
  if (section === "library") {
    return (
      template.isArchived !== true &&
      (template.isDraft !== false ||
        isActiveWorkflowTemplateVersion(template, workflowTemplates))
    );
  }
  return true;
}

function formatTemplateStatus(template: WorkflowTemplate, isActiveVersion: boolean) {
  if (template.isArchived) {
    return "Archived";
  }
  if (template.isDraft === false) {
    return isActiveVersion ? "Active" : "Inactive";
  }
  return "Draft";
}

function getTemplateStatusTone(template: WorkflowTemplate, isActiveVersion: boolean) {
  if (template.isArchived) {
    return "archived";
  }
  if (template.isDraft === false) {
    return isActiveVersion ? "active" : "inactive";
  }
  return "draft";
}

function formatTemplateOwnership(
  template: WorkflowTemplate,
  activeUserEmail: string,
  activeUserRole: UserRole,
) {
  if (activeUserRole === "superuser") {
    return "Superuser";
  }
  if (template.createdByEmail && template.createdByEmail === activeUserEmail) {
    return "Mine";
  }
  return "Cannot edit";
}
