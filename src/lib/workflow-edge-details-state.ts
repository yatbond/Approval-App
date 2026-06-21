import type {
  WorkflowField,
  WorkflowGraphEdge,
  WorkflowRuleOperator,
} from "./types.ts";

export function getWorkflowEdgeDetailsState({
  edge,
  workflowFields,
}: {
  edge: WorkflowGraphEdge;
  workflowFields: WorkflowField[];
}) {
  return {
    showsRuleBuilder: edge.branchType === "condition",
    showsForInformationNote: edge.branchType === "for_information",
    canBlockWorkflow: edge.branchType !== "for_information",
    blocksWorkflow: Boolean(edge.blocking),
    ruleFieldValue: edge.rule?.field || workflowFields[0]?.name || "",
    ruleOperatorValue: (edge.rule?.operator || "=") as WorkflowRuleOperator,
    ruleValue: edge.rule?.value || "",
  };
}
