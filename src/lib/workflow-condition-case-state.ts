import type { WorkflowGraph } from "./types.ts";
import {
  addWorkflowConditionCase,
  updateWorkflowGraphNode,
} from "./workflow-graph.ts";

type WorkflowConditionCaseStateInput = {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
};

type WorkflowConditionCaseState = {
  didUpdate: boolean;
  graph: WorkflowGraph;
  label: string;
};

export function getWorkflowAddConditionCaseState({
  graph,
  selectedNodeId,
  upstreamNodeIds,
}: WorkflowConditionCaseStateInput & {
  upstreamNodeIds: string[];
}): WorkflowConditionCaseState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (!selectedNode || selectedNode.kind !== "condition") {
    return { didUpdate: false, graph, label: "" };
  }

  return {
    didUpdate: true,
    graph: addWorkflowConditionCase(graph, selectedNode.id, upstreamNodeIds),
    label: "Added condition",
  };
}

export function getWorkflowAddFallbackConditionCaseState({
  graph,
  selectedNodeId,
  fallbackCaseId,
}: WorkflowConditionCaseStateInput & {
  fallbackCaseId: string;
}): WorkflowConditionCaseState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (!selectedNode || selectedNode.kind !== "condition") {
    return { didUpdate: false, graph, label: "" };
  }

  const existingCases = selectedNode.conditionCases || [];
  if (existingCases.some((conditionCase) => conditionCase.isFallback)) {
    return { didUpdate: false, graph, label: "" };
  }

  return {
    didUpdate: true,
    graph: updateWorkflowGraphNode(graph, selectedNode.id, {
      conditionCases: [
        ...existingCases,
        {
          id: fallbackCaseId,
          name: "All other conditions",
          isFallback: true,
          join: "and",
          targetNodeIds: [],
        },
      ],
    }),
    label: "Added all other outcome",
  };
}
