import type { WorkflowGraph } from "./types.ts";

export function getWorkflowCanvasSelectionState({
  graph,
  selectedNodeId,
  selectedEdgeId,
  connectFromNodeId,
  conditionOutcomeCaseId,
}: {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectFromNodeId: string | null;
  conditionOutcomeCaseId: string | null;
}) {
  const selectedGraphNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedGraphEdge =
    graph.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const connectFromNode =
    graph.nodes.find((node) => node.id === connectFromNodeId) || null;
  const conditionCase = conditionOutcomeCaseId
    ? selectedGraphNode?.conditionCases?.find(
        (item) => item.id === conditionOutcomeCaseId,
      )
    : null;

  return {
    selectedGraphNode,
    selectedGraphEdge,
    connectFromNode,
    activeOutcomeTargetIds: new Set(conditionCase?.targetNodeIds || []),
  };
}
