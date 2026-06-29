import type {
  ApprovalTask,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export type RejectReturnTargetOption = {
  id: string;
  label: string;
  nodeIds: string[];
  description: string;
};

type RejectReturnTask = Pick<
  ApprovalTask,
  "currentNodeId" | "requester" | "requesterEmail" | "completedNodeIds" | "nodeDecisions"
>;

export function getRejectReturnTargetOptions({
  task,
  template,
}: {
  task: RejectReturnTask;
  template?: WorkflowTemplate;
}): RejectReturnTargetOption[] {
  const originatorOption = {
    id: "originator",
    label: "Return to original submitter",
    nodeIds: [],
    description: task.requester || task.requesterEmail,
  };

  if (!template || !task.currentNodeId) {
    return [originatorOption];
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const currentNode = graph.nodes.find((node) => node.id === task.currentNodeId);
  if (!currentNode) {
    return [originatorOption];
  }

  const distanceByNodeId = getUpstreamDistanceByNodeId(graph, currentNode.id);
  const eligibleNodes = graph.nodes
    .filter((node) => isRejectReturnTargetNode(node))
    .filter((node) => distanceByNodeId.has(node.id))
    .filter((node) => wasNodeReached(task, node.id));
  const directUpstreamNodes = graph.edges
    .filter((edge) => edge.targetId === currentNode.id && edge.branchType !== "for_information")
    .map((edge) => eligibleNodes.find((node) => node.id === edge.sourceId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const stageOptions =
    directUpstreamNodes.length > 1
      ? [
          {
            id: `stage-${directUpstreamNodes.map((node) => node.id).join("-")}`,
            label: directUpstreamNodes.map((node) => node.label).join(" + "),
            nodeIds: directUpstreamNodes.map((node) => node.id),
            description: "Return to this parallel stage.",
          },
        ]
      : [];
  const individualOptions = [...eligibleNodes]
    .sort((left, right) => {
      const distanceDelta =
        (distanceByNodeId.get(left.id) || 0) - (distanceByNodeId.get(right.id) || 0);
      return distanceDelta || left.label.localeCompare(right.label);
    })
    .map((node) => ({
      id: `node-${node.id}`,
      label: node.label,
      nodeIds: [node.id],
      description: node.assigneeEmail || "",
    }));

  return [originatorOption, ...stageOptions, ...individualOptions];
}

function getUpstreamDistanceByNodeId(graph: WorkflowGraph, currentNodeId: string) {
  const distanceByNodeId = new Map<string, number>();
  const queue = [{ nodeId: currentNodeId, distance: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    graph.edges
      .filter(
        (edge) =>
          edge.targetId === current.nodeId && edge.branchType !== "for_information",
      )
      .forEach((edge) => {
        if (distanceByNodeId.has(edge.sourceId)) {
          return;
        }

        distanceByNodeId.set(edge.sourceId, current.distance + 1);
        queue.push({ nodeId: edge.sourceId, distance: current.distance + 1 });
      });
  }

  return distanceByNodeId;
}

function isRejectReturnTargetNode(node: WorkflowGraphNode) {
  return (
    (node.kind === "approval" || node.kind === "review") &&
    Boolean(node.assigneeEmail?.trim())
  );
}

function wasNodeReached(task: RejectReturnTask, nodeId: string) {
  return (
    Boolean(task.completedNodeIds?.includes(nodeId)) ||
    Boolean(task.nodeDecisions?.[nodeId])
  );
}
