import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  WorkflowDocumentSample,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";

export type WorkspaceStateSnapshot = {
  selectedTemplateId: string;
  approvalTasks: ApprovalTask[];
  businessDirectory: BusinessUnit[];
  workflowTemplates: WorkflowTemplate[];
  userRoleAssignments: UserRoleAssignment[];
  adminAuditEvents: AdminAuditEvent[];
};

export function serializeWorkspaceState(snapshot: WorkspaceStateSnapshot) {
  return JSON.stringify(sanitizeWorkspaceStateSnapshot(snapshot));
}

export function parseWorkspaceState(value: string): WorkspaceStateSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<WorkspaceStateSnapshot>;

    if (
      typeof parsed.selectedTemplateId !== "string" ||
      !Array.isArray(parsed.businessDirectory) ||
      !Array.isArray(parsed.workflowTemplates)
    ) {
      return null;
    }

    return {
      selectedTemplateId: parsed.selectedTemplateId,
      approvalTasks: Array.isArray(parsed.approvalTasks)
        ? parsed.approvalTasks
        : [],
      businessDirectory: parsed.businessDirectory,
      workflowTemplates: sanitizeWorkflowTemplates(parsed.workflowTemplates),
      userRoleAssignments: Array.isArray(parsed.userRoleAssignments)
        ? parsed.userRoleAssignments
        : [],
      adminAuditEvents: Array.isArray(parsed.adminAuditEvents)
        ? parsed.adminAuditEvents
        : [],
    };
  } catch {
    return null;
  }
}

function sanitizeWorkspaceStateSnapshot(
  snapshot: WorkspaceStateSnapshot,
): WorkspaceStateSnapshot {
  return {
    ...snapshot,
    workflowTemplates: sanitizeWorkflowTemplates(snapshot.workflowTemplates),
  };
}

function sanitizeWorkflowTemplates(
  templates: WorkflowTemplate[],
): WorkflowTemplate[] {
  return templates.map((template) => ({
    ...template,
    documents: template.documents.map((document) => ({
      ...document,
      ...(document.sample
        ? { sample: sanitizeWorkflowDocumentSample(document.sample) }
        : {}),
    })),
  }));
}

function sanitizeWorkflowDocumentSample(
  sample: WorkflowDocumentSample,
): WorkflowDocumentSample {
  return {
    fileName: sample.fileName,
    mimeType: sample.mimeType,
    previewPages: (sample.previewPages || []).map((page) => ({
      pageNumber: page.pageNumber,
      mimeType: page.mimeType,
      ...(page.pageText ? { pageText: page.pageText } : {}),
    })),
    pageImages: (sample.pageImages || []).map((page) => ({
      pageNumber: page.pageNumber,
      mimeType: page.mimeType,
      ...(page.pageText ? { pageText: page.pageText } : {}),
    })),
    savedAt: sample.savedAt,
  };
}
