"use client";

import { WorkflowView } from "@/app/workflow-view";
import { useWorkspaceActionController } from "@/app/use-workspace-action-controller";
import { useWorkspaceAdminController } from "@/app/use-workspace-admin-controller";

export default function WorkspaceWorkflowTab() {
  const { core, records } = useWorkspaceAdminController();
  const { actions } = useWorkspaceActionController();

  function selectTemplateRecord(templateId: string) {
    core.workspace.setSelectedTemplateId(templateId);
    void core.workspace.persistWorkspaceSnapshot(
      core.workspace.buildWorkspaceSnapshot({
        selectedTemplateId: templateId,
      }),
    );
  }

  return (
    <WorkflowView
      businessDirectory={core.workspace.businessDirectory}
      tasks={core.workspace.tasks}
      workflowTemplates={core.workspace.templates}
      formLibrary={core.workspace.formLibrary}
      selectedTemplateId={core.workspace.selectedTemplateId}
      setSelectedTemplateId={selectTemplateRecord}
      onDeleteTemplate={records.confirmDeleteTemplateRecord}
      requestConfirmation={core.requestConfirmation}
      adminRecordError={records.adminRecordError}
      onCreateTemplate={records.createTemplateRecord}
      onUpdateTemplate={records.updateTemplateRecord}
      onActivateTemplateVersion={records.activateTemplateVersionRecord}
      onUpdateTemplateVersionComment={
        records.updateTemplateVersionCommentRecord
      }
      userDirectory={core.workspace.userDirectory}
      activeUser={core.activeUser}
      onRunWorkflowAction={actions.runWorkflowAction}
      onCreateWorkflowTestRequest={actions.createWorkflowTestRequest}
      onSaveFormLibrary={records.saveFormLibraryRecord}
      onArchiveFormLibrary={records.archiveFormLibraryRecord}
    />
  );
}
