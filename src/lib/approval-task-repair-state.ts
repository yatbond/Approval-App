import type { ApprovalTask, AuditEvent } from "./types.ts";

const legacyNextOwner = "next.approver@example.com";
const legacyApprovalDetail = "Approved and sent to the next approver.";

export function repairApprovalTaskState(task: ApprovalTask): ApprovalTask {
  if (
    task.currentNodeId ||
    task.currentOwner !== legacyNextOwner ||
    task.currentStep !== "Next approver review"
  ) {
    return task;
  }

  const firstLegacyApprovalIndex = task.auditTrail.findIndex(
    (event) =>
      event.action === "approved" &&
      event.detail.startsWith(legacyApprovalDetail),
  );
  if (firstLegacyApprovalIndex < 0) {
    return task;
  }

  const repairedAuditTrail = task.auditTrail
    .slice(0, firstLegacyApprovalIndex + 1)
    .map(repairLegacyApprovalEvent);
  const approvalEvent = repairedAuditTrail.at(-1);

  return {
    ...task,
    status: "approved",
    currentOwner: "",
    currentStep: "Approved",
    currentNodeId: undefined,
    pendingNodeIds: [],
    pendingOwners: [],
    participants: task.participants.filter((email) => email !== legacyNextOwner),
    lastAction: approvalEvent
      ? `Approved by ${approvalEvent.actor}`
      : task.lastAction,
    auditTrail: repairedAuditTrail,
  };
}

function repairLegacyApprovalEvent(event: AuditEvent): AuditEvent {
  if (
    event.action !== "approved" ||
    !event.detail.startsWith(legacyApprovalDetail)
  ) {
    return event;
  }

  return {
    ...event,
    detail: event.detail.replace(
      legacyApprovalDetail,
      "Approved and completed the legacy workflow.",
    ),
  };
}
