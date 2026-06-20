import type {
  ApprovalTask,
  BusinessUnit,
  UserRoleAssignment,
  WorkflowTemplate,
} from "@/lib/types";

export type WorkspaceStateSnapshot = {
  selectedTemplateId: string;
  approvalTasks: ApprovalTask[];
  businessDirectory: BusinessUnit[];
  workflowTemplates: WorkflowTemplate[];
  userRoleAssignments: UserRoleAssignment[];
};

export function serializeWorkspaceState(snapshot: WorkspaceStateSnapshot) {
  return JSON.stringify(snapshot);
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
      workflowTemplates: parsed.workflowTemplates,
      userRoleAssignments: Array.isArray(parsed.userRoleAssignments)
        ? parsed.userRoleAssignments
        : [],
    };
  } catch {
    return null;
  }
}
