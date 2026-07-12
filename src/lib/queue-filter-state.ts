import type { ApprovalTask } from "./types.ts";
import { emailsMatch } from "./approval-state.ts";

export const queueFilters = [
  { id: "all", label: "All", description: "All work currently assigned to you." },
  {
    id: "attention",
    label: "Attention",
    description: "Overdue or escalated work that needs prompt action.",
  },
  {
    id: "delegated",
    label: "Delegated",
    description: "Tasks delegated to you while the original owner keeps oversight.",
  },
  {
    id: "reassignment",
    label: "Reassignment",
    description: "Ownership transfer requests waiting for your response.",
  },
] as const;

export type QueueFilter = (typeof queueFilters)[number]["id"];

export function filterQueueTasks({
  tasks,
  filter,
  activeUserEmail,
}: {
  tasks: ApprovalTask[];
  filter: QueueFilter;
  activeUserEmail: string;
}) {
  return tasks.filter((task) =>
    matchesQueueFilter({ task, filter, activeUserEmail }),
  );
}

export function getQueueFilterCounts({
  tasks,
  activeUserEmail,
}: {
  tasks: ApprovalTask[];
  activeUserEmail: string;
}) {
  return Object.fromEntries(
    queueFilters.map((filter) => [
      filter.id,
      filterQueueTasks({ tasks, filter: filter.id, activeUserEmail }).length,
    ]),
  ) as Record<QueueFilter, number>;
}

function matchesQueueFilter({
  task,
  filter,
  activeUserEmail,
}: {
  task: ApprovalTask;
  filter: QueueFilter;
  activeUserEmail: string;
}) {
  if (filter === "all") return true;
  if (filter === "attention") {
    return task.status === "overdue" || task.status === "escalated";
  }
  if (filter === "delegated") return task.status === "delegated";

  return Boolean(
    task.reassignmentRequests?.some(
      (request) =>
        request.status === "requested" &&
        emailsMatch(request.toEmail, activeUserEmail),
    ),
  );
}
