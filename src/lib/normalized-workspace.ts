import type {
  ApprovalAttachment,
  ApprovalTask,
  AuditEvent,
  BusinessUnit,
  WorkflowTemplate,
} from "@/lib/types";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";

export type NormalizedOwner = {
  userId: string;
  email: string;
};

export type NormalizedBusinessUnitRow = {
  clientId: string;
  name: string;
};

export type NormalizedBusinessDepartmentRow = {
  businessClientId: string;
  name: string;
};

export type NormalizedWorkflowTemplateVersionRow = {
  templateKey: string;
  versionNumber: number;
  name: string;
  businessName: string;
  departmentName: string;
  graph: WorkflowTemplate["graph"];
  documentRequirements: WorkflowTemplate["documents"];
  supportedLanguages: string[];
  templateSnapshot: WorkflowTemplate;
  createdBy: string;
};

export type NormalizedApprovalRequestRow = {
  requestNo: string;
  workflowTemplateKey: string;
  workflowTemplateVersion: number;
  requesterName: string;
  requesterEmail: string;
  title: string;
  workflowName: string;
  department: string;
  status: ApprovalTask["status"];
  dueLabel: string;
  dueAt?: string;
  valueLabel: string;
  currentStep: string;
  currentNodeId?: string;
  currentOwnerEmail: string;
  pendingNodeIds: string[];
  pendingOwnerEmails: string[];
  completedNodeIds: string[];
  notifiedNodeIds: string[];
  nodeDecisions: ApprovalTask["nodeDecisions"];
  activeBranchId?: string;
  extractedFields: Record<string, string>;
  participants: string[];
  lastAction: string;
  taskSnapshot: ApprovalTask;
};

export type NormalizedApprovalRequestEventRow = {
  approvalRequestNo: string;
  eventKey: string;
  action: AuditEvent["action"];
  actorName: string;
  actorEmail: string;
  detail: string;
  targetEmail?: string;
  createdAt: string;
};

export type NormalizedApprovalRequestAttachmentRow = {
  approvalRequestNo: string;
  attachmentKey: string;
  fileName: string;
  documentId?: string;
  documentType: string;
  documentFormat: ApprovalAttachment["format"];
  workflowNodeId?: string;
  storagePath?: string;
  publicUrl?: string;
  uploadedByEmail: string;
  createdAt: string;
};

export type NormalizedWorkspaceRows = {
  businessUnits: NormalizedBusinessUnitRow[];
  businessDepartments: NormalizedBusinessDepartmentRow[];
  workflowTemplateVersions: NormalizedWorkflowTemplateVersionRow[];
  approvalRequests: NormalizedApprovalRequestRow[];
  approvalRequestEvents: NormalizedApprovalRequestEventRow[];
  approvalRequestAttachments: NormalizedApprovalRequestAttachmentRow[];
};

export type NormalizedWorkspaceLoadRows = NormalizedWorkspaceRows & {
  selectedTemplateId: string;
};

export function buildNormalizedWorkspaceRows(
  snapshot: WorkspaceStateSnapshot,
  owner: NormalizedOwner,
): NormalizedWorkspaceRows {
  return {
    businessUnits: snapshot.businessDirectory.map((business) => ({
      clientId: business.id,
      name: business.name,
    })),
    businessDepartments: snapshot.businessDirectory.flatMap((business) =>
      business.departments.map((department) => ({
        businessClientId: business.id,
        name: department,
      })),
    ),
    workflowTemplateVersions: snapshot.workflowTemplates.map((template) => ({
      templateKey: template.id,
      versionNumber: latestTaskVersionForTemplate(snapshot.approvalTasks, template.id),
      name: template.name,
      businessName: template.business,
      departmentName: template.department,
      graph: template.graph,
      documentRequirements: template.documents,
      supportedLanguages: template.languages,
      templateSnapshot: template,
      createdBy: owner.userId,
    })),
    approvalRequests: snapshot.approvalTasks.map((task) => {
      const template = findTaskTemplate(task, snapshot.workflowTemplates);

      return {
        requestNo: task.id,
        workflowTemplateKey: template?.id || "",
        workflowTemplateVersion: task.workflowTemplateVersion || 1,
        requesterName: task.requester,
        requesterEmail: task.requesterEmail,
        title: task.title,
        workflowName: task.workflow,
        department: task.department,
        status: task.status,
        dueLabel: task.due,
        dueAt: task.dueAt,
        valueLabel: task.value,
        currentStep: task.currentStep,
        currentNodeId: task.currentNodeId,
        currentOwnerEmail: task.currentOwner,
        pendingNodeIds: task.pendingNodeIds || [],
        pendingOwnerEmails: task.pendingOwners || [],
        completedNodeIds: task.completedNodeIds || [],
        notifiedNodeIds: task.notifiedNodeIds || [],
        nodeDecisions: task.nodeDecisions || {},
        activeBranchId: task.activeBranchId,
        extractedFields: task.extractedFields,
        participants: task.participants,
        lastAction: task.lastAction,
        taskSnapshot: {
          ...task,
          workflowTemplateId: task.workflowTemplateId || template?.id,
        },
      };
    }),
    approvalRequestEvents: snapshot.approvalTasks.flatMap((task) =>
      task.auditTrail.map((event) => ({
        approvalRequestNo: task.id,
        eventKey: event.id,
        action: event.action,
        actorName: event.actor,
        actorEmail: event.actorEmail,
        detail: event.detail,
        targetEmail: event.targetEmail,
        createdAt: event.timestamp,
      })),
    ),
    approvalRequestAttachments: snapshot.approvalTasks.flatMap((task) =>
      (task.attachments || []).map((attachment) => ({
        approvalRequestNo: task.id,
        attachmentKey: attachment.id,
        fileName: attachment.fileName,
        documentId: attachment.documentId,
        documentType: attachment.documentType,
        documentFormat: attachment.format,
        workflowNodeId: attachment.workflowNodeId,
        storagePath: attachment.storagePath,
        publicUrl: attachment.publicUrl,
        uploadedByEmail: attachment.uploadedBy,
        createdAt: attachment.uploadedAt,
      })),
    ),
  };
}

export function restoreWorkspaceStateFromNormalizedRows(
  rows: NormalizedWorkspaceLoadRows,
): WorkspaceStateSnapshot {
  const businessDirectory = restoreBusinessDirectory(
    rows.businessUnits,
    rows.businessDepartments,
  );
  const workflowTemplates = rows.workflowTemplateVersions.map(
    (template) => template.templateSnapshot,
  );
  const eventsByRequest = groupBy(rows.approvalRequestEvents, (event) => event.approvalRequestNo);
  const attachmentsByRequest = groupBy(
    rows.approvalRequestAttachments,
    (attachment) => attachment.approvalRequestNo,
  );
  const approvalTasks = rows.approvalRequests.map((request) =>
    restoreApprovalTask(
      request,
      eventsByRequest.get(request.requestNo) || [],
      attachmentsByRequest.get(request.requestNo) || [],
    ),
  );

  return {
    selectedTemplateId: rows.selectedTemplateId,
    approvalTasks,
    businessDirectory,
    workflowTemplates,
    userRoleAssignments: [],
  };
}

function latestTaskVersionForTemplate(tasks: ApprovalTask[], templateId: string) {
  return tasks.reduce((version, task) => {
    if (task.workflowTemplateId !== templateId) {
      return version;
    }

    return Math.max(version, task.workflowTemplateVersion || 1);
  }, 1);
}

function findTaskTemplate(task: ApprovalTask, templates: WorkflowTemplate[]) {
  return (
    templates.find((template) => template.id === task.workflowTemplateId) ||
    templates.find((template) => template.id === task.workflowTemplateSnapshot?.id) ||
    templates.find((template) => template.name === task.workflow)
  );
}

function restoreBusinessDirectory(
  businesses: NormalizedBusinessUnitRow[],
  departments: NormalizedBusinessDepartmentRow[],
): BusinessUnit[] {
  return businesses.map((business) => ({
    id: business.clientId,
    name: business.name,
    departments: departments
      .filter((department) => department.businessClientId === business.clientId)
      .map((department) => department.name),
  }));
}

function restoreApprovalTask(
  request: NormalizedApprovalRequestRow,
  events: NormalizedApprovalRequestEventRow[],
  attachments: NormalizedApprovalRequestAttachmentRow[],
): ApprovalTask {
  return {
    ...request.taskSnapshot,
    auditTrail: events.map((event) => ({
      id: event.eventKey,
      action: event.action,
      actor: event.actorName,
      actorEmail: event.actorEmail,
      timestamp: event.createdAt,
      detail: event.detail,
      ...(event.targetEmail ? { targetEmail: event.targetEmail } : {}),
    })),
    attachments: attachments.map((attachment) => ({
      id: attachment.attachmentKey,
      fileName: attachment.fileName,
      ...(attachment.documentId ? { documentId: attachment.documentId } : {}),
      documentType: attachment.documentType,
      format: attachment.documentFormat,
      ...(attachment.workflowNodeId ? { workflowNodeId: attachment.workflowNodeId } : {}),
      ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
      ...(attachment.publicUrl ? { publicUrl: attachment.publicUrl } : {}),
      uploadedBy: attachment.uploadedByEmail,
      uploadedAt: attachment.createdAt,
    })),
  };
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  return grouped;
}
