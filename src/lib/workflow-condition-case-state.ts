import type { WorkflowConditionCase, WorkflowGraph } from "./types.ts";
import {
  addWorkflowConditionCase,
  deleteWorkflowConditionCase,
  updateWorkflowConditionCase,
  updateWorkflowGraphNode,
} from "./workflow-graph.ts";

type UpdateConditionCaseInput = Partial<
  Pick<
    WorkflowConditionCase,
    | "name"
    | "isFallback"
    | "isApprovalCount"
    | "approvalRule"
    | "numericRule"
    | "join"
    | "targetNodeIds"
  >
>;

type WorkflowConditionCaseStateInput = {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
};

type WorkflowConditionCaseState = {
  didUpdate: boolean;
  graph: WorkflowGraph;
  label: string;
};

type WorkflowDeleteConditionCaseState = WorkflowConditionCaseState & {
  activeOutcomeCaseId: string | null;
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
  fallbackCaseId?: string;
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
          id: fallbackCaseId ?? `case-${Date.now()}-fallback`,
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

export function getWorkflowUpdateConditionCaseState({
  graph,
  selectedNodeId,
  caseId,
  patch,
}: WorkflowConditionCaseStateInput & {
  caseId: string;
  patch: UpdateConditionCaseInput;
}): WorkflowConditionCaseState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (!selectedNode || selectedNode.kind !== "condition") {
    return { didUpdate: false, graph, label: "" };
  }

  return {
    didUpdate: true,
    graph: updateWorkflowConditionCase(graph, selectedNode.id, caseId, patch),
    label: "Updated condition",
  };
}

export function getWorkflowDeleteConditionCaseState({
  graph,
  selectedNodeId,
  caseId,
  activeOutcomeCaseId,
}: WorkflowConditionCaseStateInput & {
  caseId: string;
  activeOutcomeCaseId: string | null;
}): WorkflowDeleteConditionCaseState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (!selectedNode || selectedNode.kind !== "condition") {
    return { didUpdate: false, graph, label: "", activeOutcomeCaseId };
  }

  return {
    didUpdate: true,
    graph: deleteWorkflowConditionCase(graph, selectedNode.id, caseId),
    label: "Deleted condition",
    activeOutcomeCaseId:
      activeOutcomeCaseId === caseId ? null : activeOutcomeCaseId,
  };
}

export function getWorkflowAddOutcomeTargetState({
  graph,
  selectedNodeId,
  activeOutcomeCaseId,
  targetNodeId,
}: WorkflowConditionCaseStateInput & {
  activeOutcomeCaseId: string | null;
  targetNodeId: string;
}): WorkflowConditionCaseState {
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) || null;
  if (
    !selectedNode ||
    selectedNode.kind !== "condition" ||
    !activeOutcomeCaseId ||
    targetNodeId === selectedNode.id ||
    targetNodeId === "start"
  ) {
    return { didUpdate: false, graph, label: "" };
  }

  const conditionCase = selectedNode.conditionCases?.find(
    (item) => item.id === activeOutcomeCaseId,
  );
  if (!conditionCase) {
    return { didUpdate: false, graph, label: "" };
  }

  return {
    didUpdate: true,
    graph: updateWorkflowConditionCase(graph, selectedNode.id, activeOutcomeCaseId, {
      targetNodeIds: Array.from(
        new Set([...conditionCase.targetNodeIds, targetNodeId]),
      ),
    }),
    label: "Updated condition",
  };
}
