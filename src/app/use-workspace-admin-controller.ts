"use client";

import { useApprovalWorkspaceCore } from "@/app/approval-workspace-core";
import { useWorkspaceAdminRecords } from "@/app/use-workspace-admin-records";

export function useWorkspaceAdminController() {
  const core = useApprovalWorkspaceCore();
  const records = useWorkspaceAdminRecords({
    activeUser: core.activeUser,
    adminAuditEvents: core.workspace.adminAuditEvents,
    businessDirectory: core.workspace.businessDirectory,
    buildWorkspaceSnapshot: core.workspace.buildWorkspaceSnapshot,
    effectiveRoleAssignments: core.workspace.effectiveRoleAssignments,
    formLibrary: core.workspace.formLibrary,
    persistWorkspaceSnapshot: core.workspace.persistWorkspaceSnapshot,
    requestConfirmation: core.requestConfirmation,
    selectedTemplateId: core.workspace.selectedTemplateId,
    setAdminAuditEvents: core.workspace.setAdminAuditEvents,
    setBusinessDirectory: core.workspace.setBusinessDirectory,
    setFormLibrary: core.workspace.setFormLibrary,
    setRoleAssignments: core.workspace.setRoleAssignments,
    setSelectedTemplateId: core.workspace.setSelectedTemplateId,
    setTemplates: core.workspace.setTemplates,
    tasks: core.workspace.tasks,
    templates: core.workspace.templates,
    workspaceSyncMode: core.workspace.workspaceSyncMode,
  });

  return { core, records };
}
