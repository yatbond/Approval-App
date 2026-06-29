import type {
  ApprovalActor,
  ApprovalAttachment,
  ApprovalTask,
  TaskCollaborationRequest,
} from "./types.ts";

export function getTaskContributorRequestState({
  task,
  actor,
  contributorEmail,
  contributorName,
  requestNote,
  dueAt,
  blocksApproval = true,
  now = new Date(),
}: {
  task: ApprovalTask;
  actor: ApprovalActor;
  contributorEmail: string;
  contributorName: string;
  requestNote: string;
  dueAt: string;
  blocksApproval?: boolean;
  now?: Date;
}) {
  const normalizedEmail = contributorEmail.trim().toLowerCase();
  const trimmedNote = requestNote.trim();

  if (!normalizedEmail || !trimmedNote) {
    return {
      didApply: false,
      task,
      errorMessage: "Enter a contributor email and request note.",
    };
  }

  const currentRequests = task.collaborationRequests || [];
  const request: TaskCollaborationRequest = {
    id: `${task.id}-collab-${currentRequests.length + 1}`,
    contributorName: contributorName.trim() || normalizedEmail,
    contributorEmail: normalizedEmail,
    requestedByName: actor.name,
    requestedByEmail: actor.email,
    requestNote: trimmedNote,
    dueAt: dueAt.trim(),
    blocksApproval,
    status: "requested",
    createdAt: formatTimestamp(now),
  };
  const detail = `Requested input from ${normalizedEmail}: ${trimmedNote}`;
  const nextTask: ApprovalTask = {
    ...task,
    collaborationRequests: [...currentRequests, request],
    participants: uniqueEmails([...task.participants, normalizedEmail]),
    lastAction: `Requested input from ${normalizedEmail}`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: `${task.id}-event-${task.auditTrail.length + 1}`,
        action: "contribution_requested",
        actor: actor.name,
        actorEmail: actor.email,
        timestamp: formatTimestamp(now),
        detail,
        targetEmail: normalizedEmail,
      },
    ],
  };

  return {
    didApply: true,
    task: nextTask,
    errorMessage: "",
  };
}

export function getTaskContributorUploadState({
  task,
  collaborationRequestId,
  actor,
  attachment,
  extractedFields,
  now = new Date(),
}: {
  task: ApprovalTask;
  collaborationRequestId: string;
  actor: ApprovalActor;
  attachment: ApprovalAttachment;
  extractedFields: Record<string, string>;
  now?: Date;
}) {
  const currentRequests = task.collaborationRequests || [];
  const request = currentRequests.find((item) => item.id === collaborationRequestId);
  if (!request) {
    return {
      didApply: false,
      task,
      errorMessage: "Contributor request was not found.",
    };
  }

  const submittedAt = formatTimestamp(now);
  const contributorLabel = request.contributorName || request.contributorEmail;
  const namespacedFields = namespaceContributorFields(
    contributorLabel,
    extractedFields,
  );
  const nextTask: ApprovalTask = {
    ...task,
    collaborationRequests: currentRequests.map((item) =>
      item.id === collaborationRequestId
        ? {
            ...item,
            status: "submitted",
            submittedAt,
            attachmentIds: Array.from(
              new Set([...(item.attachmentIds || []), attachment.id]),
            ),
            extractedFields: {
              ...(item.extractedFields || {}),
              ...extractedFields,
            },
          }
        : item,
    ),
    attachments: [...(task.attachments || []), attachment],
    extractedFields: {
      ...task.extractedFields,
      ...namespacedFields,
    },
    participants: uniqueEmails([...task.participants, actor.email]),
    lastAction: `Contributor input submitted by ${actor.name}`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: `${task.id}-event-${task.auditTrail.length + 1}`,
        action: "contribution_submitted",
        actor: actor.name,
        actorEmail: actor.email,
        timestamp: submittedAt,
        detail: `Contributor input submitted by ${actor.email}: ${attachment.fileName}.`,
        targetEmail: request.requestedByEmail,
      },
    ],
  };

  return {
    didApply: true,
    task: nextTask,
    errorMessage: "",
  };
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.trim()).filter(Boolean)));
}

function namespaceContributorFields(
  contributorLabel: string,
  fields: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(fields).map(([label, value]) => [
      `Contributor ${contributorLabel} - ${label}`,
      value,
    ]),
  );
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
