"use client";

import { QueueView } from "@/app/queue-view";
import { TrackingView } from "@/app/tracking-view";
import { useWorkspaceActionController } from "@/app/use-workspace-action-controller";

export default function WorkspaceActionTab() {
  const { actions, core } = useWorkspaceActionController();
  const {
    actionableTasks,
    selectedActionableTask,
    selectedTaskCurrentForms,
    selectedTaskCurrentUploadRequirements,
    selectedTaskDocumentFieldIssues,
    selectedTaskFormIssues,
    selectedTaskMissingDocuments,
    trackingTasks,
  } = core.taskState;
  const canonicalTaskAlert = core.workspace.canonicalTaskError ? (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
      role="alert"
    >
      <span>{core.workspace.canonicalTaskError}</span>
      <button
        className="rounded-lg border border-amber-300/50 px-3 py-1.5 font-semibold hover:bg-amber-300/10"
        onClick={() => void core.workspace.refreshCanonicalTasks()}
        type="button"
      >
        Retry
      </button>
    </div>
  ) : null;

  if (core.activeTab === "tracking") {
    return (
      <>
        {canonicalTaskAlert}
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
      </>
    );
  }

  return (
    <>
      {canonicalTaskAlert}
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
        currentForms={selectedTaskCurrentForms}
        currentFormIssues={selectedTaskFormIssues}
        currentUploadRequirements={selectedTaskCurrentUploadRequirements}
        currentDocumentFieldIssues={selectedTaskDocumentFieldIssues}
        onSaveTaskFormValues={(values) =>
          selectedActionableTask &&
          actions.saveTaskFormValues(selectedActionableTask.id, values)
        }
        onAttachTaskDocument={(file, documentRequirement) =>
          selectedActionableTask &&
          actions.attachTaskDocument(
            selectedActionableTask.id,
            file,
            documentRequirement,
          )
        }
      />
    </>
  );
}
