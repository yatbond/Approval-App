import type {
  WorkflowGraph,
  WorkflowNodeKind,
} from "./types.ts";
import {
  addWorkflowBranch,
  addWorkflowNode,
} from "./workflow-graph.ts";
import { formatNodeKind } from "./workflow-condition-context.ts";

type WorkflowCanvasEditState = {
  didUpdate: boolean;
  graph: WorkflowGraph;
  label: string;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  connectFromNodeId?: string | null;
};

export function getWorkflowCreateNodeState({
  graph,
  kind,
}: {
  graph: WorkflowGraph;
  kind: WorkflowNodeKind;
}): WorkflowCanvasEditState {
  const ownerBackedKind =
    kind === "approval" || kind === "review" || kind === "for_information";
  const nextGraph = addWorkflowNode(graph, kind, {
    blocking: kind !== "for_information" && kind !== "end",
    assigneeName: ownerBackedKind ? "New owner" : undefined,
    assigneeEmail: ownerBackedKind ? "owner@example.com" : undefined,
  });
  const created = nextGraph.nodes.at(-1);

  return {
    didUpdate: true,
    graph: nextGraph,
    label: `Added ${formatNodeKind(kind)} box`,
    selectedNodeId: created?.id || null,
    selectedEdgeId: null,
  };
}

export function getWorkflowConnectNodesState({
  graph,
  sourceId,
  targetId,
}: {
  graph: WorkflowGraph;
  sourceId: string;
  targetId: string;
}): WorkflowCanvasEditState {
  if (sourceId === targetId) {
    return {
      didUpdate: false,
      graph,
      label: "",
    };
  }

  const nextGraph = addWorkflowBranch(graph, {
    sourceId,
    targetId,
    branchType: "main",
    label: "Next",
    blocking: true,
  });
  const createdEdge = nextGraph.edges.at(-1);

  return {
    didUpdate: true,
    graph: nextGraph,
    label: "Connected workflow boxes",
    connectFromNodeId: null,
    selectedNodeId: null,
    selectedEdgeId: createdEdge?.id || null,
  };
}
