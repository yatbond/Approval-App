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
  isActive?: boolean;
  isActiveVersion?: boolean;
  versionComment?: string;
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
  const archivedTemplateRows = archivedTaskTemplateRows(snapshot, owner);
  const legacyTemplateRows = legacyTaskTemplateRows(snapshot, owner);
  const templatesForRequests = [
    ...snapshot.workflowTemplates,
    ...archivedTemplateRows.map((row) => row.templateSnapshot),
    ...legacyTemplateRows.map((row) => row.templateSnapshot),
  ];
  const workflowTemplateVersions = [
    ...snapshot.workflowTemplates.map((template) => ({
      templateKey: template.id,
      versionNumber:
        template.version ||
        latestTaskVersionForTemplate(snapshot.approvalTasks, template.id),
      name: template.name,
      businessName: template.business,
      departmentName: template.department,
      graph: template.graph,
      documentRequirements: template.documents,
      supportedLanguages: template.languages,
      templateSnapshot: template,
      createdBy: owner.userId,
      isActive: template.isArchived !== true,
      isActiveVersion: template.isActiveVersion === true,
      versionComment: template.versionComment || "",
    })),
    ...archivedTemplateRows,
    ...legacyTemplateRows,
  ];

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
    workflowTemplateVersions,
    approvalRequests: snapshot.approvalTasks.map((task) => {
      const template = findTaskTemplate(task, templatesForRequests);

      return {
        requestNo: task.id,
        workflowTemplateKey: taskWorkflowTemplateKey(task, template),
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
    adminAuditEvents: [],
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
    templates.find((template) => template.name === task.workflow) ||
    task.workflowTemplateSnapshot
  );
}

function taskWorkflowTemplateKey(task: ApprovalTask, template?: WorkflowTemplate) {
  return task.workflowTemplateId || template?.id || task.workflowTemplateSnapshot?.id || "";
}

function archivedTaskTemplateRows(
  snapshot: WorkspaceStateSnapshot,
  owner: NormalizedOwner,
): NormalizedWorkflowTemplateVersionRow[] {
  const activeTemplateVersions = new Set(
    snapshot.workflowTemplates.map(
      (template) =>
        `${template.id}:${latestTaskVersionForTemplate(snapshot.approvalTasks, template.id)}`,
    ),
  );
  const archivedTemplateVersions = new Set<string>();
  const rows: NormalizedWorkflowTemplateVersionRow[] = [];

  for (const task of snapshot.approvalTasks) {
    if (!task.workflowTemplateSnapshot) {
      continue;
    }

    const templateKey = taskWorkflowTemplateKey(task, task.workflowTemplateSnapshot);
    const versionNumber = task.workflowTemplateVersion || 1;
    const versionKey = `${templateKey}:${versionNumber}`;
    if (activeTemplateVersions.has(versionKey) || archivedTemplateVersions.has(versionKey)) {
      continue;
    }

    archivedTemplateVersions.add(versionKey);
    rows.push({
      templateKey,
      versionNumber,
      name: task.workflowTemplateSnapshot.name,
      businessName: task.workflowTemplateSnapshot.business,
      departmentName: task.workflowTemplateSnapshot.department,
      graph: task.workflowTemplateSnapshot.graph,
      documentRequirements: task.workflowTemplateSnapshot.documents,
      supportedLanguages: task.workflowTemplateSnapshot.languages,
      templateSnapshot: {
        ...task.workflowTemplateSnapshot,
        id: templateKey,
      },
      createdBy: owner.userId,
      isActive: false,
      isActiveVersion: false,
      versionComment: task.workflowTemplateSnapshot.versionComment || "",
    });
  }

  return rows;
}

function legacyTaskTemplateRows(
  snapshot: WorkspaceStateSnapshot,
  owner: NormalizedOwner,
): NormalizedWorkflowTemplateVersionRow[] {
  const rows: NormalizedWorkflowTemplateVersionRow[] = [];
  const existingTemplateKeys = new Set(snapshot.workflowTemplates.map((template) => template.id));
  const legacyTemplateKeys = new Set<string>();

  for (const task of snapshot.approvalTasks) {
    if (
      task.workflowTemplateId ||
      task.workflowTemplateSnapshot ||
      findTaskTemplate(task, snapshot.workflowTemplates)
    ) {
      continue;
    }

    const templateKey = legacyWorkflowTemplateKey(task);
    if (
      !templateKey ||
      existingTemplateKeys.has(templateKey) ||
      legacyTemplateKeys.has(templateKey)
    ) {
      continue;
    }

    legacyTemplateKeys.add(templateKey);
    const businessName = legacyTaskBusinessName(snapshot.businessDirectory, task);
    const departmentName = task.department || "Unassigned";
    const templateSnapshot: WorkflowTemplate = {
      id: templateKey,
      name: task.workflow || "Legacy workflow",
      business: businessName,
      department: departmentName,
      version: task.workflowTemplateVersion || 1,
      isDraft: false,
      isActiveVersion: false,
      isArchived: true,
      documentTypes: [],
      documents: [],
      languages: [],
      fields: [],
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          { id: "end", kind: "end", label: "End", x: 240, y: 0 },
        ],
        edges: [
          {
            id: "legacy-start-end",
            sourceId: "start",
            targetId: "end",
            label: "Legacy route",
            branchType: "main",
          },
        ],
      },
    };

    rows.push({
      templateKey,
      versionNumber: templateSnapshot.version || 1,
      name: templateSnapshot.name,
      businessName,
      departmentName,
      graph: templateSnapshot.graph,
      documentRequirements: templateSnapshot.documents,
      supportedLanguages: templateSnapshot.languages,
      templateSnapshot,
      createdBy: owner.userId,
      isActive: false,
      isActiveVersion: false,
      versionComment: "Legacy request reference created during normalization.",
    });
  }

  return rows;
}

function legacyWorkflowTemplateKey(task: ApprovalTask) {
  const base = (task.workflow || task.title || task.id || "legacy-workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return `legacy-${base || "workflow"}`;
}

function legacyTaskBusinessName(
  businessDirectory: BusinessUnit[],
  task: ApprovalTask,
) {
  return (
    businessDirectory.find((business) =>
      business.departments.some((department) => department === task.department),
    )?.name ||
    businessDirectory[0]?.name ||
    "Legacy business"
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
