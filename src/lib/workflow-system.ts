import type {
  ApprovalTask,
  NotificationItem,
  WorkflowTemplate,
} from "@/lib/types";

export type TaskNotification = NotificationItem & {
  requestId: string;
  recipientEmail: string;
  kind: "action_required" | "originator_update" | "fyi" | "escalation";
};

export function publishWorkflowTemplateVersion(
  template: WorkflowTemplate,
  now = new Date(),
): WorkflowTemplate {
  const nextVersion = (template.version || 1) + 1;
  const baseTemplateId = template.sourceTemplateId || template.id.replace(/-v\d+$/, "");

  return {
    ...template,
    id: `${baseTemplateId}-v${nextVersion}`,
    version: nextVersion,
    isDraft: false,
    publishedAt: now.toISOString(),
    sourceTemplateId: template.id,
  };
}

export function buildTaskNotifications(tasks: ApprovalTask[]): TaskNotification[] {
  return tasks.flatMap((task) => {
    const notifications: TaskNotification[] = [];

    if (task.currentOwner && task.status !== "approved" && task.status !== "cancelled") {
      notifications.push({
        id: `${task.id}-notify-owner`,
        title: "Action required",
        body: `${task.title} is waiting at ${task.currentStep}.`,
        time: task.due,
        unread: true,
        requestId: task.id,
        recipientEmail: task.currentOwner,
        kind: task.status === "overdue" || task.status === "escalated"
          ? "escalation"
          : "action_required",
      });
    }

    notifications.push({
      id: `${task.id}-notify-originator`,
      title: "Request status updated",
      body: `${task.title}: ${task.lastAction}.`,
      time: task.due,
      unread: task.status === "returned",
      requestId: task.id,
      recipientEmail: task.requesterEmail,
      kind: "originator_update",
    });

    task.participants
      .filter((email) => email !== task.currentOwner && email !== task.requesterEmail)
      .forEach((email) => {
        notifications.push({
          id: `${task.id}-notify-${email}`,
          title: "Workflow update",
          body: `${task.title}: ${task.currentStep}.`,
          time: task.due,
          unread: false,
          requestId: task.id,
          recipientEmail: email,
          kind: "fyi",
        });
      });

    return dedupeNotifications(notifications);
  });
}

function dedupeNotifications(notifications: TaskNotification[]) {
  const byRecipient = new Map<string, TaskNotification>();
  notifications.forEach((notification) => {
    if (!byRecipient.has(notification.recipientEmail)) {
      byRecipient.set(notification.recipientEmail, notification);
    }
  });
  return Array.from(byRecipient.values());
}
