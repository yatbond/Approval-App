import type { ApprovalTask, WorkflowTemplate } from "@/lib/types";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export function applyEscalationChecks(
  tasks: ApprovalTask[],
  templates: WorkflowTemplate[],
  now = new Date(),
) {
  return tasks.map((task) => escalateTaskIfNeeded(task, templates, now));
}

function escalateTaskIfNeeded(
  task: ApprovalTask,
  templates: WorkflowTemplate[],
  now: Date,
): ApprovalTask {
  if (
    task.status === "approved" ||
    task.status === "cancelled" ||
    task.status === "returned" ||
    !task.dueAt ||
    new Date(task.dueAt).getTime() > now.getTime()
  ) {
    return task;
  }

  const template = templates.find(
    (item) => item.id === task.workflowTemplateId || item.name === task.workflow,
  );
  const graph = template ? createWorkflowGraphFromTemplate(template) : undefined;
  const currentNode = graph?.nodes.find((node) => node.id === task.currentNodeId);
  const escalationEmail = currentNode?.escalationEmail?.trim();

  if (!escalationEmail || task.currentOwner === escalationEmail) {
    return task.status === "escalated" ? task : { ...task, status: "overdue" };
  }

  const timestamp = formatTimestamp(now);
  return {
    ...task,
    status: "escalated",
    currentOwner: escalationEmail,
    pendingOwners: replaceOwner(task.pendingOwners, task.currentOwner, escalationEmail),
    participants: uniqueEmails([
      ...task.participants,
      escalationEmail,
      currentNode?.assigneeEmail,
    ]),
    lastAction: `Escalated to ${currentNode?.escalationName || escalationEmail}`,
    auditTrail: [
      ...task.auditTrail,
      {
        id: `${task.id}-event-${task.auditTrail.length + 1}`,
        action: "escalated",
        actor: "System",
        actorEmail: "system@example.com",
        timestamp,
        targetEmail: escalationEmail,
        detail: `Due time passed; routed to ${currentNode?.escalationName || escalationEmail}.`,
      },
    ],
  };
}

function replaceOwner(
  owners: string[] | undefined,
  previousEmail: string,
  nextEmail: string,
) {
  if (!owners?.length) {
    return owners;
  }

  return Array.from(
    new Set(owners.map((email) => (email === previousEmail ? nextEmail : email))),
  );
}

function uniqueEmails(emails: Array<string | undefined>) {
  return Array.from(new Set(emails.filter((email): email is string => Boolean(email))));
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}
