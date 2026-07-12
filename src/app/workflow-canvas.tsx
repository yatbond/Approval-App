"use client";

import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type OnNodeDrag,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import type {
  ApprovalTask,
  WorkflowBranchType,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
} from "@/lib/types";

type WorkflowNodeRuntimeStatus = "current" | "completed" | "notified";

type WorkflowCanvasProps = {
  graph: WorkflowGraph;
  runtimeTask?: ApprovalTask;
  highlightedNodeIds: string[];
  selectedEdgeId?: string | null;
  canvasInstanceKey: string;
  connectFromNodeId?: string | null;
  onConnect: (sourceId: string, targetId: string) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onClearSelection: () => void;
  onOutcomeTargetClick: (targetNodeId: string) => boolean;
};

const workflowNodeOptions: { kind: WorkflowNodeKind; label: string }[] = [
  { kind: "submit_request", label: "Submit" },
  { kind: "approval", label: "Approval" },
  { kind: "review", label: "Review" },
  { kind: "for_information", label: "FYI" },
  { kind: "condition", label: "Condition" },
  { kind: "end", label: "End" },
];

const branchTypeOptions: { value: WorkflowBranchType; label: string }[] = [
  { value: "main", label: "Main" },
  { value: "approved", label: "Approved" },
  { value: "condition", label: "Condition" },
  { value: "for_information", label: "FYI" },
];

export default function WorkflowCanvas({
  graph,
  runtimeTask,
  highlightedNodeIds,
  selectedEdgeId,
  canvasInstanceKey,
  connectFromNodeId,
  onConnect,
  onMoveNode,
  onNodeSelect,
  onEdgeSelect,
  onClearSelection,
  onOutcomeTargetClick,
}: WorkflowCanvasProps) {
  const highlightedNodes = useMemo(
    () => new Set(highlightedNodeIds),
    [highlightedNodeIds],
  );
  const flowNodes = useMemo(
    () => toFlowNodes(graph, runtimeTask, highlightedNodes),
    [graph, highlightedNodes, runtimeTask],
  );
  const flowEdges = useMemo(
    () => toFlowEdges(graph, selectedEdgeId),
    [graph, selectedEdgeId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const commitCanvasNode: OnNodeDrag = (_, node) => {
    onMoveNode(node.id, node.position.x, node.position.y);
  };

  function connectCanvasNodes(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }

    onConnect(connection.source, connection.target);
  }

  return (
    <div className="h-[68vh] min-h-[420px] min-w-0 overflow-hidden rounded-md border border-[#e6e6e6] bg-[#f7f7f5] lg:h-[calc(100vh-250px)] lg:min-h-[640px]">
      <ReactFlow
        key={canvasInstanceKey}
        nodes={nodes}
        edges={edges}
        className="h-full w-full"
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connectCanvasNodes}
        onNodeDragStop={commitCanvasNode}
        autoPanOnNodeDrag={false}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        onNodeClick={(_, node) => {
          if (onOutcomeTargetClick(node.id)) {
            return;
          }

          if (connectFromNodeId && connectFromNodeId !== node.id) {
            onConnect(connectFromNodeId, node.id);
            return;
          }

          onNodeSelect(node.id);
        }}
        onEdgeClick={(_, edge) => onEdgeSelect(edge.id)}
        onPaneClick={onClearSelection}
        colorMode="light"
      >
        <Background color="#d9d9d9" gap={18} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

function toFlowNodes(
  graph: WorkflowGraph,
  runtimeTask?: ApprovalTask,
  highlightedNodeIds: Set<string> = new Set(),
): FlowNode[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    position: { x: node.x, y: node.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: (
        <div className="min-w-32">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-semibold">
              {node.label}
            </p>
            {getNodeRuntimeStatus(node, runtimeTask) && (
              <span className="shrink-0 rounded border border-[#d9d9d9] bg-[#f2f2f2] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal">
                {formatRuntimeStatus(getNodeRuntimeStatus(node, runtimeTask))}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs uppercase tracking-normal text-neutral-500">
            {formatNodeKind(node.kind)}
          </p>
          {node.assigneeEmail && (
            <p className="mt-1 max-w-44 truncate text-xs text-neutral-400">
              {node.assigneeEmail}
            </p>
          )}
        </div>
      ),
    },
    style: getWorkflowNodeStyle(
      node,
      getNodeRuntimeStatus(node, runtimeTask),
      highlightedNodeIds.has(node.id),
    ),
  }));
}

function toFlowEdges(graph: WorkflowGraph, selectedEdgeId?: string | null): FlowEdge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    label: formatBranchLabel(edge, graph),
    animated: edge.branchType === "for_information",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke:
        selectedEdgeId === edge.id
          ? "#231f20"
          : edge.branchType === "for_information"
            ? "#7b791c"
            : edge.branchType === "condition"
              ? "#f7941d"
              : "#7b791c",
      strokeWidth: selectedEdgeId === edge.id ? 4 : 2,
    },
    labelStyle: { fill: "#231f20", fontSize: 12 },
    labelBgStyle: { fill: "#ffffff", fillOpacity: 0.96 },
  }));
}

function getNodeRuntimeStatus(
  node: WorkflowGraphNode,
  task?: ApprovalTask,
): WorkflowNodeRuntimeStatus | undefined {
  if (!task) {
    return undefined;
  }

  if (task.currentNodeId === node.id) {
    return "current";
  }

  if (task.completedNodeIds?.includes(node.id)) {
    return "completed";
  }

  if (task.notifiedNodeIds?.includes(node.id)) {
    return "notified";
  }

  return undefined;
}

function formatRuntimeStatus(status?: WorkflowNodeRuntimeStatus) {
  if (status === "current") {
    return "Current";
  }

  if (status === "completed") {
    return "Completed";
  }

  if (status === "notified") {
    return "FYI sent";
  }

  return "";
}

function formatBranchLabel(edge: WorkflowGraphEdge, graph?: WorkflowGraph) {
  const sourceNode = graph?.nodes.find((node) => node.id === edge.sourceId);
  if (sourceNode?.kind === "condition") {
    const conditionCases = sourceNode.conditionCases || [];
    const matchingCases = conditionCases.filter((conditionCase) =>
      conditionCase.targetNodeIds.includes(edge.targetId),
    );
    if (matchingCases.length) {
      return matchingCases
        .map((conditionCase) =>
          conditionCase.isFallback
            ? "Fallback"
            : conditionCase.name.trim() || "Condition",
        )
        .join(" / ");
    }
  }

  const type =
    branchTypeOptions.find((option) => option.value === edge.branchType)?.label ||
    edge.branchType;
  if (edge.branchType === "condition" && edge.rule) {
    return `${type}: ${edge.rule.field} ${edge.rule.operator} ${edge.rule.value}`;
  }

  return edge.label === "Next" ? type : `${type}: ${edge.label}`;
}

function getWorkflowNodeStyle(
  node: WorkflowGraphNode,
  status?: WorkflowNodeRuntimeStatus,
  highlighted = false,
): React.CSSProperties {
  const palette: Record<WorkflowNodeKind, { bg: string; border: string; color: string }> = {
    start: { bg: "#f2f2f2", border: "#8a8a8a", color: "#231f20" },
    submit_request: { bg: "#ffffff", border: "#f7941d", color: "#231f20" },
    approval: { bg: "#ffffff", border: "#7b791c", color: "#231f20" },
    review: { bg: "#ffffff", border: "#7b791c", color: "#231f20" },
    for_information: { bg: "#f7f7f5", border: "#7b791c", color: "#231f20" },
    condition: { bg: "#fff8ef", border: "#f7941d", color: "#231f20" },
    return_reject: { bg: "#fff7f7", border: "#be4455", color: "#5c1721" },
    end: { bg: "#f2f2f2", border: "#8a8a8a", color: "#231f20" },
  };
  const tone = palette[node.kind];
  const statusBorder =
    highlighted
      ? "#231f20"
      : status === "current"
        ? "#f7941d"
        : status === "completed"
          ? "#7b791c"
          : status === "notified"
            ? "#7b791c"
            : tone.border;

  return {
    background: tone.bg,
    border: `2px solid ${statusBorder}`,
    color: tone.color,
    borderRadius: 6,
    padding: 12,
    width: 190,
    boxShadow: highlighted
      ? "0 0 0 3px rgba(35, 31, 32, 0.12), 0 4px 12px rgba(35,31,32,0.10)"
      : status === "current"
        ? "0 0 0 3px rgba(247, 148, 29, 0.14), 0 4px 12px rgba(35,31,32,0.10)"
        : "0 4px 12px rgba(35,31,32,0.10)",
  };
}

function formatNodeKind(kind: WorkflowNodeKind) {
  if (kind === "return_reject") {
    return "Return/Reject";
  }

  return workflowNodeOptions.find((option) => option.kind === kind)?.label || "Start";
}
