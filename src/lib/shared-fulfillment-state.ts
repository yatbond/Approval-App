import type {
  ApprovalActor,
  ApprovalAttachment,
  ApprovalTask,
  TaskCorrectionRequest,
  TaskSharedFulfillment,
} from "./types.ts";

export function getTaskSharedFulfillmentSubmitState({
  task,
  actor,
  attachment,
  requirementNodeId,
  documentId,
  documentType,
  assignedSubmitterEmail,
  assignedSubmitterName,
  required,
  requiresConfirmation,
  extractedFields,
  now = new Date(),
}: {
  task: ApprovalTask;
  actor: ApprovalActor;
  attachment: ApprovalAttachment;
  requirementNodeId: string;
  documentId: string;
  documentType: string;
  assignedSubmitterEmail: string;
  assignedSubmitterName: string;
  required: boolean;
  requiresConfirmation: boolean;
  extractedFields: Record<string, string>;
  now?: Date;
}) {
  const submittedAt = formatTimestamp(now);
  const fulfillmentId = nextSharedFulfillmentId(task);
  const normalizedAssignedEmail = normalizeEmail(assignedSubmitterEmail);
  const normalizedUploaderEmail = normalizeEmail(actor.email);
  const fulfillment: TaskSharedFulfillment = {
    id: fulfillmentId,
    taskId: task.id,
    requirementNodeId,
    documentId,
    documentType,
    assignedSubmitterEmail: normalizedAssignedEmail,
    assignedSubmitterName: assignedSubmitterName.trim() || normalizedAssignedEmail,
    uploaderEmail: normalizedUploaderEmail,
    uploaderName: actor.name,
    attachmentId: attachment.id,
    required,
    status: requiresConfirmation ? "pending_confirmation" : "confirmed",
    submittedAt,
  };
  const nextTask: ApprovalTask = {
    ...task,
    sharedFulfillments: [...(task.sharedFulfillments || []), fulfillment],
    attachments: [...(task.attachments || []), attachment],
    extractedFields: {
      ...task.extractedFields,
      ...namespaceSharedFields(documentType, extractedFields),
    },
    participants: uniqueEmails([
      ...task.participants,
      normalizedAssignedEmail,
      normalizedUploaderEmail,
    ]),
    lastAction: `Shared fulfillment submitted by ${actor.name}`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: nextAuditEventId(task),
        action: "shared_fulfillment_submitted",
        actor: actor.name,
        actorEmail: actor.email,
        timestamp: submittedAt,
        detail: `Shared fulfillment submitted by ${actor.email} for ${documentType}.`,
        targetEmail: normalizedAssignedEmail,
      },
    ],
  };

  return { didApply: true, task: nextTask, errorMessage: "" };
}

export function getTaskSharedFulfillmentDecisionState({
  task,
  fulfillmentId,
  actor,
  currentOwnerEmail,
  decision,
  note = "",
  now = new Date(),
}: {
  task: ApprovalTask;
  fulfillmentId: string;
  actor: ApprovalActor;
  currentOwnerEmail: string;
  decision: "confirm" | "reject";
  note?: string;
  now?: Date;
}) {
  const fulfillment = (task.sharedFulfillments || []).find(
    (item) => item.id === fulfillmentId,
  );
  if (!fulfillment) {
    return { didApply: false, task, errorMessage: "Shared fulfillment was not found." };
  }

  if (fulfillment.status !== "pending_confirmation") {
    return {
      didApply: false,
      task,
      errorMessage: "Shared fulfillment has already been decided.",
    };
  }

  const decisionRole = getDecisionRole({
    actorEmail: actor.email,
    currentOwnerEmail,
    assignedSubmitterEmail: fulfillment.assignedSubmitterEmail,
  });
  if (!decisionRole) {
    return {
      didApply: false,
      task,
      errorMessage: "You cannot confirm or reject this shared fulfillment.",
    };
  }

  const trimmedNote = note.trim();
  if (decision === "reject" && !trimmedNote) {
    return { didApply: false, task, errorMessage: "Enter a rejection note." };
  }

  const decidedAt = formatTimestamp(now);
  const correctionRequest =
    decision === "reject" && fulfillment.required
      ? buildCorrectionRequest({
          task,
          fulfillment,
          actor,
          rejectionNote: trimmedNote,
          createdAt: decidedAt,
        })
      : null;
  const nextSharedFulfillments = (task.sharedFulfillments || []).map((item) =>
    item.id === fulfillmentId
      ? {
          ...item,
          status: decision === "confirm" ? "confirmed" as const : "rejected" as const,
          decidedAt,
          decidedByEmail: normalizeEmail(actor.email),
          decidedByName: actor.name,
          decisionRole,
          ...(trimmedNote ? { decisionNote: trimmedNote } : {}),
          ...(correctionRequest
            ? { correctionRequestId: correctionRequest.id }
            : {}),
        }
      : item,
  );
  const auditTrail = [
    ...task.auditTrail,
    {
      id: nextAuditEventId(task),
      action:
        decision === "confirm"
          ? "shared_fulfillment_confirmed"
          : "shared_fulfillment_rejected",
      actor: actor.name,
      actorEmail: actor.email,
      timestamp: decidedAt,
      detail: `Shared fulfillment ${decision === "confirm" ? "confirmed" : "rejected"} by ${actor.email} for ${fulfillment.documentType}.`,
      targetEmail: fulfillment.uploaderEmail,
    },
  ] satisfies ApprovalTask["auditTrail"];

  if (correctionRequest) {
    auditTrail.push({
      id: `${task.id}-event-${task.auditTrail.length + 2}`,
      action: "correction_requested",
      actor: actor.name,
      actorEmail: actor.email,
      timestamp: decidedAt,
      detail: `Correction requested from ${fulfillment.uploaderEmail}: ${trimmedNote}`,
      targetEmail: fulfillment.uploaderEmail,
    });
  }

  const nextTask: ApprovalTask = {
    ...task,
    sharedFulfillments: nextSharedFulfillments,
    correctionRequests: correctionRequest
      ? [...(task.correctionRequests || []), correctionRequest]
      : task.correctionRequests,
    lastAction:
      decision === "confirm"
        ? `Shared fulfillment confirmed by ${actor.name}`
        : `Shared fulfillment rejected by ${actor.name}`,
    auditTrail,
  };

  return { didApply: true, task: nextTask, errorMessage: "" };
}

export function getTaskCorrectionUploadState({
  task,
  correctionRequestId,
  actor,
  attachment,
  extractedFields,
  now = new Date(),
}: {
  task: ApprovalTask;
  correctionRequestId: string;
  actor: ApprovalActor;
  attachment: ApprovalAttachment;
  extractedFields: Record<string, string>;
  now?: Date;
}) {
  const correction = (task.correctionRequests || []).find(
    (item) => item.id === correctionRequestId,
  );
  if (!correction) {
    return { didApply: false, task, errorMessage: "Correction request was not found." };
  }

  if (correction.status !== "requested") {
    return {
      didApply: false,
      task,
      errorMessage: "Correction request has already been resolved.",
    };
  }

  const actorEmail = normalizeEmail(actor.email);
  const allowedEmails = [
    normalizeEmail(correction.uploaderEmail),
    normalizeEmail(correction.assignedSubmitterEmail),
  ];
  if (!allowedEmails.includes(actorEmail)) {
    return {
      didApply: false,
      task,
      errorMessage: "You cannot resolve this correction request.",
    };
  }

  const originalFulfillment = (task.sharedFulfillments || []).find(
    (item) => item.id === correction.sharedFulfillmentId,
  );
  if (!originalFulfillment) {
    return {
      didApply: false,
      task,
      errorMessage: "Original shared fulfillment was not found.",
    };
  }

  const submittedAt = formatTimestamp(now);
  const nextFulfillment: TaskSharedFulfillment = {
    id: nextSharedFulfillmentId(task),
    taskId: task.id,
    requirementNodeId: originalFulfillment.requirementNodeId,
    documentId: originalFulfillment.documentId,
    documentType: originalFulfillment.documentType,
    assignedSubmitterEmail: originalFulfillment.assignedSubmitterEmail,
    assignedSubmitterName: originalFulfillment.assignedSubmitterName,
    uploaderEmail: actorEmail,
    uploaderName: actor.name,
    attachmentId: attachment.id,
    required: originalFulfillment.required,
    status: "pending_confirmation",
    submittedAt,
  };
  const nextTask: ApprovalTask = {
    ...task,
    sharedFulfillments: [...(task.sharedFulfillments || []), nextFulfillment],
    correctionRequests: (task.correctionRequests || []).map((item) =>
      item.id === correctionRequestId
        ? {
            ...item,
            status: "submitted",
            submittedAt,
            resolvedByFulfillmentId: nextFulfillment.id,
          }
        : item,
    ),
    attachments: [...(task.attachments || []), attachment],
    extractedFields: {
      ...task.extractedFields,
      ...namespaceSharedFields(originalFulfillment.documentType, extractedFields),
    },
    participants: uniqueEmails([...task.participants, actorEmail]),
    lastAction: `Correction submitted by ${actor.name}`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: nextAuditEventId(task),
        action: "correction_submitted",
        actor: actor.name,
        actorEmail: actor.email,
        timestamp: submittedAt,
        detail: `Correction submitted by ${actor.email} for ${originalFulfillment.documentType}.`,
        targetEmail: correction.requestedByEmail,
      },
    ],
  };

  return { didApply: true, task: nextTask, errorMessage: "" };
}

function buildCorrectionRequest({
  task,
  fulfillment,
  actor,
  rejectionNote,
  createdAt,
}: {
  task: ApprovalTask;
  fulfillment: TaskSharedFulfillment;
  actor: ApprovalActor;
  rejectionNote: string;
  createdAt: string;
}): TaskCorrectionRequest {
  return {
    id: `${task.id}-correction-${(task.correctionRequests || []).length + 1}`,
    taskId: task.id,
    sharedFulfillmentId: fulfillment.id,
    requestedByEmail: normalizeEmail(actor.email),
    requestedByName: actor.name,
    assignedSubmitterEmail: fulfillment.assignedSubmitterEmail,
    uploaderEmail: fulfillment.uploaderEmail,
    rejectionNote,
    status: "requested",
    blocksApproval: fulfillment.required,
    createdAt,
  };
}

function getDecisionRole({
  actorEmail,
  currentOwnerEmail,
  assignedSubmitterEmail,
}: {
  actorEmail: string;
  currentOwnerEmail: string;
  assignedSubmitterEmail: string;
}): "current_actor" | "assigned_submitter" | null {
  const normalizedActorEmail = normalizeEmail(actorEmail);
  if (
    normalizedActorEmail &&
    normalizedActorEmail === normalizeEmail(currentOwnerEmail)
  ) {
    return "current_actor";
  }
  if (
    normalizedActorEmail &&
    normalizedActorEmail === normalizeEmail(assignedSubmitterEmail)
  ) {
    return "assigned_submitter";
  }
  return null;
}

function nextSharedFulfillmentId(task: ApprovalTask) {
  return `${task.id}-shared-${(task.sharedFulfillments || []).length + 1}`;
}

function nextAuditEventId(task: ApprovalTask) {
  return `${task.id}-event-${task.auditTrail.length + 1}`;
}

function namespaceSharedFields(documentType: string, fields: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fields).map(([label, value]) => [
      `Shared ${documentType} - ${label}`,
      value,
    ]),
  );
}

function uniqueEmails(emails: string[]) {
  return Array.from(
    new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean)),
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function formatTimestamp(date: Date) {
  return date.toLocaleString("en-CA", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");
}
