import type {
  AdminAuditEvent,
  ApprovalTask,
  BusinessUnit,
  FormLibraryDefinition,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";
import { sanitizeWorkflowDocumentSample } from "./workflow-document-sample-state.ts";
import { repairApprovalTaskState } from "./approval-task-repair-state.ts";

export type WorkspaceStateSnapshot = {
  selectedTemplateId: string;
  approvalTasks: ApprovalTask[];
  businessDirectory: BusinessUnit[];
  workflowTemplates: WorkflowTemplate[];
  userRoleAssignments: UserRoleAssignment[];
  adminAuditEvents: AdminAuditEvent[];
  formLibrary: FormLibraryDefinition[];
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

    return sanitizeWorkspaceStateSnapshot({
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
      formLibrary: Array.isArray(parsed.formLibrary) ? parsed.formLibrary : [],
    });
  } catch {
    return null;
  }
}

export function sanitizeWorkspaceStateSnapshot(
  snapshot: WorkspaceStateSnapshot,
): WorkspaceStateSnapshot {
  return {
    ...snapshot,
    approvalTasks: Array.isArray(snapshot.approvalTasks)
      ? snapshot.approvalTasks.map(repairApprovalTaskState)
      : [],
    workflowTemplates: sanitizeWorkflowTemplates(
      Array.isArray(snapshot.workflowTemplates) ? snapshot.workflowTemplates : [],
    ),
    formLibrary: Array.isArray(snapshot.formLibrary) ? snapshot.formLibrary : [],
  };
}

function sanitizeWorkflowTemplates(
  templates: WorkflowTemplate[],
): WorkflowTemplate[] {
  return templates.map((template) => ({
    ...template,
    business: typeof template.business === "string" ? template.business : "",
    department:
      typeof template.department === "string" ? template.department : "",
    documentTypes: Array.isArray(template.documentTypes)
      ? template.documentTypes
      : [],
    documents: (Array.isArray(template.documents) ? template.documents : []).map((document) => ({
      ...document,
      ...(document.sample
        ? { sample: sanitizeWorkflowDocumentSample(document.sample) }
        : {}),
    })),
    languages: Array.isArray(template.languages) ? template.languages : [],
    fields: Array.isArray(template.fields) ? template.fields : [],
    steps: Array.isArray(template.steps) ? template.steps : [],
    ...(template.graph
      ? {
          graph: {
            ...template.graph,
            nodes: Array.isArray(template.graph.nodes) ? template.graph.nodes : [],
            edges: Array.isArray(template.graph.edges) ? template.graph.edges : [],
          },
        }
      : {}),
  }));
}
