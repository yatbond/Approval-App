import type { ApprovalTask } from "./types.ts";
import type { TaskNotification } from "./workflow-system.ts";

export async function persistWorkspaceCollaborationTransition({
  task,
  notifications,
}: {
  task: ApprovalTask;
  notifications: TaskNotification[];
}) {
  const response = await fetch("/api/workflow-collaboration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, notifications }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.reason || "Collaboration persistence failed.");
  }
}
