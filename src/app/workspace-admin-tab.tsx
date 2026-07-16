"use client";

import { AdminView } from "@/app/admin-view";
import { useWorkspaceAdminController } from "@/app/use-workspace-admin-controller";
import { useWorkspaceEmailDelivery } from "@/app/use-workspace-email-delivery";

export default function WorkspaceAdminTab() {
  const { core, records } = useWorkspaceAdminController();
  const email = useWorkspaceEmailDelivery({
    requestConfirmation: core.requestConfirmation,
  });

  return (
    <AdminView
      businessDirectory={core.workspace.businessDirectory}
      adminRecordError={records.adminRecordError}
      setBusinessDirectory={records.updateBusinessDirectoryRecords}
      onDeactivateBusinessRecord={records.confirmDeactivateBusinessRecord}
      onDeactivateDepartmentRecord={records.confirmDeactivateDepartmentRecord}
      legacyDepartments={core.departments}
      userDirectory={core.workspace.userDirectory}
      taskNotifications={core.taskNotifications}
      roleAssignments={core.workspace.effectiveRoleAssignments}
      setRoleAssignments={records.updateRoleAssignmentRecords}
      adminAuditEvents={core.workspace.adminAuditEvents}
      activeUserEmail={core.activeUser.email}
      emailDeliveryMessage={email.emailDeliveryMessage}
      emailOutboxEntries={email.emailOutboxEntries}
      onSendTestEmail={email.sendTestEmail}
    />
  );
}
