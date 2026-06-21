import type {
  ApprovalTask,
  BusinessUnit,
  UserRoleAssignment,
  WorkflowTemplate,
} from "./types.ts";
import {
  buildDefaultRoleAssignments,
  buildUserDirectory,
  type UserDirectoryEntry,
} from "./user-directory.ts";
import type { WorkspaceStateSnapshot } from "./workspace-persistence.ts";

export function personalizeApprovalTask(
  task: ApprovalTask,
  activeUserEmail: string,
): ApprovalTask {
  const replaceSeedUser = (email: string) =>
    email === "derrick@example.com" ? activeUserEmail : email;

  return {
    ...task,
    currentOwner: replaceSeedUser(task.currentOwner),
    participants: task.participants.map(replaceSeedUser),
    auditTrail: task.auditTrail.map((event) => ({
      ...event,
      actorEmail: replaceSeedUser(event.actorEmail),
      targetEmail: event.targetEmail ? replaceSeedUser(event.targetEmail) : undefined,
    })),
  };
}

export function createDefaultWorkspaceSnapshot({
  activeUser,
  approvalTasks,
  businessDirectory,
  workflowTemplates,
}: {
  activeUser: UserDirectoryEntry;
  approvalTasks: ApprovalTask[];
  businessDirectory: BusinessUnit[];
  workflowTemplates: WorkflowTemplate[];
}): WorkspaceStateSnapshot {
  const personalizedTasks = approvalTasks.map((task) =>
    personalizeApprovalTask(task, activeUser.email),
  );
  return {
    approvalTasks: personalizedTasks,
    businessDirectory,
    workflowTemplates,
    userRoleAssignments: buildDefaultRoleAssignments(
      buildUserDirectory(personalizedTasks, workflowTemplates, activeUser),
      businessDirectory,
    ),
    selectedTemplateId: workflowTemplates[0]?.id || "",
  };
}

export function getInitialSelectedTaskId({
  requestId,
  savedApprovalTasks,
  seedApprovalTasks,
}: {
  requestId: string;
  savedApprovalTasks: Pick<ApprovalTask, "id">[];
  seedApprovalTasks: Pick<ApprovalTask, "id">[];
}) {
  return requestId || savedApprovalTasks[0]?.id || seedApprovalTasks[0]?.id;
}

export function shouldLoadRemoteWorkspace({
  localWorkspaceReady,
  savedWorkspaceState,
}: {
  localWorkspaceReady: boolean;
  savedWorkspaceState: WorkspaceStateSnapshot | null;
}) {
  return localWorkspaceReady && !savedWorkspaceState;
}

export function createWorkspaceSnapshotPatch(
  current: WorkspaceStateSnapshot,
  patch: Partial<{
    approvalTasks: ApprovalTask[];
    businessDirectory: BusinessUnit[];
    workflowTemplates: WorkflowTemplate[];
    userRoleAssignments: UserRoleAssignment[];
    selectedTemplateId: string;
  }> = {},
): WorkspaceStateSnapshot {
  return {
    approvalTasks: patch.approvalTasks ?? current.approvalTasks,
    businessDirectory: patch.businessDirectory ?? current.businessDirectory,
    workflowTemplates: patch.workflowTemplates ?? current.workflowTemplates,
    userRoleAssignments: patch.userRoleAssignments ?? current.userRoleAssignments,
    selectedTemplateId: patch.selectedTemplateId ?? current.selectedTemplateId,
  };
}
