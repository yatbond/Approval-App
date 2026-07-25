import type {
  WorkflowField,
  WorkflowGraph,
  WorkflowGraphEdge,
} from "./types.ts";
import { updateWorkflowGraphEdge } from "./workflow-graph.ts";

type WorkflowEdgeUpdateState = {
  didUpdate: boolean;
  graph: WorkflowGraph;
  label: string;
};

export function getWorkflowUpdateSelectedEdgeState({
  graph,
  selectedEdge,
  patch,
}: {
  graph: WorkflowGraph;
  selectedEdge: WorkflowGraphEdge | null;
  patch: Partial<WorkflowGraphEdge>;
}): WorkflowEdgeUpdateState {
  if (!selectedEdge) {
    return { didUpdate: false, graph, label: "" };
  }

  const nextPatch =
    patch.branchType === "for_information"
      ? { ...patch, blocking: false, label: patch.label || "FYI" }
      : patch;

  return {
    didUpdate: true,
    graph: updateWorkflowGraphEdge(graph, selectedEdge.id, nextPatch),
    label: `Updated ${selectedEdge.label} branch`,
  };
}

export function getWorkflowUpdateSelectedEdgeRuleState({
  graph,
  selectedEdge,
  workflowFields,
  key,
  value,
}: {
  graph: WorkflowGraph;
  selectedEdge: WorkflowGraphEdge | null;
  workflowFields: WorkflowField[];
  key: "field" | "operator" | "value";
  value: string;
}): WorkflowEdgeUpdateState {
  if (!selectedEdge) {
    return { didUpdate: false, graph, label: "" };
  }

  return getWorkflowUpdateSelectedEdgeState({
    graph,
    selectedEdge,
    patch: {
      rule: {
        field: selectedEdge.rule?.field || workflowFields[0]?.name || "",
        operator: selectedEdge.rule?.operator || "=",
        value: selectedEdge.rule?.value || "",
        [key]: value,
      },
    },
  });
}
