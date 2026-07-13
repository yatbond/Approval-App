import { buildWorkflowPathStages } from "./task-display.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";
import type { WorkflowTemplate } from "./types.ts";

export function buildRequestWorkflowMapState(
  template: WorkflowTemplate,
  requestedActiveNodeId = "",
) {
  const stages = buildWorkflowPathStages(createWorkflowGraphFromTemplate(template));
  const nodes = stages.flatMap((stage) => stage.nodes);
  const requestedNode = nodes.find((node) => node.id === requestedActiveNodeId);
  const defaultNode =
    nodes.find((node) => node.kind === "submit_request") ||
    nodes.find((node) => node.kind !== "end") ||
    nodes[0];

  return {
    stages,
    activeNodeId: requestedNode?.id || defaultNode?.id || "",
  };
}

export function getWorkflowMapNodeIdForParticipantField(fieldNodeId: string) {
  return fieldNodeId.replace(/:escalation$/, "");
}
