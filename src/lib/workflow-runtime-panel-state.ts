import type {
  ApprovalAction,
  ApprovalTask,
  WorkflowDocumentRequirement,
} from "./types.ts";

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
    ? `${runtimeTask.title} is at ${runtimeTask.currentStep}`
    : "no active request is linked to this template yet";
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

  const actions: { action: ApprovalAction; label: string }[] = [
    { action: "approve", label: "Approve" },
    { action: "reject_with_comment", label: "Reject" },
    { action: "amend_resubmit", label: "Resubmit" },
    { action: "cancel", label: "Cancel" },
  ];

  return actions.map((item) => {
    const approvalBlocked =
      item.action === "approve" && missingDocuments.length > 0;

    return {
      ...item,
      disabled: approvalBlocked,
      title: approvalBlocked
        ? `Upload ${missingDocuments
            .map((document) => document.documentType)
            .join(", ")} before approving.`
        : `Simulate ${item.label.toLowerCase()} for this request.`,
    };
  });
}
