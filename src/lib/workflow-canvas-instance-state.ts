import type {
  ApprovalTask,
  WorkflowGraph,
} from "./types.ts";

export function getWorkflowCanvasInstanceKey({
  workflowId,
  resetNonce,
  graph,
  runtimeTask,
}: {
  workflowId: string;
  resetNonce: number;
  graph: WorkflowGraph;
  runtimeTask?: Pick<
    ApprovalTask,
    "id" | "currentNodeId" | "completedNodeIds" | "notifiedNodeIds"
  > | null;
}) {
  return `${workflowId || "empty"}:${JSON.stringify({
    reset: resetNonce,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      assigneeEmail: node.assigneeEmail,
      documentIds: node.documentIds,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label,
      branchType: edge.branchType,
    })),
    runtime: {
      taskId: runtimeTask?.id,
      currentNodeId: runtimeTask?.currentNodeId,
      completedNodeIds: runtimeTask?.completedNodeIds,
      notifiedNodeIds: runtimeTask?.notifiedNodeIds,
    },
  })}`;
}
