import type {
  ApprovalAction,
  ApprovalActor,
  ApprovalTask,
  AuditEvent,
  TaskReassignmentRequest,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "@/lib/types";
import { createWorkflowGraphFromTemplate, findInitialWorkflowRoute } from "./workflow-graph.ts";

const closedStatuses = new Set<ApprovalTask["status"]>(["approved", "cancelled"]);

export type TaskActionInput = {
  action: ApprovalAction;
  actor: ApprovalActor;
  comment?: string;
  targetEmail?: string;
  template?: WorkflowTemplate;
  returnTargetNodeIds?: string[];
};

export function isActionableBy(task: ApprovalTask, userEmail: string) {
  return (
    (task.currentOwner === userEmail ||
      Boolean(task.pendingOwners?.includes(userEmail)) ||
      Boolean(getPendingReassignmentRequest(task, userEmail))) &&
    !closedStatuses.has(task.status)
  );
}

export function isVisibleToParticipant(task: ApprovalTask, userEmail: string) {
  return task.participants.includes(userEmail);
}

export function getPendingReassignmentRequest(
  task: ApprovalTask,
  userEmail: string,
) {
  return task.reassignmentRequests?.find(
    (request) => request.toEmail === userEmail && request.status === "requested",
  );
}

export function applyTaskAction(
  task: ApprovalTask,
  input: TaskActionInput,
): ApprovalTask {
  const comment = input.comment?.trim();
  const targetEmail = input.targetEmail?.trim();
  const participants = addParticipants(task.participants, [
    input.actor.email,
    targetEmail,
    task.requesterEmail,
  ]);
  const eventBase = {
    actor: input.actor.name,
    actorEmail: input.actor.email,
    timestamp: formatTimestamp(new Date()),
    targetEmail,
  };

  if (input.action === "approve" || input.action === "approve_with_comment") {
    const actionTask = taskForActorNode(task, input.actor.email, input.template);
    const routed = routeAfterApproval(actionTask, input.template);
    const approvedEvent = {
      ...eventBase,
      action: "approved" as const,
      detail: joinDetail(routed.detail, comment),
    };
    const assignedEvent = routed.assignedEvent
      ? {
          actor: "System",
          actorEmail: "system@example.com",
          timestamp: eventBase.timestamp,
          action: "assigned" as const,
          targetEmail: routed.task.currentOwner,
          detail: routed.assignedEvent,
        }
      : undefined;

    return appendEvents(
      {
        ...routed.task,
        participants: addParticipants(routed.task.participants, participants),
        lastAction: `Approved by ${input.actor.name}`,
      },
      assignedEvent ? [approvedEvent, assignedEvent] : [approvedEvent],
    );
  }

  if (input.action === "reject" || input.action === "reject_with_comment") {
    const actionTask = taskForActorNode(task, input.actor.email, input.template);
    const rejectedRoute = routeAfterRejection(
      actionTask,
      input.template,
      input.returnTargetNodeIds,
    );
    if (rejectedRoute) {
      const rejectedEvent = {
        ...eventBase,
        action: "rejected" as const,
        detail: joinDetail(rejectedRoute.detail, comment),
      };
      const assignedEvent = rejectedRoute.assignedEvent
        ? {
            actor: "System",
            actorEmail: "system@example.com",
            timestamp: eventBase.timestamp,
            action: "assigned" as const,
            targetEmail: rejectedRoute.task.currentOwner,
            detail: rejectedRoute.assignedEvent,
          }
        : undefined;

      return appendEvents(
        {
          ...rejectedRoute.task,
          participants: addParticipants(rejectedRoute.task.participants, participants),
          lastAction: `Rejected by ${input.actor.name}`,
        },
        assignedEvent ? [rejectedEvent, assignedEvent] : [rejectedEvent],
      );
    }

    return appendEvent(
      {
        ...actionTask,
        status: "returned",
        currentOwner: actionTask.requesterEmail,
        currentStep: "Originator action required",
        pendingNodeIds: [],
        pendingOwners: [],
        nodeDecisions: actionTask.currentNodeId
          ? recordNodeDecision(actionTask.nodeDecisions, actionTask.currentNodeId, "rejected")
          : actionTask.nodeDecisions,
        participants,
        lastAction: `Rejected by ${input.actor.name}`,
      },
      {
        ...eventBase,
        action: "rejected",
        targetEmail: actionTask.requesterEmail,
        detail: joinDetail("Rejected and returned to the originator.", comment),
      },
    );
  }

  if (input.action === "reassign") {
    const reassigneeEmail = requireTargetEmail(targetEmail, "Reassign");
    const request: TaskReassignmentRequest = {
      id: `${task.id}-reassignment-${(task.reassignmentRequests || []).length + 1}`,
      fromEmail: input.actor.email,
      toEmail: reassigneeEmail,
      status: "requested",
      requestedAt: eventBase.timestamp,
    };

    return appendEvent(
      {
        ...task,
        status: "pending",
        participants,
        reassignmentRequests: [...(task.reassignmentRequests || []), request],
        lastAction: `Reassignment requested to ${reassigneeEmail}`,
      },
      {
        ...eventBase,
        action: "reassigned",
        detail: joinDetail(`Reassignment requested to ${reassigneeEmail}.`, comment),
      },
    );
  }

  if (input.action === "accept_reassignment") {
    const reassignmentRequest = getPendingReassignmentRequest(task, input.actor.email);
    if (!reassignmentRequest) {
      return task;
    }

    return appendEvent(
      {
        ...task,
        status: "reassigned",
        currentOwner: input.actor.email,
        pendingOwners: replacePendingOwnerOrDefault(
          task.pendingOwners,
          reassignmentRequest.fromEmail,
          input.actor.email,
        ),
        participants: transferReassignmentParticipants({
          participants: task.participants,
          fromEmail: reassignmentRequest.fromEmail,
          toEmail: input.actor.email,
          requesterEmail: task.requesterEmail,
        }),
        reassignmentRequests: updateReassignmentRequest(
          task.reassignmentRequests,
          reassignmentRequest.id,
          {
            status: "accepted",
            decidedAt: eventBase.timestamp,
            decisionNote: comment,
          },
        ),
        lastAction: `Reassignment accepted by ${input.actor.name}`,
      },
      {
        ...eventBase,
        action: "reassigned",
        targetEmail: input.actor.email,
        detail: joinDetail(
          `Accepted reassignment from ${reassignmentRequest.fromEmail}.`,
          comment,
        ),
      },
    );
  }

  if (input.action === "decline_reassignment") {
    const reassignmentRequest = getPendingReassignmentRequest(task, input.actor.email);
    if (!reassignmentRequest) {
      return task;
    }

    return appendEvent(
      {
        ...task,
        status: "pending",
        participants: removeReassignmentCandidateParticipant(task, input.actor.email),
        reassignmentRequests: updateReassignmentRequest(
          task.reassignmentRequests,
          reassignmentRequest.id,
          {
            status: "declined",
            decidedAt: eventBase.timestamp,
            decisionNote: comment,
          },
        ),
        lastAction: `Reassignment declined by ${input.actor.name}`,
      },
      {
        ...eventBase,
        action: "reassigned",
        targetEmail: input.actor.email,
        detail: joinDetail(
          `Declined reassignment from ${reassignmentRequest.fromEmail}.`,
          comment,
        ),
      },
    );
  }

  if (input.action === "delegate") {
    const delegateEmail = requireTargetEmail(targetEmail, "Delegate");
    return appendEvent(
      {
        ...task,
        status: "delegated",
        currentOwner: task.currentOwner,
        pendingOwners: delegatePendingOwners(task, input.actor.email, delegateEmail),
        participants,
        lastAction: `Delegated to ${delegateEmail}`,
      },
      {
        ...eventBase,
        action: "delegated",
        detail: joinDetail(`Delegated to ${delegateEmail}.`, comment),
      },
    );
  }

  if (input.action === "amend_resubmit") {
    const routed = routeFromStart(task, input.template);
    const resubmittedEvent = {
      ...eventBase,
      action: "resubmitted" as const,
      detail: joinDetail(routed.detail, comment),
    };
    const assignedEvent = routed.assignedEvent
      ? {
          actor: "System",
          actorEmail: "system@example.com",
          timestamp: eventBase.timestamp,
          action: "assigned" as const,
          targetEmail: routed.task.currentOwner,
          detail: routed.assignedEvent,
        }
      : undefined;

    return appendEvents(
      {
        ...routed.task,
        participants: addParticipants(routed.task.participants, participants),
        lastAction: `Amended and resubmitted by ${input.actor.name}`,
      },
      assignedEvent ? [resubmittedEvent, assignedEvent] : [resubmittedEvent],
    );
  }

  if (input.action === "cancel") {
    return appendEvent(
      {
        ...task,
        status: "cancelled",
        currentOwner: "",
        currentStep: "Cancelled",
        participants,
        lastAction: `Cancelled by ${input.actor.name}`,
      },
      {
        ...eventBase,
        action: "cancelled",
        detail: joinDetail("Cancelled by the originator.", comment),
      },
    );
  }

  return task;
}

function routeAfterRejection(
  task: ApprovalTask,
  template?: WorkflowTemplate,
  returnTargetNodeIds: string[] = [],
) {
  if (!template || !task.currentNodeId) {
    return null;
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const nodeDecisions = recordNodeDecision(
    task.nodeDecisions,
    task.currentNodeId,
    "rejected",
  );
  const targetedReturn = routeRejectionToSelectedTargets({
    task,
    graph,
    currentNodeId: task.currentNodeId,
    returnTargetNodeIds,
    nodeDecisions,
  });
  if (targetedReturn) {
    return targetedReturn;
  }

  const rejectedEdge = graph.edges.find(
    (edge) => edge.sourceId === task.currentNodeId && edge.branchType === "rejected",
  );

  if (!rejectedEdge) {
    return null;
  }

  const completedNodeIds = addUnique(task.completedNodeIds || [], task.currentNodeId);
  const remainingPendingNodeIds = (task.pendingNodeIds || []).filter(
    (nodeId) => nodeId !== task.currentNodeId,
  );
  const route = findNextActionableRoute(
    graph,
    task.currentNodeId,
    task.extractedFields,
    completedNodeIds,
    nodeDecisions,
    "rejected",
  );
  const notifiedNodeIds = addUnique(
    task.notifiedNodeIds || [],
    ...route.notifiedNodes.map((node) => node.id),
  );
  const notifiedEmails = route.notifiedNodes.map((node) => node.assigneeEmail);

  if (remainingPendingNodeIds.length && !routeMatchedConditionCase(route.activeBranchId)) {
    return {
      task: buildParallelWaitTask({
        task,
        graph,
        remainingPendingNodeIds,
        completedNodeIds,
        notifiedNodeIds,
        nodeDecisions,
        notifiedEmails,
      }),
      detail: "Rejected; waiting for other parallel approvers before routing.",
      assignedEvent: undefined,
    };
  }

  if (!route.currentNode) {
    return {
      task: {
        ...task,
        status: "returned" as const,
        currentOwner: task.requesterEmail,
        currentStep: "Originator action required",
        currentNodeId: undefined,
        pendingNodeIds: [],
        pendingOwners: [],
        completedNodeIds,
        notifiedNodeIds,
        nodeDecisions,
        participants: addParticipants(task.participants, notifiedEmails),
        activeBranchId: rejectedEdge.id,
      },
      detail: "Rejected and returned to the originator.",
      assignedEvent: undefined,
    };
  }

  if (route.currentNode.kind === "return_reject") {
    return {
      task: {
        ...task,
        status: "returned" as const,
        currentOwner: task.requesterEmail,
        currentStep: "Originator action required",
        currentNodeId: route.currentNode.id,
        pendingNodeIds: [],
        pendingOwners: [],
        completedNodeIds,
        notifiedNodeIds,
        nodeDecisions,
        participants: addParticipants(task.participants, notifiedEmails),
        activeBranchId: route.activeBranchId || rejectedEdge.id,
      },
      detail: `Rejected and routed to ${route.currentNode.label}.`,
      assignedEvent: `Returned to ${task.requester} for amendment or cancellation.`,
    };
  }

  const currentNodes = route.currentNodes.length ? route.currentNodes : [route.currentNode];
  const currentOwners = uniqueNodeEmails(currentNodes);
  const nextDue = dueForNode(route.currentNode);
  const routedNodeDecisions = removeNodeDecisions(
    nodeDecisions,
    currentNodes.map((node) => node.id),
  );
  return {
    task: {
      ...task,
      status: "pending" as const,
      currentOwner: currentOwners[0] || route.currentNode.assigneeEmail || task.requesterEmail,
      currentStep: route.currentNode.label,
      currentNodeId: route.currentNode.id,
      pendingNodeIds: currentNodes.map((node) => node.id),
      pendingOwners: currentOwners,
      due: nextDue.label,
      dueAt: nextDue.iso,
      completedNodeIds,
      notifiedNodeIds,
      nodeDecisions: routedNodeDecisions,
      participants: addParticipants(task.participants, [
        ...currentOwners,
        ...currentNodes.map((node) => node.escalationEmail),
        ...notifiedEmails,
      ]),
      activeBranchId: route.activeBranchId || rejectedEdge.id,
    },
    detail: `Rejected and sent to ${route.currentNode.label}.`,
    assignedEvent: `Assigned to ${route.currentNode.assigneeName || route.currentNode.assigneeEmail} for ${route.currentNode.label}.`,
  };
}

function routeRejectionToSelectedTargets({
  task,
  graph,
  currentNodeId,
  returnTargetNodeIds,
  nodeDecisions,
}: {
  task: ApprovalTask;
  graph: WorkflowGraph;
  currentNodeId: string;
  returnTargetNodeIds: string[];
  nodeDecisions: ApprovalTask["nodeDecisions"];
}) {
  if (!returnTargetNodeIds.length) {
    return null;
  }

  const upstreamNodeIds = getUpstreamNodeIds(graph, currentNodeId);
  const targetNodes = returnTargetNodeIds
    .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
    .filter((node): node is WorkflowGraphNode => Boolean(node))
    .filter((node) => upstreamNodeIds.has(node.id))
    .filter(isActionableRouteNode);

  if (!targetNodes.length) {
    return null;
  }

  const resetNodeIds = getDownstreamNodeIds(graph, targetNodes.map((node) => node.id));
  const targetOwners = uniqueNodeEmails(targetNodes);
  const currentNode = targetNodes[0];
  const due = dueForNode(currentNode);
  const resetNodeDecisions = removeNodeDecisions(nodeDecisions, [
    ...Array.from(resetNodeIds).filter((nodeId) => nodeId !== currentNodeId),
    ...targetNodes.map((node) => node.id),
  ]);
  const targetLabel = targetNodes.map((node) => node.label).join(" + ");

  return {
    task: {
      ...task,
      status: "pending" as const,
      currentOwner: targetOwners[0] || task.requesterEmail,
      currentStep:
        targetNodes.length > 1
          ? `${currentNode.label} (${targetNodes.length} pending)`
          : currentNode.label,
      currentNodeId: currentNode.id,
      pendingNodeIds: targetNodes.map((node) => node.id),
      pendingOwners: targetOwners,
      due: due.label,
      dueAt: due.iso,
      completedNodeIds: (task.completedNodeIds || []).filter(
        (nodeId) => !resetNodeIds.has(nodeId),
      ),
      notifiedNodeIds: (task.notifiedNodeIds || []).filter(
        (nodeId) => !resetNodeIds.has(nodeId),
      ),
      nodeDecisions: resetNodeDecisions,
      participants: addParticipants(task.participants, [
        ...targetOwners,
        ...targetNodes.map((node) => node.escalationEmail),
      ]),
      activeBranchId: `return-${currentNodeId}-${targetNodes.map((node) => node.id).join("-")}`,
    },
    detail: `Rejected. Returned to ${targetLabel}.`,
    assignedEvent:
      targetNodes.length > 1
        ? `Returned to ${targetNodes.length} upstream owner(s): ${targetOwners.join(", ")}.`
        : `Returned to ${currentNode.assigneeName || currentNode.assigneeEmail} for ${currentNode.label}.`,
  };
}

function routeAfterApproval(task: ApprovalTask, template?: WorkflowTemplate) {
  if (!template || !task.currentNodeId) {
    return {
      task: {
        ...task,
        status: "pending" as const,
        currentOwner: "next.approver@example.com",
        currentStep: "Next approver review",
      },
      detail: "Approved and sent to the next approver.",
      assignedEvent: "Assigned to next.approver@example.com for Next approver review.",
    };
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const completedNodeIds = addUnique(task.completedNodeIds || [], task.currentNodeId);
  const remainingPendingNodeIds = (task.pendingNodeIds || []).filter(
    (nodeId) => nodeId !== task.currentNodeId,
  );
  const nodeDecisions = recordNodeDecision(
    task.nodeDecisions,
    task.currentNodeId,
    "approved",
  );
  const route = findNextActionableRoute(
    graph,
    task.currentNodeId,
    task.extractedFields,
    completedNodeIds,
    nodeDecisions,
  );
  const notifiedNodeIds = addUnique(
    task.notifiedNodeIds || [],
    ...route.notifiedNodes.map((node) => node.id),
  );
  const notifiedEmails = route.notifiedNodes.map((node) => node.assigneeEmail);

  if (remainingPendingNodeIds.length && !routeMatchedConditionCase(route.activeBranchId)) {
    return {
      task: buildParallelWaitTask({
        task,
        graph,
        remainingPendingNodeIds,
        completedNodeIds,
        notifiedNodeIds,
        nodeDecisions,
        notifiedEmails,
      }),
      detail: "Approved; waiting for other parallel approvers before routing.",
      assignedEvent: undefined,
    };
  }

  if (!route.currentNode) {
    return {
      task: {
        ...task,
        status: "approved" as const,
        currentOwner: "",
        currentStep: "Approved",
        currentNodeId: undefined,
        pendingNodeIds: [],
        pendingOwners: [],
        completedNodeIds: addUnique(completedNodeIds, "end"),
        notifiedNodeIds,
        nodeDecisions,
        participants: addParticipants(task.participants, notifiedEmails),
        activeBranchId: route.activeBranchId,
      },
      detail: "Approved and completed the workflow.",
      assignedEvent: undefined,
    };
  }

  if (route.currentNode.kind === "return_reject") {
    return {
      task: {
        ...task,
        status: "returned" as const,
        currentOwner: task.requesterEmail,
        currentStep: "Originator action required",
        currentNodeId: route.currentNode.id,
        pendingNodeIds: [],
        pendingOwners: [],
        completedNodeIds,
        notifiedNodeIds,
        nodeDecisions,
        participants: addParticipants(task.participants, notifiedEmails),
        activeBranchId: route.activeBranchId,
      },
      detail: `Approved and routed to ${route.currentNode.label}.`,
      assignedEvent: `Returned to ${task.requester} for amendment or cancellation.`,
    };
  }

  const currentNodes = route.currentNodes.length ? route.currentNodes : [route.currentNode];
  const currentOwners = uniqueNodeEmails(currentNodes);
  const nextDue = dueForNode(route.currentNode);
  const routedNodeDecisions = removeNodeDecisions(
    nodeDecisions,
    currentNodes.map((node) => node.id),
  );
  return {
    task: {
      ...task,
      status: "pending" as const,
      currentOwner: currentOwners[0] || route.currentNode.assigneeEmail || task.requesterEmail,
      currentStep: route.currentNode.label,
      currentNodeId: route.currentNode.id,
      pendingNodeIds: currentNodes.map((node) => node.id),
      pendingOwners: currentOwners,
      due: nextDue.label,
      dueAt: nextDue.iso,
      completedNodeIds,
      notifiedNodeIds,
      nodeDecisions: routedNodeDecisions,
      participants: addParticipants(task.participants, [
        ...currentOwners,
        ...currentNodes.map((node) => node.escalationEmail),
        ...notifiedEmails,
      ]),
      activeBranchId: route.activeBranchId,
    },
    detail: `Approved and sent to ${route.currentNode.label}.`,
    assignedEvent: `Assigned to ${route.currentNode.assigneeName || route.currentNode.assigneeEmail} for ${route.currentNode.label}.`,
  };
}

function routeFromStart(task: ApprovalTask, template?: WorkflowTemplate) {
  if (!template) {
    return {
      task: {
        ...task,
        status: "pending" as const,
        currentOwner: task.participants.find((email) => email !== task.requesterEmail) || task.requesterEmail,
        currentStep: "Department review",
        nodeDecisions: {},
      },
      detail: "Amended and resubmitted for approval.",
      assignedEvent: undefined,
    };
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const route = findInitialWorkflowRoute(graph);
  const currentNodes = route.currentNodes.length
    ? route.currentNodes
    : route.currentNode
      ? [route.currentNode]
      : [];
  const currentNode = currentNodes[0];
  const currentNodeIds = new Set(currentNodes.map((node) => node.id));
  const completedRouteNodeIds = route.routeNodes
    .filter((node) => !currentNodeIds.has(node.id))
    .map((node) => node.id);
  const currentOwners = uniqueNodeEmails(currentNodes);
  const notifiedEmails = route.notifiedNodes.map((node) => node.assigneeEmail);
  const nextDue = dueForNode(currentNode);

  return {
    task: {
      ...task,
      status: "pending" as const,
      currentOwner: currentOwners[0] || task.requesterEmail,
      currentStep: currentNode?.label || "Requester review",
      currentNodeId: currentNode?.id,
      pendingNodeIds: currentNodes.map((node) => node.id),
      pendingOwners: currentOwners,
      due: nextDue.label,
      dueAt: nextDue.iso,
      completedNodeIds: addUnique(["start"], ...completedRouteNodeIds),
      notifiedNodeIds: route.notifiedNodes.map((node) => node.id),
      nodeDecisions: {},
      participants: addParticipants(task.participants, [
        ...currentOwners,
        ...currentNodes.map((node) => node.escalationEmail),
        ...notifiedEmails,
      ]),
      activeBranchId: route.activeBranchId,
    },
    detail: "Amended and resubmitted for approval.",
    assignedEvent: currentNode
      ? currentNodes.length > 1
        ? `Assigned to ${currentNodes.length} parallel approver(s): ${currentOwners.join(", ")}.`
        : `Assigned to ${currentNode.assigneeName || currentNode.assigneeEmail} for ${currentNode.label}.`
      : undefined,
  };
}

function findNextActionableRoute(
  graph: WorkflowGraph,
  fromNodeId: string,
  extractedFields: Record<string, string>,
  completedNodeIds: string[],
  nodeDecisions: ApprovalTask["nodeDecisions"],
  preferredBranchType: WorkflowGraphEdge["branchType"] = "approved",
) {
  const notifiedNodes: WorkflowGraphNode[] = [];
  let activeBranchId: string | undefined;
  let nextEdge = chooseNextEdge(
    graph,
    fromNodeId,
    extractedFields,
    preferredBranchType,
  );
  let currentId: string | undefined = nextEdge?.targetId;
  activeBranchId = nextEdge?.id;
  const visited = new Set<string>();

  collectOutgoingNotifications(graph, fromNodeId, notifiedNodes);

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = graph.nodes.find((item) => item.id === currentId);
    if (!node) {
      break;
    }

    collectOutgoingNotifications(graph, node.id, notifiedNodes);

    if (node.kind === "return_reject") {
      return {
        currentNode: node,
        currentNodes: [node],
        notifiedNodes,
        activeBranchId,
      };
    }

    if (
      (node.kind === "approval" || node.kind === "review") &&
      node.assigneeEmail?.trim()
    ) {
      return {
        currentNode: node,
        currentNodes: [node],
        notifiedNodes,
        activeBranchId,
      };
    }

    if (node.kind === "end") {
      break;
    }

    if (node.kind === "condition" && node.conditionCases?.length) {
      const conditionTarget = chooseConditionCaseTarget(
        graph,
        node,
        extractedFields,
        nodeDecisions,
        notifiedNodes,
      );
      activeBranchId = conditionTarget?.caseId || activeBranchId;
      if (conditionTarget?.currentNodes.length) {
        return {
          currentNode: conditionTarget.currentNodes[0],
          currentNodes: conditionTarget.currentNodes,
          notifiedNodes,
          activeBranchId,
        };
      }
      currentId = conditionTarget?.targetNodeId;
      continue;
    }

    nextEdge = chooseNextEdge(graph, node.id, extractedFields, "approved");
    activeBranchId = nextEdge?.id || activeBranchId;
    currentId = nextEdge?.targetId;
  }

  return {
    currentNode: undefined,
    currentNodes: [],
    notifiedNodes,
    activeBranchId,
  };
}

function chooseConditionCaseTarget(
  graph: WorkflowGraph,
  conditionNode: WorkflowGraphNode,
  extractedFields: Record<string, string>,
  nodeDecisions: ApprovalTask["nodeDecisions"],
  notifiedNodes: WorkflowGraphNode[],
) {
  const conditionCases = conditionNode.conditionCases || [];
  const specifiedCases = conditionCases.filter(
    (conditionCase) => !conditionCase.isFallback,
  );
  const fallbackCase = conditionCases.find((conditionCase) => conditionCase.isFallback);
  const matchedCase =
    specifiedCases.find((conditionCase) =>
      doesConditionCaseMatch(conditionCase, extractedFields, nodeDecisions),
    ) ||
    (fallbackCase &&
    canFallbackConditionRoute(specifiedCases, extractedFields, nodeDecisions)
      ? fallbackCase
      : undefined);

  if (!matchedCase) {
    return undefined;
  }

  matchedCase.targetNodeIds.forEach((targetNodeId) => {
    const targetNode = graph.nodes.find((node) => node.id === targetNodeId);
    if (
      targetNode?.kind === "for_information" &&
      !notifiedNodes.some((node) => node.id === targetNode.id)
    ) {
      notifiedNodes.push(targetNode);
    }
  });

  const targetNodes = matchedCase.targetNodeIds
    .map((targetNodeId) => graph.nodes.find((node) => node.id === targetNodeId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const currentNodes = targetNodes.filter(isActionableRouteNode);
  const terminalNode = targetNodes.find(
    (targetNode) => targetNode.kind !== "for_information",
  );

  return {
    caseId: matchedCase.id,
    targetNodeId: currentNodes[0]?.id || terminalNode?.id,
    currentNodes,
  };
}

function canFallbackConditionRoute(
  specifiedCases: NonNullable<WorkflowGraphNode["conditionCases"]>,
  extractedFields: Record<string, string>,
  nodeDecisions: ApprovalTask["nodeDecisions"],
) {
  return !specifiedCases.some((conditionCase) =>
    canApprovalConditionStillMatch(conditionCase, extractedFields, nodeDecisions),
  );
}

function canApprovalConditionStillMatch(
  conditionCase: NonNullable<WorkflowGraphNode["conditionCases"]>[number],
  extractedFields: Record<string, string>,
  nodeDecisions: ApprovalTask["nodeDecisions"],
) {
  if (!conditionCase.approvalRule) {
    return false;
  }

  const numericMatches = conditionCase.numericRule
    ? doesRuleMatch(conditionCase.numericRule, extractedFields)
    : undefined;

  if (conditionCase.numericRule && conditionCase.join === "and" && !numericMatches) {
    return false;
  }

  const { upstreamNodeIds, minimumApproved, mode } = conditionCase.approvalRule;
  const approvedCount = upstreamNodeIds.filter(
    (nodeId) => nodeDecisions?.[nodeId] === "approved",
  ).length;
  const decidedCount = upstreamNodeIds.filter((nodeId) =>
    Boolean(nodeDecisions?.[nodeId]),
  ).length;
  const remainingCount = Math.max(upstreamNodeIds.length - decidedCount, 0);

  if (mode === "exactly") {
    return approvedCount <= minimumApproved && minimumApproved <= approvedCount + remainingCount;
  }

  return approvedCount + remainingCount >= minimumApproved;
}

function doesConditionCaseMatch(
  conditionCase: NonNullable<WorkflowGraphNode["conditionCases"]>[number],
  extractedFields: Record<string, string>,
  nodeDecisions: ApprovalTask["nodeDecisions"],
) {
  if (conditionCase.isFallback) {
    return true;
  }

  const approvalMatches = conditionCase.approvalRule
    ? doesApprovalRuleMatch(conditionCase.approvalRule, nodeDecisions)
    : undefined;
  const numericMatches = conditionCase.numericRule
    ? doesRuleMatch(conditionCase.numericRule, extractedFields)
    : undefined;

  if (approvalMatches === undefined) {
    return Boolean(numericMatches);
  }

  if (numericMatches === undefined) {
    return approvalMatches;
  }

  return conditionCase.join === "or"
    ? approvalMatches || numericMatches
    : approvalMatches && numericMatches;
}

function doesApprovalRuleMatch(
  approvalRule: NonNullable<WorkflowGraphNode["conditionCases"]>[number]["approvalRule"],
  nodeDecisions: ApprovalTask["nodeDecisions"],
) {
  if (!approvalRule) {
    return false;
  }

  const approvedCount = approvalRule.upstreamNodeIds.filter(
    (nodeId) => nodeDecisions?.[nodeId] === "approved",
  ).length;
  const decidedCount = approvalRule.upstreamNodeIds.filter((nodeId) =>
    Boolean(nodeDecisions?.[nodeId]),
  ).length;

  if (approvalRule.mode === "exactly") {
    return (
      decidedCount === approvalRule.upstreamNodeIds.length &&
      approvedCount === approvalRule.minimumApproved
    );
  }

  return approvedCount >= approvalRule.minimumApproved;
}

function chooseNextEdge(
  graph: WorkflowGraph,
  sourceId: string,
  extractedFields: Record<string, string>,
  preferredBranchType: WorkflowGraphEdge["branchType"],
) {
  const outgoing = graph.edges.filter(
    (edge) => edge.sourceId === sourceId && edge.branchType !== "for_information",
  );
  return (
    outgoing.find((edge) => edge.branchType === preferredBranchType) ||
    outgoing.find(
      (edge) =>
        edge.branchType === "condition" &&
        edge.rule &&
        doesRuleMatch(edge.rule, extractedFields),
    ) ||
    outgoing.find((edge) => edge.branchType === "main") ||
    outgoing.find((edge) => edge.branchType === "condition") ||
    outgoing[0]
  );
}

function doesRuleMatch(
  rule: NonNullable<WorkflowGraphEdge["rule"]>,
  extractedFields: Record<string, string>,
) {
  const rawFieldValue = extractedFields[rule.field] || "";
  const fieldValue = normalizeComparableValue(rawFieldValue);
  const ruleValue = normalizeComparableValue(rule.value);

  if (rule.operator === "contains") {
    return rawFieldValue.toLowerCase().includes(rule.value.toLowerCase());
  }

  if (typeof fieldValue === "number" && typeof ruleValue === "number") {
    if (rule.operator === "=") return fieldValue === ruleValue;
    if (rule.operator === "!=") return fieldValue !== ruleValue;
    if (rule.operator === ">") return fieldValue > ruleValue;
    if (rule.operator === ">=") return fieldValue >= ruleValue;
    if (rule.operator === "<") return fieldValue < ruleValue;
    if (rule.operator === "<=") return fieldValue <= ruleValue;
  }

  if (rule.operator === "=") return rawFieldValue === rule.value;
  if (rule.operator === "!=") return rawFieldValue !== rule.value;
  return false;
}

function normalizeComparableValue(value: string) {
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && value.trim() ? number : value;
}

function collectOutgoingNotifications(
  graph: WorkflowGraph,
  sourceId: string,
  notifiedNodes: WorkflowGraphNode[],
) {
  graph.edges
    .filter((edge) => edge.sourceId === sourceId && edge.branchType === "for_information")
    .forEach((edge) => {
      const notified = graph.nodes.find((node) => node.id === edge.targetId);
      if (notified && !notifiedNodes.some((node) => node.id === notified.id)) {
        notifiedNodes.push(notified);
      }
    });
}

function taskForActorNode(
  task: ApprovalTask,
  actorEmail: string,
  template?: WorkflowTemplate,
) {
  if (!template || !task.pendingNodeIds?.length) {
    return task;
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const actorNode = task.pendingNodeIds
    .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
    .find((node) => node?.assigneeEmail === actorEmail);

  return actorNode
    ? {
        ...task,
        currentNodeId: actorNode.id,
        currentOwner: actorEmail,
        currentStep: actorNode.label,
      }
    : task;
}

function buildParallelWaitTask({
  task,
  graph,
  remainingPendingNodeIds,
  completedNodeIds,
  notifiedNodeIds,
  nodeDecisions,
  notifiedEmails,
}: {
  task: ApprovalTask;
  graph: WorkflowGraph;
  remainingPendingNodeIds: string[];
  completedNodeIds: string[];
  notifiedNodeIds: string[];
  nodeDecisions: ApprovalTask["nodeDecisions"];
  notifiedEmails: Array<string | undefined>;
}) {
  const pendingNodes = remainingPendingNodeIds
    .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const pendingOwners = uniqueNodeEmails(pendingNodes);
  const currentNode = pendingNodes[0];
  const due = dueForNode(currentNode);

  return {
    ...task,
    status: "pending" as const,
    currentOwner: pendingOwners[0] || task.requesterEmail,
    currentStep: currentNode
      ? `${currentNode.label} (${pendingOwners.length} pending)`
      : "Waiting for parallel approvals",
    currentNodeId: currentNode?.id,
    pendingNodeIds: remainingPendingNodeIds,
    pendingOwners,
    completedNodeIds,
    notifiedNodeIds,
    nodeDecisions,
    due: due.label,
    dueAt: due.iso,
    participants: addParticipants(task.participants, [
      ...pendingOwners,
      ...pendingNodes.map((node) => node.escalationEmail),
      ...notifiedEmails,
    ]),
  };
}

function routeMatchedConditionCase(activeBranchId?: string) {
  return Boolean(activeBranchId?.startsWith("case-"));
}

function uniqueNodeEmails(nodes: WorkflowGraphNode[]) {
  return addParticipants(
    [],
    nodes.map((node) => node.assigneeEmail),
  );
}

function isActionableRouteNode(node: WorkflowGraphNode) {
  return (
    (node.kind === "approval" || node.kind === "review") &&
    Boolean(node.assigneeEmail?.trim())
  );
}

function replacePendingOwnerOrDefault(
  owners: string[] | undefined,
  previousEmail: string,
  nextEmail: string,
) {
  const sourceOwners = owners?.length ? owners : [previousEmail];
  const replaced = sourceOwners.map((email) =>
    email === previousEmail ? nextEmail : email,
  );

  return addParticipants([], [...replaced, nextEmail]);
}

function delegatePendingOwners(
  task: ApprovalTask,
  actorEmail: string,
  delegateEmail: string,
) {
  const accountableOwners = task.pendingOwners?.length
    ? task.pendingOwners
    : [task.currentOwner || actorEmail];

  return addParticipants([], [...accountableOwners, actorEmail, delegateEmail]);
}

function transferReassignmentParticipants({
  participants,
  fromEmail,
  toEmail,
  requesterEmail,
}: {
  participants: string[];
  fromEmail: string;
  toEmail: string;
  requesterEmail: string;
}) {
  const retainedParticipants = participants.filter(
    (email) => email !== fromEmail || email === requesterEmail,
  );

  return addParticipants(retainedParticipants, [toEmail, requesterEmail]);
}

function removeReassignmentCandidateParticipant(
  task: ApprovalTask,
  candidateEmail: string,
) {
  const shouldKeepCandidate =
    task.requesterEmail === candidateEmail ||
    task.currentOwner === candidateEmail ||
    Boolean(task.pendingOwners?.includes(candidateEmail));

  return shouldKeepCandidate
    ? task.participants
    : task.participants.filter((email) => email !== candidateEmail);
}

function updateReassignmentRequest(
  requests: TaskReassignmentRequest[] | undefined,
  requestId: string,
  patch: Pick<TaskReassignmentRequest, "status"> &
    Partial<Pick<TaskReassignmentRequest, "decidedAt" | "decisionNote">>,
) {
  return (requests || []).map((request) =>
    request.id === requestId ? { ...request, ...patch } : request,
  );
}

function dueForNode(node?: WorkflowGraphNode) {
  const date = new Date(
    Date.now() + (node?.dueInHours || 24) * 60 * 60 * 1000,
  );

  return {
    iso: date.toISOString(),
    label: formatDue(date),
  };
}

function appendEvent(
  task: ApprovalTask,
  event: Omit<AuditEvent, "id">,
): ApprovalTask {
  return appendEvents(task, [event]);
}

function appendEvents(
  task: ApprovalTask,
  events: Array<Omit<AuditEvent, "id">>,
): ApprovalTask {
  return {
    ...task,
    auditTrail: [
      ...task.auditTrail,
      ...events.map((event, index) => ({
        id: `${task.id}-event-${task.auditTrail.length + index + 1}`,
        ...event,
      })),
    ],
  };
}

function addUnique(existing: string[], ...values: string[]) {
  return Array.from(new Set([...existing, ...values.filter(Boolean)]));
}

function getUpstreamNodeIds(graph: WorkflowGraph, currentNodeId: string) {
  const upstreamNodeIds = new Set<string>();
  const queue = [currentNodeId];

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    graph.edges
      .filter(
        (edge) => edge.targetId === currentId && edge.branchType !== "for_information",
      )
      .forEach((edge) => {
        if (upstreamNodeIds.has(edge.sourceId)) {
          return;
        }

        upstreamNodeIds.add(edge.sourceId);
        queue.push(edge.sourceId);
      });
  }

  return upstreamNodeIds;
}

function getDownstreamNodeIds(graph: WorkflowGraph, sourceNodeIds: string[]) {
  const downstreamNodeIds = new Set<string>();
  const queue = [...sourceNodeIds];

  sourceNodeIds.forEach((nodeId) => downstreamNodeIds.add(nodeId));

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    graph.edges
      .filter(
        (edge) => edge.sourceId === currentId && edge.branchType !== "for_information",
      )
      .forEach((edge) => {
        if (downstreamNodeIds.has(edge.targetId)) {
          return;
        }

        downstreamNodeIds.add(edge.targetId);
        queue.push(edge.targetId);
      });
  }

  return downstreamNodeIds;
}

function addParticipants(
  existing: string[],
  emails: Array<string | undefined>,
) {
  return Array.from(
    new Set([
      ...existing,
      ...emails.filter((email): email is string => Boolean(email)),
    ]),
  );
}

function recordNodeDecision(
  existing: ApprovalTask["nodeDecisions"],
  nodeId: string,
  decision: NonNullable<ApprovalTask["nodeDecisions"]>[string],
) {
  return {
    ...(existing || {}),
    [nodeId]: decision,
  };
}

function removeNodeDecisions(
  existing: ApprovalTask["nodeDecisions"],
  nodeIds: string[],
) {
  if (!existing || !nodeIds.length) {
    return existing;
  }

  const omittedNodeIds = new Set(nodeIds);
  return Object.fromEntries(
    Object.entries(existing).filter(([nodeId]) => !omittedNodeIds.has(nodeId)),
  );
}

function joinDetail(detail: string, comment?: string) {
  return comment ? `${detail} Comment: ${comment}` : detail;
}

function requireTargetEmail(email: string | undefined, action: string) {
  if (!email) {
    throw new Error(`${action} requires an email address.`);
  }

  return email;
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(",", "");
}

function formatDue(date: Date) {
  return new Intl.DateTimeFormat("en-HK", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
