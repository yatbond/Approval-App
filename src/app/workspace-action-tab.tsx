"use client";

import { QueueView } from "@/app/queue-view";
import { TrackingView } from "@/app/tracking-view";
import { useWorkspaceActionController } from "@/app/use-workspace-action-controller";

export default function WorkspaceActionTab() {
  const { actions, core } = useWorkspaceActionController();
  const {
    actionableTasks,
    selectedActionableTask,
    selectedTaskMissingDocuments,
    trackingTasks,
  } = core.taskState;

  if (core.activeTab === "tracking") {
    return (
      <TrackingView
        tasks={trackingTasks}
        selectedTaskId={core.workspace.selectedTaskId}
        setSelectedTaskId={core.workspace.setSelectedTaskId}
        workflowTemplates={core.workspace.templates}
        activeUserEmail={core.activeUser.email}
        userDirectory={core.workspace.userDirectory}
        onSubmitContributorUpload={actions.submitContributorRequestUpload}
        onDecideSharedFulfillment={actions.decideSharedFulfillment}
        onSubmitCorrectionUpload={actions.submitCorrectionUpload}
      />
    );
  }

  return (
    <QueueView
      selectedTask={selectedActionableTask}
      selectedTaskId={core.workspace.selectedTaskId}
      setSelectedTaskId={core.workspace.setSelectedTaskId}
      tasks={actionableTasks}
      comment={actions.comment}
      setComment={actions.setComment}
      targetEmail={actions.targetEmail}
      setTargetEmail={actions.setTargetEmail}
      contributorName={actions.contributorName}
      setContributorName={actions.setContributorName}
      contributorEmail={actions.contributorEmail}
      setContributorEmail={actions.setContributorEmail}
      contributorRequestNote={actions.contributorRequestNote}
      setContributorRequestNote={actions.setContributorRequestNote}
      contributorDueAt={actions.contributorDueAt}
      setContributorDueAt={actions.setContributorDueAt}
      contributorBlocksApproval={actions.contributorBlocksApproval}
      setContributorBlocksApproval={actions.setContributorBlocksApproval}
      contributorRequestError={actions.contributorRequestError}
      onRequestContributor={actions.requestTaskContributor}
      recordAction={actions.confirmRecordAction}
      activeUserEmail={core.activeUser.email}
      userDirectory={core.workspace.userDirectory}
      workflowTemplates={core.workspace.templates}
      actionError={actions.actionError}
      actionPending={
        actions.actionSubmissionTaskId === selectedActionableTask?.id
      }
      missingCurrentDocuments={selectedTaskMissingDocuments}
      onAttachTaskDocument={(file, documentRequirement) =>
        selectedActionableTask &&
        actions.attachTaskDocument(
          selectedActionableTask.id,
          file,
          documentRequirement,
        )
      }
    />
  );
}
