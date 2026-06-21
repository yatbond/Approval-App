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
  selectedNodeId,
}: {
  graph: WorkflowGraph;
  kind: WorkflowNodeKind;
  selectedNodeId?: string | null;
}): WorkflowCanvasEditState {
  const ownerBackedKind =
    kind === "approval" || kind === "review" || kind === "for_information";
  const position = getNewNodePosition(graph, selectedNodeId);
  const nextGraph = addWorkflowNode(graph, kind, {
    x: position.x,
    y: position.y,
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

function getNewNodePosition(graph: WorkflowGraph, selectedNodeId?: string | null) {
  const selectedNode = selectedNodeId
    ? graph.nodes.find((node) => node.id === selectedNodeId)
    : null;
  const rightmostNode = graph.nodes.reduce<(typeof graph.nodes)[number] | null>(
    (rightmost, node) => (!rightmost || node.x > rightmost.x ? node : rightmost),
    null,
  );
  const anchorNode = selectedNode || rightmostNode;
  const preferredPosition = anchorNode
    ? {
        x: anchorNode.x + 260,
        y: selectedNode ? anchorNode.y + 40 : anchorNode.y,
      }
    : { x: 240, y: 120 };

  return findOpenNodePosition(graph, preferredPosition);
}

function findOpenNodePosition(
  graph: WorkflowGraph,
  preferredPosition: { x: number; y: number },
) {
  let position = preferredPosition;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isNodePositionOccupied(graph, position)) {
      return position;
    }
    position = {
      x: preferredPosition.x + (attempt + 1) * 60,
      y: preferredPosition.y + (attempt + 1) * 80,
    };
  }

  return position;
}

function isNodePositionOccupied(
  graph: WorkflowGraph,
  position: { x: number; y: number },
) {
  return graph.nodes.some(
    (node) => Math.abs(node.x - position.x) < 220 && Math.abs(node.y - position.y) < 120,
  );
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
