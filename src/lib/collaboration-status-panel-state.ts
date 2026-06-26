import type {
  ApprovalTask,
  TaskCorrectionRequest,
  TaskSharedFulfillment,
  WorkflowDocumentRequirement,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";

export type CollaborationStatusItem = {
  id: string;
  label: string;
  assignedEmail: string;
  actualActorEmail: string;
  status: string;
  detail: string;
  canAct: boolean;
  dueAt?: string;
};

export function getCollaborationStatusPanelState({
  task,
  template,
  activeUserEmail,
}: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  activeUserEmail: string;
  now?: Date;
}) {
  const activeEmail = normalizeEmail(activeUserEmail);
  const requiredSubmissions = template
    ? buildRequiredSubmissionItems({ task, template, activeEmail })
    : [];
  const pendingConfirmations = (task.sharedFulfillments || [])
    .filter((fulfillment) => fulfillment.status === "pending_confirmation")
    .map((fulfillment) => mapFulfillmentItem(fulfillment, activeEmail));
  const corrections = (task.correctionRequests || []).map((correction) =>
    mapCorrectionItem({ correction, task, activeEmail }),
  );
  const contributorRequests = (task.collaborationRequests || []).map((request) => ({
    id: request.id,
    label: request.contributorName || request.contributorEmail,
    assignedEmail: request.contributorEmail,
    actualActorEmail: request.contributorEmail,
    status: request.status,
    detail: request.requestNote,
    canAct:
      request.status === "requested" &&
      normalizeEmail(request.contributorEmail) === activeEmail,
    dueAt: request.dueAt,
  }));
  const blockingReasons = [
    ...requiredSubmissions
      .filter((item) => item.status === "missing")
      .map((item) => `${item.label} has not been uploaded.`),
    ...pendingConfirmations
      .filter((item) => item.status === "pending_confirmation")
      .map((item) => `${item.label} is pending confirmation.`),
    ...corrections
      .filter((item) => item.status === "requested")
      .map((item) => `${item.label} correction is still required.`),
    ...(task.collaborationRequests || [])
      .filter(
        (request) =>
          request.blocksApproval !== false && request.status === "requested",
      )
      .map((request) => `${request.contributorName || request.contributorEmail} contributor input is still required.`),
  ];

  return {
    requiredSubmissions,
    pendingConfirmations,
    corrections,
    contributorRequests,
    blockingReasons,
  };
}

function buildRequiredSubmissionItems({
  task,
  template,
  activeEmail,
}: {
  task: ApprovalTask;
  template: WorkflowTemplate;
  activeEmail: string;
}) {
  return submitNodes(template).flatMap((node) =>
    (node.documentIds || []).flatMap((documentId) => {
      const document = template.documents.find((item) => item.id === documentId);
      if (!document) {
        return [];
      }
      return [
        mapRequiredSubmissionItem({
          task,
          node,
          document,
          activeEmail,
        }),
      ];
    }),
  );
}

function mapRequiredSubmissionItem({
  task,
  node,
  document,
  activeEmail,
}: {
  task: ApprovalTask;
  node: WorkflowGraphNode;
  document: WorkflowDocumentRequirement;
  activeEmail: string;
}): CollaborationStatusItem {
  const assignedEmail = normalizeEmail(node.assigneeEmail);
  const confirmedSharedFulfillment = (task.sharedFulfillments || []).find(
    (fulfillment) =>
      fulfillment.documentId === document.id && fulfillment.status === "confirmed",
  );
  const pendingSharedFulfillment = (task.sharedFulfillments || []).find(
    (fulfillment) =>
      fulfillment.documentId === document.id &&
      fulfillment.status === "pending_confirmation",
  );
  const rejectedSharedFulfillment = (task.sharedFulfillments || []).find(
    (fulfillment) =>
      fulfillment.documentId === document.id && fulfillment.status === "rejected",
  );
  const unresolvedCorrection = rejectedSharedFulfillment
    ? (task.correctionRequests || []).find(
        (correction) =>
          correction.sharedFulfillmentId === rejectedSharedFulfillment.id &&
          correction.status === "requested",
      )
    : null;
  const attachment = (task.attachments || []).find(
    (item) =>
      item.documentId === document.id &&
      (!item.workflowNodeId || item.workflowNodeId === node.id),
  );
  const status = confirmedSharedFulfillment
    ? "confirmed"
    : pendingSharedFulfillment
      ? "pending_confirmation"
      : unresolvedCorrection
        ? "correction_requested"
      : attachment
        ? "submitted"
        : document.required
          ? "missing"
          : "optional";

  return {
    id: `${node.id}:${document.id}`,
    label: document.documentType,
    assignedEmail,
    actualActorEmail:
      confirmedSharedFulfillment?.uploaderEmail ||
      pendingSharedFulfillment?.uploaderEmail ||
      attachment?.uploadedBy ||
      assignedEmail,
    status,
    detail: node.label,
    canAct: assignedEmail === activeEmail,
  };
}

function mapFulfillmentItem(
  fulfillment: TaskSharedFulfillment,
  activeEmail: string,
): CollaborationStatusItem {
  return {
    id: fulfillment.id,
    label: fulfillment.documentType,
    assignedEmail: fulfillment.assignedSubmitterEmail,
    actualActorEmail: fulfillment.uploaderEmail,
    status: fulfillment.status,
    detail: `Uploaded by ${fulfillment.uploaderEmail}`,
    canAct:
      normalizeEmail(fulfillment.assignedSubmitterEmail) === activeEmail,
  };
}

function mapCorrectionItem({
  correction,
  task,
  activeEmail,
}: {
  correction: TaskCorrectionRequest;
  task: ApprovalTask;
  activeEmail: string;
}): CollaborationStatusItem {
  const fulfillment = (task.sharedFulfillments || []).find(
    (item) => item.id === correction.sharedFulfillmentId,
  );
  return {
    id: correction.id,
    label: fulfillment?.documentType || correction.id,
    assignedEmail: correction.assignedSubmitterEmail,
    actualActorEmail: correction.uploaderEmail,
    status: correction.status,
    detail: correction.rejectionNote,
    canAct:
      correction.status === "requested" &&
      [correction.uploaderEmail, correction.assignedSubmitterEmail]
        .map(normalizeEmail)
        .includes(activeEmail),
  };
}

function submitNodes(template: WorkflowTemplate) {
  return (template.graph?.nodes || []).filter(
    (node) => node.kind === "submit_request",
  );
}

function normalizeEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}
