import type { ApprovalTask, WorkflowGraphNode } from "./types.ts";

export type PathNodeState =
  | "approved"
  | "rejected"
  | "current"
  | "completed"
  | "notified"
  | "waiting";

export function getPathNodeState(
  task: ApprovalTask,
  node: WorkflowGraphNode,
): PathNodeState {
  if (task.nodeDecisions?.[node.id] === "approved") {
    return "approved";
  }

  if (task.nodeDecisions?.[node.id] === "rejected") {
    return "rejected";
  }

  if (task.pendingNodeIds?.includes(node.id)) {
    return "current";
  }

  if (task.currentNodeId === node.id || (!task.currentNodeId && task.currentStep === node.label)) {
    return "current";
  }

  if (task.completedNodeIds?.includes(node.id)) {
    return "completed";
  }

  if (task.notifiedNodeIds?.includes(node.id)) {
    return "notified";
  }

  return "waiting";
}

export function formatPathNodeState(state: PathNodeState | string) {
  if (state === "current") return "Current";
  if (state === "approved") return "Approved";
  if (state === "rejected") return "Rejected";
  if (state === "completed") return "Done";
  if (state === "notified") return "FYI";
  return "Waiting";
}

export function formatTaskAccessRole(task: ApprovalTask, activeUserEmail: string) {
  if (task.requesterEmail === activeUserEmail) {
    return "originator";
  }

  if (task.currentOwner === activeUserEmail) {
    return "current actor";
  }

  if (task.auditTrail.some((event) => event.actorEmail === activeUserEmail)) {
    return "previous actor";
  }

  return "participant";
}
