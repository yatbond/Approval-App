import type {
  ApprovalActor,
  ApprovalAttachment,
  ApprovalTask,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowDocumentRequirement,
  WorkflowTemplate,
} from "@/lib/types";
import {
  createWorkflowGraphFromTemplate,
  findInitialWorkflowRoute,
} from "./workflow-graph.ts";

export type CreateApprovalTaskInput = {
  id?: string;
  now?: Date;
  requester: ApprovalActor;
  template: WorkflowTemplate;
  sourceFileName?: string;
  extractedFields: Record<string, string>;
  attachments?: ApprovalAttachment[];
};

export function getSubmissionDocumentRequirements(
  template: WorkflowTemplate,
): WorkflowDocumentRequirement[] {
  const graph = createWorkflowGraphFromTemplate(template);
  const route = findInitialWorkflowRoute(graph);
  const startingNodes = findStartingActionNodes(graph);
  const routeDocumentIds = new Set<string>();

  (startingNodes.length ? startingNodes : route.currentNode ? [route.currentNode] : [])
    .flatMap((node) => node.documentIds || [])
    .forEach((documentId) => routeDocumentIds.add(documentId));

  if (!routeDocumentIds.size) {
    return template.documents;
  }

  return template.documents.filter((document) => routeDocumentIds.has(document.id));
}

export function getMissingRequiredSubmissionDocuments(
  template: WorkflowTemplate,
  attachments: ApprovalAttachment[],
): WorkflowDocumentRequirement[] {
  const uploadedDocumentIds = new Set(
    attachments
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );

  return getSubmissionDocumentRequirements(template).filter(
    (document) => document.required && !uploadedDocumentIds.has(document.id),
  );
}

export function getMissingRequiredCurrentNodeDocuments(
  task: ApprovalTask,
  template: WorkflowTemplate,
): WorkflowDocumentRequirement[] {
  if (!task.currentNodeId) {
    return [];
  }

  const graph = createWorkflowGraphFromTemplate(template);
  const currentNode = graph.nodes.find((node) => node.id === task.currentNodeId);
  const requiredDocumentIds = new Set(currentNode?.documentIds || []);
  if (!requiredDocumentIds.size) {
    return [];
  }

  const uploadedDocumentIds = new Set(
    (task.attachments || [])
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string => Boolean(documentId)),
  );

  return template.documents.filter(
    (document) =>
      document.required &&
      requiredDocumentIds.has(document.id) &&
      !uploadedDocumentIds.has(document.id),
  );
}

export function createApprovalTaskFromTemplate({
  id,
  now = new Date(),
  requester,
  template,
  sourceFileName,
  extractedFields,
  attachments = [],
}: CreateApprovalTaskInput): ApprovalTask {
  const graph = createWorkflowGraphFromTemplate(template);
  const route = findInitialWorkflowRoute(graph);
  const startingNodes = findStartingActionNodes(graph);
  const firstStep = template.steps[0];
  const currentNode = startingNodes[0] || route.currentNode;
  const pendingNodeIds = startingNodes.length
    ? startingNodes.map((node) => node.id)
    : currentNode
      ? [currentNode.id]
      : [];
  const pendingOwners = uniqueEmails(
    (startingNodes.length ? startingNodes : currentNode ? [currentNode] : [])
      .map((node) => node.assigneeEmail),
  );
  const notifiedEmails = route.notifiedNodes.map((node) => node.assigneeEmail);
  const taskId = id || createTaskId(now);
  const currentOwner =
    currentNode?.assigneeEmail || firstStep?.approverEmail || requester.email;
  const dueInHours = currentNode?.dueInHours || firstStep?.dueInHours || 24;
  const due = new Date(now.getTime() + dueInHours * 60 * 60 * 1000);
  const titleSuffix =
    sourceFileName?.trim() ||
    template.documents.find((document) => document.required)?.documentType ||
    template.name;

  return {
    id: taskId,
    title: `${template.name} - ${titleSuffix}`,
    workflow: template.name,
    workflowTemplateId: template.id,
    workflowTemplateVersion: 1,
    workflowTemplateSnapshot: template,
    requester: requester.name,
    requesterEmail: requester.email,
    department: template.department,
    status: "pending",
    due: formatDue(due),
    dueAt: due.toISOString(),
    value: findDisplayValue(extractedFields),
    currentStep: currentNode?.label || firstStep?.name || "Requester review",
    currentOwner,
    currentNodeId: currentNode?.id,
    pendingNodeIds,
    pendingOwners,
    completedNodeIds: ["start"],
    notifiedNodeIds: route.notifiedNodes.map((node) => node.id),
    participants: uniqueEmails([
      requester.email,
      currentOwner,
      ...pendingOwners,
      currentNode?.escalationEmail,
      firstStep?.escalationEmail,
      ...notifiedEmails,
    ]),
    lastAction: `Submitted by ${requester.name}`,
    extractedFields,
    attachments,
    auditTrail: [
      {
        id: `${taskId}-event-1`,
        action: "submitted",
        actor: requester.name,
        actorEmail: requester.email,
        timestamp: formatTimestamp(now),
        detail: `Request submitted using ${template.name}.`,
      },
      {
        id: `${taskId}-event-2`,
        action: "assigned",
        actor: "System",
        actorEmail: "system@example.com",
        timestamp: formatTimestamp(now),
        detail: currentNode
          ? startingNodes.length > 1
            ? `Assigned to ${startingNodes.length} parallel approver(s): ${pendingOwners.join(", ")}.`
            : `Assigned to ${currentNode.assigneeName || currentNode.assigneeEmail} for ${currentNode.label}.`
          : firstStep
          ? `Assigned to ${firstStep.approverName} for ${firstStep.name}.`
          : "No approval step configured; returned to requester.",
        targetEmail: currentOwner,
      },
    ],
  };
}

function findStartingActionNodes(graph: WorkflowGraph) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const directTargets = graph.edges
    .filter((edge) => edge.sourceId === "start" && edge.branchType !== "for_information")
    .map((edge) => nodesById.get(edge.targetId))
    .filter((node): node is WorkflowGraphNode => Boolean(node));
  const actionTargets = directTargets.filter(isActionableNode);

  if (actionTargets.length > 1) {
    return actionTargets;
  }

  return actionTargets;
}

function isActionableNode(node: WorkflowGraphNode) {
  return (
    (node.kind === "approval" || node.kind === "review") &&
    Boolean(node.assigneeEmail?.trim())
  );
}

function createTaskId(now: Date) {
  return `APR-${Math.floor(now.getTime() / 1000)}`;
}

function findDisplayValue(fields: Record<string, string>) {
  const candidates = ["Total", "Amount", "Invoice total", "invoice_total"];
  const match = candidates.find((field) => fields[field]?.trim());
  return match ? fields[match] : "Pending extraction";
}

function uniqueEmails(emails: Array<string | undefined>) {
  return Array.from(new Set(emails.filter((email): email is string => Boolean(email))));
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
