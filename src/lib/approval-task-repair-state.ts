import type { ApprovalTask, AuditEvent } from "./types.ts";

const legacyNextOwner = "next.approver@example.com";
const legacyApprovalDetail = "Approved and sent to the next approver.";

export function repairApprovalTaskState(task: ApprovalTask): ApprovalTask {
  if (task.currentNodeId) {
    return task;
  }

  const legacyApprovalEvents = task.auditTrail.filter(
    (event) =>
      event.action === "approved" &&
      isLegacyApprovalDetail(event.detail),
  );
  const isPendingLegacyLoop =
    task.currentOwner === legacyNextOwner &&
    task.currentStep === "Next approver review";
  const isCompletedLegacyRepair =
    task.status === "approved" &&
    !task.currentOwner &&
    task.currentStep === "Approved" &&
    legacyApprovalEvents.some((event) =>
      event.detail.includes("completed the legacy workflow"),
    );
  if (
    !legacyApprovalEvents.length ||
    (!isPendingLegacyLoop && !isCompletedLegacyRepair)
  ) {
    return task;
  }

  const canonicalApproval = [...legacyApprovalEvents].sort(compareEventSequence)[0];
  const repairedAuditTrail = task.auditTrail
    .filter(
      (event) =>
        !(
          isLegacyNextOwnerAssignment(event) ||
          (event.action === "approved" &&
            isLegacyApprovalDetail(event.detail) &&
            event.id !== canonicalApproval.id)
        ),
    )
    .map(repairLegacyApprovalEvent);
  const approvalEvent = repairedAuditTrail.find(
    (event) => event.id === canonicalApproval.id,
  );

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

function isLegacyNextOwnerAssignment(event: AuditEvent) {
  return (
    event.action === "assigned" &&
    (event.targetEmail === legacyNextOwner ||
      event.detail.includes(`Assigned to ${legacyNextOwner}`))
  );
}

function isLegacyApprovalDetail(detail: string) {
  return (
    detail.startsWith(legacyApprovalDetail) ||
    detail.includes("Approved and completed the legacy workflow.")
  );
}

function compareEventSequence(a: AuditEvent, b: AuditEvent) {
  return eventSequence(a.id) - eventSequence(b.id);
}

function eventSequence(eventId: string) {
  const match = eventId.match(/-event-(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
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
