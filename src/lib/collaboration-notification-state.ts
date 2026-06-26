import type { ApprovalTask } from "./types.ts";
import type { TaskNotification } from "./workflow-system.ts";

export type CollaborationNotificationEvent =
  | { type: "shared_pending_confirmation"; fulfillmentId: string }
  | { type: "shared_confirmed"; fulfillmentId: string }
  | { type: "shared_rejected"; fulfillmentId: string }
  | { type: "correction_created"; correctionRequestId: string }
  | { type: "correction_resolved"; correctionRequestId: string }
  | { type: "contributor_submitted"; collaborationRequestId: string };

export function buildCollaborationNotifications({
  task,
  event,
}: {
  task: ApprovalTask;
  event: CollaborationNotificationEvent;
}): TaskNotification[] {
  if (
    event.type === "shared_pending_confirmation" ||
    event.type === "shared_confirmed" ||
    event.type === "shared_rejected"
  ) {
    return buildSharedFulfillmentNotifications({ task, event });
  }

  if (
    event.type === "correction_created" ||
    event.type === "correction_resolved"
  ) {
    return buildCorrectionNotifications({ task, event });
  }

  const request = (task.collaborationRequests || []).find(
    (item) => item.id === event.collaborationRequestId,
  );
  if (!request) {
    return [];
  }

  return createNotifications({
    task,
    eventKey: event.type,
    title: "Contributor input submitted",
    body: `${request.contributorName || request.contributorEmail} submitted contributor input for ${task.title}.`,
    recipients: [request.requestedByEmail, task.requesterEmail],
  });
}

function buildSharedFulfillmentNotifications({
  task,
  event,
}: {
  task: ApprovalTask;
  event: Extract<
    CollaborationNotificationEvent,
    {
      type:
        | "shared_pending_confirmation"
        | "shared_confirmed"
        | "shared_rejected";
    }
  >;
}) {
  const fulfillment = (task.sharedFulfillments || []).find(
    (item) => item.id === event.fulfillmentId,
  );
  if (!fulfillment) {
    return [];
  }

  if (event.type === "shared_pending_confirmation") {
    return createNotifications({
      task,
      eventKey: event.type,
      title: "Shared upload needs confirmation",
      body: `${fulfillment.documentType} was uploaded by ${fulfillment.uploaderEmail} and needs confirmation.`,
      recipients: [fulfillment.assignedSubmitterEmail, task.currentOwner],
    });
  }

  if (event.type === "shared_confirmed") {
    return createNotifications({
      task,
      eventKey: event.type,
      title: "Shared upload confirmed",
      body: `${fulfillment.documentType} shared upload was confirmed.`,
      recipients: [
        fulfillment.uploaderEmail,
        fulfillment.assignedSubmitterEmail,
        task.requesterEmail,
      ],
    });
  }

  return createNotifications({
    task,
    eventKey: event.type,
    title: "Shared upload rejected",
    body: `${fulfillment.documentType} shared upload was rejected.`,
    recipients: [fulfillment.uploaderEmail, task.requesterEmail],
  });
}

function buildCorrectionNotifications({
  task,
  event,
}: {
  task: ApprovalTask;
  event: Extract<
    CollaborationNotificationEvent,
    { type: "correction_created" | "correction_resolved" }
  >;
}) {
  const correction = (task.correctionRequests || []).find(
    (item) => item.id === event.correctionRequestId,
  );
  if (!correction) {
    return [];
  }

  if (event.type === "correction_created") {
    return createNotifications({
      task,
      eventKey: event.type,
      title: "Correction requested",
      body: `Correction requested: ${correction.rejectionNote}`,
      recipients: [correction.uploaderEmail, correction.assignedSubmitterEmail],
    });
  }

  return createNotifications({
    task,
    eventKey: event.type,
    title: "Correction resolved",
    body: `Correction request for ${task.title} was resolved.`,
    recipients: [correction.requestedByEmail, task.requesterEmail],
  });
}

function createNotifications({
  task,
  eventKey,
  title,
  body,
  recipients,
}: {
  task: ApprovalTask;
  eventKey: string;
  title: string;
  body: string;
  recipients: string[];
}): TaskNotification[] {
  return uniqueEmails(recipients).map((recipientEmail) => ({
    id: `${task.id}-notify-${eventKey}-${recipientEmail}`,
    title,
    body,
    time: task.due,
    unread: true,
    requestId: task.id,
    recipientEmail,
    kind: "collaboration_update",
  }));
}

function uniqueEmails(emails: string[]) {
  return Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
}
