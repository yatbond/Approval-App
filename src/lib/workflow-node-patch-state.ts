import type {
  WorkflowGraph,
  WorkflowGraphNode,
} from "./types.ts";
import { updateWorkflowGraphNode } from "./workflow-graph.ts";

type WorkflowNodePatchState = {
  didUpdate: boolean;
  graph: WorkflowGraph;
  label: string;
};

export function getWorkflowMoveNodeState({
  graph,
  nodeId,
  x,
  y,
}: {
  graph: WorkflowGraph;
  nodeId: string;
  x: number;
  y: number;
}): WorkflowNodePatchState {
  return {
    didUpdate: true,
    graph: updateWorkflowGraphNode(graph, nodeId, { x, y }),
    label: "Moved workflow box",
  };
}

export function getWorkflowUpdateSelectedNodeState({
  graph,
  selectedNode,
  patch,
}: {
  graph: WorkflowGraph;
  selectedNode: WorkflowGraphNode | null;
  patch: Partial<WorkflowGraphNode>;
}): WorkflowNodePatchState {
  if (!selectedNode) {
    return {
      didUpdate: false,
      graph,
      label: "",
    };
  }

  return {
    didUpdate: true,
    graph: updateWorkflowGraphNode(graph, selectedNode.id, patch),
    label: `Updated ${selectedNode.label}`,
  };
}
