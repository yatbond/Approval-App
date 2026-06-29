import type {
  ApprovalTask,
  WorkflowGraph,
} from "./types.ts";

export function getWorkflowCanvasInstanceKey({
  workflowId,
  resetNonce,
}: {
  workflowId: string;
  resetNonce: number;
  graph: WorkflowGraph;
  runtimeTask?: Pick<
    ApprovalTask,
    "id" | "currentNodeId" | "completedNodeIds" | "notifiedNodeIds"
  > | null;
}) {
  return `${workflowId || "empty"}:reset-${resetNonce}`;
}
