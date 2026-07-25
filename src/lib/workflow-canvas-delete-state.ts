import type { WorkflowGraph } from "./types.ts";
import {
  deleteWorkflowBranch,
  deleteWorkflowNode,
} from "./workflow-graph.ts";

type WorkflowCanvasDeleteStateInput = {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectFromNodeId: string | null;
};

type WorkflowCanvasDeleteState = {
  didDelete: boolean;
  graph: WorkflowGraph;
  label: string;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectFromNodeId: string | null;
};

export function getWorkflowCanvasDeleteState({
  graph,
  selectedNodeId,
  selectedEdgeId,
  connectFromNodeId,
}: WorkflowCanvasDeleteStateInput): WorkflowCanvasDeleteState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (selectedNode && selectedNode.id !== "start" && selectedNode.id !== "end") {
    return {
      didDelete: true,
      graph: deleteWorkflowNode(graph, selectedNode.id),
      label: `Deleted ${selectedNode.label}`,
      selectedNodeId: null,
      selectedEdgeId,
      connectFromNodeId:
        connectFromNodeId === selectedNode.id ? null : connectFromNodeId,
    };
  }

  const selectedEdge =
    graph.edges.find((edge) => edge.id === selectedEdgeId) || null;
  if (selectedEdge) {
    return {
      didDelete: true,
      graph: deleteWorkflowBranch(graph, selectedEdge.id),
      label: `Deleted ${selectedEdge.label} branch`,
      selectedNodeId,
      selectedEdgeId: null,
      connectFromNodeId,
    };
  }

  return {
    didDelete: false,
    graph,
    label: "",
    selectedNodeId,
    selectedEdgeId,
    connectFromNodeId,
  };
}
