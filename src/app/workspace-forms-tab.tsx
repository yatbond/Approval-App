"use client";

import { FormLibrary } from "@/app/form-library";
import { useWorkspaceAdminController } from "@/app/use-workspace-admin-controller";

export default function WorkspaceFormsTab() {
  const { core, records } = useWorkspaceAdminController();

  return (
    <FormLibrary
      definitions={core.workspace.formLibrary}
      businessDirectory={core.workspace.businessDirectory}
      workflowTemplates={core.workspace.templates}
      workspaceOwnerEmail={core.activeUser.email}
      onSave={records.saveFormLibraryRecord}
      onArchive={records.archiveFormLibraryRecord}
      onActivate={records.activateFormLibraryRecord}
    />
  );
}
