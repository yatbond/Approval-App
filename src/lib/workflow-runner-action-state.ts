import type {
  ApprovalAction,
  ApprovalActor,
  ApprovalTask,
} from "./types.ts";

export function getWorkflowRunnerActionActor({
  task,
  action,
  fallbackEmail,
}: {
  task: ApprovalTask;
  action: ApprovalAction;
  fallbackEmail: string;
}): ApprovalActor {
  const actorEmail =
    action === "amend_resubmit" || action === "cancel"
      ? task.requesterEmail
      : task.currentOwner || task.pendingOwners?.[0] || fallbackEmail;

  return {
    email: actorEmail,
    name: actorEmail === task.requesterEmail ? task.requester : actorEmail,
  };
}
