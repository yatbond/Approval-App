import type {
  ApprovalAction,
  ApprovalTask,
  WorkflowDocumentRequirement,
} from "./types.ts";
import {
  getWorkflowTestRequiredAction,
  isWorkflowTestTask,
} from "./workflow-test-request-state.ts";

export function getSelectedRuntimeTask(
  workflowTasks: ApprovalTask[],
  selectedRuntimeTaskId: string,
) {
  return (
    workflowTasks.find((task) => task.id === selectedRuntimeTaskId) ||
    workflowTasks[0]
  );
}

export function getRuntimeStatusLabel(runtimeTask?: ApprovalTask) {
  return runtimeTask
    ? `${runtimeTask.id} is at ${runtimeTask.currentStep}`
    : "No test has been started for this workflow.";
}

export function getRuntimeNextActionLabel(runtimeTask?: ApprovalTask) {
  return runtimeTask
    ? getWorkflowTestRequiredAction(runtimeTask)
    : "Enter a tester email and start a test.";
}

export function getRuntimeActionItems({
  runtimeTask,
  missingDocuments,
}: {
  runtimeTask?: ApprovalTask;
  missingDocuments: Pick<WorkflowDocumentRequirement, "documentType">[];
}) {
  if (!runtimeTask) {
    return [];
  }

  const actions: Array<{
    action: ApprovalAction;
    label: string;
    title: string;
  }> = runtimeTask.status === "returned"
    ? [
        {
          action: "amend_resubmit",
          label: "Resubmit test",
          title: "Send the returned test request through the workflow again.",
        },
        {
          action: "cancel",
          label: "Cancel test",
          title: "End this test request without approval.",
        },
      ]
    : ["approved", "cancelled"].includes(runtimeTask.status)
      ? []
      : [
          {
            action: "approve",
            label: "Approve test step",
            title: "Approve the current test position and move to the next position.",
          },
          {
            action: "reject_with_comment",
            label: "Reject test step",
            title: "Return the test request to its submitter or configured upstream position.",
          },
        ];

  return actions.map((item) => {
    const approvalBlocked =
      item.action === "approve" &&
      missingDocuments.length > 0 &&
      !isWorkflowTestTask(runtimeTask);

    return {
      ...item,
      disabled: approvalBlocked,
      title: approvalBlocked
        ? `Upload ${missingDocuments
            .map((document) => document.documentType)
            .join(", ")} before approving.`
        : item.title,
    };
  });
}
