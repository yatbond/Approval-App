import type { WorkflowGraphNode } from "./types.ts";

type ToolbarNode = Pick<WorkflowGraphNode, "id" | "kind" | "label">;

export function getWorkflowCanvasToolbarState({
  connectFromNode,
  selectedNode,
  conditionOutcomeCaseId,
}: {
  connectFromNode?: ToolbarNode | null;
  selectedNode?: ToolbarNode | null;
  conditionOutcomeCaseId?: string | null;
}) {
  return {
    connectMessage: connectFromNode
      ? `Connecting from ${connectFromNode.label}. Click another box to create the branch.`
      : "",
    outcomeMessage:
      conditionOutcomeCaseId && selectedNode?.kind === "condition"
        ? `Assigning outcomes for ${selectedNode.label}. Click downstream boxes to add them to the selected condition case.`
        : "",
  };
}
