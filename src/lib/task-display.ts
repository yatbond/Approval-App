import type {
  AuditEvent,
  ApprovalTask,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";
import { emailsMatch } from "./approval-state.ts";

export type PathNodeState =
  | "approved"
  | "rejected"
  | "current"
  | "completed"
  | "notified"
  | "waiting";

export type PathNodeProgressTone =
  | "done"
  | "current"
  | "rejected"
  | "not-reached";

export type WorkflowPathStageNode = WorkflowGraphNode & {
  stageNumber: number;
  pathLabel: string;
  parallelIndex: number;
  parallelTotal: number;
};

export type WorkflowPathStage = {
  stageNumber: number;
  isParallel: boolean;
  nodes: WorkflowPathStageNode[];
};

export function buildWorkflowPathStages(graph: WorkflowGraph): WorkflowPathStage[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rawStageByNodeId = new Map<string, number>([["start", 0]]);

  for (let index = 0; index < graph.nodes.length; index += 1) {
    graph.edges.forEach((edge) => {
      const sourceStage = rawStageByNodeId.get(edge.sourceId);
      const targetNode = nodeById.get(edge.targetId);

      if (sourceStage === undefined || !targetNode || targetNode.kind === "start") {
        return;
      }

      const targetStage = sourceStage + 1;
      const existingStage = rawStageByNodeId.get(edge.targetId);
      if (existingStage === undefined || targetStage > existingStage) {
        rawStageByNodeId.set(edge.targetId, targetStage);
      }
    });
  }

  const displayNodes = graph.nodes.filter((node) => node.kind !== "start");
  const maxReachableStage = Math.max(
    0,
    ...Array.from(rawStageByNodeId.entries())
      .filter(([nodeId]) => nodeId !== "start")
      .map(([, stage]) => stage),
  );
  const rawStages = new Map<number, WorkflowGraphNode[]>();

  displayNodes.forEach((node) => {
    const rawStage = rawStageByNodeId.get(node.id) ?? maxReachableStage + 1;
    const nodes = rawStages.get(rawStage) || [];
    rawStages.set(rawStage, [...nodes, node]);
  });

  return Array.from(rawStages.entries())
    .sort(([stageA], [stageB]) => stageA - stageB)
    .map(([, nodes], stageIndex) => {
      const stageNumber = stageIndex + 1;
      const sortedNodes = [...nodes].sort(compareWorkflowPathNodes);
      const isParallel = sortedNodes.length > 1;

      return {
        stageNumber,
        isParallel,
        nodes: sortedNodes.map((node, nodeIndex) => ({
          ...node,
          stageNumber,
          pathLabel: isParallel
            ? `${stageNumber}${formatParallelSuffix(nodeIndex)}`
            : String(stageNumber),
          parallelIndex: nodeIndex + 1,
          parallelTotal: sortedNodes.length,
        })),
      };
    });
}

export function getPathNodeState(
  task: ApprovalTask,
  node: WorkflowGraphNode,
): PathNodeState {
  if (task.nodeDecisions?.[node.id] === "approved") {
    return "approved";
  }

  if (task.nodeDecisions?.[node.id] === "rejected") {
    return "rejected";
  }

  if (task.pendingNodeIds?.includes(node.id)) {
    return "current";
  }

  if (task.currentNodeId === node.id || (!task.currentNodeId && task.currentStep === node.label)) {
    return "current";
  }

  if (task.completedNodeIds?.includes(node.id)) {
    return "completed";
  }

  if (task.notifiedNodeIds?.includes(node.id)) {
    return "notified";
  }

  return "waiting";
}

export function getPathNodeHistoryEvents(
  task: ApprovalTask,
  node: WorkflowGraphNode,
  {
    isFirstPathNode = false,
    workflowNodes = [],
  }: { isFirstPathNode?: boolean; workflowNodes?: WorkflowGraphNode[] } = {},
): AuditEvent[] {
  return task.auditTrail.filter((event) =>
    isPathNodeHistoryEvent(event, node, isFirstPathNode, workflowNodes),
  );
}

export function formatPathNodeState(state: PathNodeState | string) {
  if (state === "current") return "Current";
  if (state === "approved") return "Approved";
  if (state === "rejected") return "Rejected";
  if (state === "completed") return "Done";
  if (state === "notified") return "FYI";
  return "Not reached";
}

export function getPathNodeProgressTone(
  state: PathNodeState,
): PathNodeProgressTone {
  if (state === "current") return "current";
  if (state === "rejected") return "rejected";
  if (state === "waiting") return "not-reached";
  return "done";
}

export function formatTaskAccessRole(task: ApprovalTask, activeUserEmail: string) {
  if (emailsMatch(task.requesterEmail, activeUserEmail)) {
    return "originator";
  }

  if (emailsMatch(task.currentOwner, activeUserEmail)) {
    return "current actor";
  }

  if (task.auditTrail.some((event) => emailsMatch(event.actorEmail, activeUserEmail))) {
    return "previous actor";
  }

  return "participant";
}

export function findTemplateForTask(
  task: ApprovalTask,
  templates: WorkflowTemplate[],
) {
  if (task.workflowTemplateSnapshot) {
    return task.workflowTemplateSnapshot;
  }

  return templates.find(
    (template) =>
      template.id === task.workflowTemplateId || template.name === task.workflow,
  );
}

function compareWorkflowPathNodes(a: WorkflowGraphNode, b: WorkflowGraphNode) {
  return a.y - b.y || a.x - b.x || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
}

function isPathNodeHistoryEvent(
  event: AuditEvent,
  node: WorkflowGraphNode,
  isFirstPathNode: boolean,
  workflowNodes: WorkflowGraphNode[],
) {
  if (
    isFirstPathNode &&
    ["submitted", "resubmitted", "amended"].includes(event.action)
  ) {
    return true;
  }

  const eventText = normalizeSearchText(`${event.detail} ${event.action}`);
  const nodeLabel = normalizeSearchText(node.label);
  const nodeId = normalizeSearchText(node.id);

  if (nodeLabel && eventText.includes(nodeLabel)) {
    return true;
  }

  if (nodeId && eventText.includes(nodeId)) {
    return true;
  }

  const explicitlyReferencedNode = workflowNodes.some((workflowNode) => {
    const label = normalizeSearchText(workflowNode.label);
    const id = normalizeSearchText(workflowNode.id);
    return (label && eventText.includes(label)) || (id && eventText.includes(id));
  });
  if (explicitlyReferencedNode) {
    return false;
  }

  const nodesWithTargetEmail = workflowNodes.filter((workflowNode) =>
    emailsMatch(workflowNode.assigneeEmail, event.targetEmail),
  );
  if (
    node.assigneeEmail &&
    emailsMatch(event.targetEmail, node.assigneeEmail) &&
    (!workflowNodes.length || nodesWithTargetEmail.length === 1)
  ) {
    return true;
  }

  return false;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatParallelSuffix(index: number) {
  let value = index + 1;
  let suffix = "";

  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(65 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }

  return suffix;
}
