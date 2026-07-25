import type {
  ApprovalTask,
  BusinessUnit,
  UserRole,
  UserRoleAssignment,
  WorkflowTemplate,
} from "./types.ts";

export type UserDirectoryEntry = {
  name: string;
  email: string;
  role: UserRole;
};

const roleRank: Record<UserRole, number> = {
  superuser: 7,
  "current actor": 6,
  approver: 5,
  reviewer: 4,
  originator: 3,
  fyi: 2,
  "previous actor": 1,
  participant: 0,
};

export function buildUserDirectory(
  tasks: ApprovalTask[],
  templates: WorkflowTemplate[],
  activeUser: UserDirectoryEntry,
): UserDirectoryEntry[] {
  const entries = new Map<string, UserDirectoryEntry>();
  const addEntry = (
    name: string | undefined,
    email: string | undefined,
    role: UserRole = "participant",
  ) => {
    const cleanEmail = email?.trim();
    if (!cleanEmail) {
      return;
    }

    const existing = entries.get(cleanEmail);
    const nextRole =
      existing && roleRank[existing.role] > roleRank[role] ? existing.role : role;
    entries.set(cleanEmail, {
      email: cleanEmail,
      name: name?.trim() || cleanEmail,
      role: nextRole,
    });
  };

  addEntry(activeUser.name, activeUser.email, activeUser.role);
  for (const task of tasks) {
    addEntry(task.requester, task.requesterEmail, "originator");
    addEntry(task.currentOwner, task.currentOwner, "current actor");
    task.participants.forEach((email) => addEntry(email, email, "participant"));
    task.auditTrail.forEach((event) => {
      addEntry(event.actor, event.actorEmail, "previous actor");
      addEntry(event.targetEmail, event.targetEmail, "participant");
    });
  }
  for (const template of templates) {
    template.steps.forEach((step) => {
      addEntry(step.approverName, step.approverEmail, "approver");
      addEntry(step.escalationName, step.escalationEmail, "approver");
    });
    template.graph?.nodes.forEach((node) => {
      addEntry(
        node.assigneeName,
        node.assigneeEmail,
        node.kind === "review"
          ? "reviewer"
          : node.kind === "for_information"
            ? "fyi"
            : "approver",
      );
      addEntry(node.escalationName, node.escalationEmail, "approver");
    });
  }

  return Array.from(entries.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function buildDefaultRoleAssignments(
  users: UserDirectoryEntry[],
  businessDirectory: BusinessUnit[],
): UserRoleAssignment[] {
  const firstBusiness = businessDirectory[0];
  return users.map((user) => ({
    email: user.email,
    name: user.name,
    role: user.role,
    businessId: firstBusiness?.id || "",
    department: firstBusiness?.departments[0] || "",
  }));
}
