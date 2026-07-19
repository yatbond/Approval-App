import {
  applyTaskAction,
  emailsMatch,
  getPendingReassignmentRequest,
  isActionableBy,
} from "./approval-state.ts";
import type { ApprovalActionCommand } from "./approval-api-contracts.ts";
import type {
  ApprovalAction,
  ApprovalActor,
  ApprovalTask,
  AuditEvent,
  WorkflowTemplate,
} from "./types.ts";

export type ApprovalRequestRecord = {
  id: string;
  request_no: string;
  requester_id: string | null;
  requester_name: string;
  requester_email: string;
  title: string;
  workflow_name: string;
  department_name: string;
  status: ApprovalTask["status"];
  due_label: string;
  due_at: string | null;
  value_label: string;
  current_step: string;
  current_node_id: string | null;
  current_owner_id: string | null;
  current_owner_email: string;
  pending_node_ids: string[];
  pending_owner_emails: string[];
  completed_node_ids: string[];
  notified_node_ids: string[];
  node_decisions: Record<string, "approved" | "rejected">;
  active_branch_id: string | null;
  extracted_fields: Record<string, string>;
  participants: string[];
  last_action: string;
  task_snapshot: unknown;
  pinned_template_snapshot: unknown;
  state_version: number;
  submitted_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ApprovalRuntimeProfile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
};

export type ApprovalTransition = {
  task: ApprovalTask;
  nextState: Record<string, unknown>;
  event: {
    action: AuditEvent["action"];
    type: string;
    summary: string;
    targetProfileId?: string;
    details: Record<string, unknown>;
  };
  notificationEmails: string[];
};

const closedStatuses = new Set<ApprovalTask["status"]>(["approved", "cancelled"]);

export function buildCanonicalApprovalTask(row: ApprovalRequestRecord): ApprovalTask {
  const snapshot = isRecord(row.task_snapshot) ? row.task_snapshot : {};
  const template = isRecord(row.pinned_template_snapshot)
    ? (row.pinned_template_snapshot as WorkflowTemplate)
    : undefined;
  return {
    ...(snapshot as Partial<ApprovalTask>),
    id: row.request_no,
    title: row.title,
    workflow: row.workflow_name,
    requester: row.requester_name,
    requesterEmail: row.requester_email,
    department: row.department_name,
    status: row.status,
    due: row.due_label,
    ...(row.due_at ? { dueAt: row.due_at } : {}),
    value: row.value_label,
    currentStep: row.current_step,
    currentOwner: row.current_owner_email,
    ...(row.current_node_id ? { currentNodeId: row.current_node_id } : {}),
    pendingNodeIds: row.pending_node_ids || [],
    pendingOwners: row.pending_owner_emails || [],
    completedNodeIds: row.completed_node_ids || [],
    notifiedNodeIds: row.notified_node_ids || [],
    nodeDecisions: row.node_decisions || {},
    ...(row.active_branch_id ? { activeBranchId: row.active_branch_id } : {}),
    participants: row.participants || [],
    lastAction: row.last_action,
    extractedFields: row.extracted_fields || {},
    ...(template ? { workflowTemplateSnapshot: template } : {}),
    auditTrail: Array.isArray(snapshot.auditTrail)
      ? (snapshot.auditTrail as AuditEvent[])
      : [],
  };
}

export function getAvailableApprovalActions(
  task: ApprovalTask,
  actor: ApprovalRuntimeProfile,
): ApprovalAction[] {
  if (!actor.isActive || closedStatuses.has(task.status)) {
    return [];
  }

  const actions: ApprovalAction[] = [];
  const pendingReassignment = getPendingReassignmentRequest(task, actor.email);
  if (pendingReassignment) {
    return ["accept_reassignment", "decline_reassignment"];
  }

  if (emailsMatch(task.requesterEmail, actor.email) && task.status === "returned") {
    return ["amend_resubmit", "cancel"];
  }

  const ownsCurrentWork =
    emailsMatch(task.currentOwner, actor.email) ||
    Boolean(task.pendingOwners?.some((email) => emailsMatch(email, actor.email)));
  if (ownsCurrentWork && isActionableBy(task, actor.email)) {
    actions.push(
      "approve",
      "approve_with_comment",
      "reject",
      "reject_with_comment",
      "reassign",
      "delegate",
    );
  }
  return actions;
}

export function computeApprovalTransition({
  row,
  actor,
  command,
  target,
  now = new Date(),
}: {
  row: ApprovalRequestRecord;
  actor: ApprovalRuntimeProfile;
  command: ApprovalActionCommand;
  target?: ApprovalRuntimeProfile;
  now?: Date;
}): ApprovalTransition | null {
  const task = buildCanonicalApprovalTask(row);
  const availableActions = getAvailableApprovalActions(task, actor);
  if (!availableActions.includes(command.action)) {
    return null;
  }

  const actionTask =
    command.action === "amend_resubmit"
      ? {
          ...task,
          extractedFields: {
            ...task.extractedFields,
            ...command.fieldUpdates,
          },
        }
      : task;
  const targetEmail = "targetProfileId" in command ? target?.email : undefined;
  const nextTask = applyTaskAction(actionTask, {
    action: command.action,
    actor: { name: actor.fullName, email: actor.email } satisfies ApprovalActor,
    ...(command.comment ? { comment: command.comment } : {}),
    ...(targetEmail ? { targetEmail } : {}),
    ...(command.action === "reject" || command.action === "reject_with_comment"
      ? { returnTargetNodeIds: command.returnTargetNodeIds }
      : {}),
    template: task.workflowTemplateSnapshot,
  });

  if (nextTask === actionTask || sameRuntimeState(actionTask, nextTask)) {
    return null;
  }

  const action = auditActionFor(command.action);
  const generatedEvent = nextTask.auditTrail.at(-1);
  const summary = generatedEvent?.detail?.trim() || nextTask.lastAction;
  const notificationEmails = uniqueEmails([
    ...(targetEmail ? [targetEmail] : []),
    ...(nextTask.currentOwner && !emailsMatch(nextTask.currentOwner, actor.email)
      ? [nextTask.currentOwner]
      : []),
    ...(!emailsMatch(task.requesterEmail, actor.email) ? [task.requesterEmail] : []),
  ]);
  const snapshot: ApprovalTask & { schemaVersion: number } = {
    ...nextTask,
    auditTrail: task.auditTrail,
    schemaVersion: 1,
  };

  return {
    task: nextTask,
    nextState: {
      status: nextTask.status,
      currentNodeId: nextTask.currentNodeId || "",
      dueAt: nextTask.dueAt || "",
      completedNodeIds: nextTask.completedNodeIds || [],
      notifiedNodeIds: nextTask.notifiedNodeIds || [],
      pendingNodeIds: nextTask.pendingNodeIds || [],
      pendingOwnerEmails: nextTask.pendingOwners || [],
      nodeDecisions: nextTask.nodeDecisions || {},
      activeBranchId: nextTask.activeBranchId || "",
      extractedFields: nextTask.extractedFields,
      lastAction: nextTask.lastAction,
      taskSnapshot: snapshot,
      ...(closedStatuses.has(nextTask.status) ? { completedAt: now.toISOString() } : {}),
    },
    event: {
      action,
      type: command.action,
      summary: summary.slice(0, 4_000),
      ...(target ? { targetProfileId: target.id } : {}),
      details: {
        action: command.action,
        previousVersion: row.state_version,
        resultingVersion: row.state_version + 1,
        previousStatus: row.status,
        resultingStatus: nextTask.status,
        previousNodeId: row.current_node_id,
        resultingNodeId: nextTask.currentNodeId || null,
      },
    },
    notificationEmails,
  };
}

function auditActionFor(action: ApprovalAction): AuditEvent["action"] {
  if (action === "approve" || action === "approve_with_comment") return "approved";
  if (action === "reject" || action === "reject_with_comment") return "rejected";
  if (
    action === "reassign" ||
    action === "accept_reassignment" ||
    action === "decline_reassignment"
  ) {
    return "reassigned";
  }
  if (action === "delegate") return "delegated";
  if (action === "amend_resubmit") return "resubmitted";
  return "cancelled";
}

function sameRuntimeState(left: ApprovalTask, right: ApprovalTask) {
  const withoutAudit = (task: ApprovalTask) => ({ ...task, auditTrail: [] });
  return JSON.stringify(withoutAudit(left)) === JSON.stringify(withoutAudit(right));
}

function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
