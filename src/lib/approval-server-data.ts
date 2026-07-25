import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalPayloadHash,
  type ApprovalActionCommand,
  type ApprovalRequestListQuery,
  type ApprovalRequestSubmission,
} from "./approval-api-contracts.ts";
import type { ApprovalCollaborationCommand } from "./approval-collaboration-contracts.ts";
import { buildCollaborationNotifications } from "./collaboration-notification-state.ts";
import {
  buildCanonicalApprovalTask,
  computeApprovalTransition,
  getAvailableApprovalActions,
  type ApprovalRequestRecord,
  type ApprovalRuntimeProfile,
} from "./approval-runtime.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import {
  getTaskCorrectionUploadState,
  getTaskSharedFulfillmentDecisionState,
  getTaskSharedFulfillmentSubmitState,
} from "./shared-fulfillment-state.ts";
import {
  getTaskContributorRequestState,
  getTaskContributorUploadState,
} from "./task-collaboration-state.ts";
import type { ApprovalAttachment, ApprovalTask, WorkflowTemplate } from "./types.ts";
import { applyWorkflowParticipantEmails } from "./workflow-participant-assignment-state.ts";

const requestColumns = [
  "id",
  "request_no",
  "requester_id",
  "requester_name",
  "requester_email",
  "title",
  "workflow_name",
  "department_name",
  "status",
  "due_label",
  "due_at",
  "value_label",
  "current_step",
  "current_node_id",
  "current_owner_id",
  "current_owner_email",
  "pending_node_ids",
  "pending_owner_emails",
  "completed_node_ids",
  "notified_node_ids",
  "node_decisions",
  "active_branch_id",
  "extracted_fields",
  "participants",
  "last_action",
  "task_snapshot",
  "pinned_template_snapshot",
  "state_version",
  "submitted_at",
  "updated_at",
  "completed_at",
].join(",");

type EventRecord = {
  id: string;
  event_key: string;
  command_id: string | null;
  request_version: number;
  action: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string;
  detail: string;
  details: Record<string, unknown>;
  target_id: string | null;
  target_email: string | null;
  created_at: string;
};

type AttachmentRecord = {
  id: string;
  attachment_key: string;
  file_name: string;
  document_id: string | null;
  document_type: string;
  document_format: string;
  workflow_node_id: string | null;
  uploaded_by_email: string;
  created_at: string;
};

export type ApprovalCommandResult =
  | { kind: "success"; replayed: boolean; request: Record<string, unknown> }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_target" }
  | { kind: "invalid_transition"; request: Record<string, unknown> }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | {
      kind: "conflict";
      code: "stale_version" | "idempotency_conflict" | "already_decided";
      request: Record<string, unknown>;
    }
  | { kind: "dependency_error"; operation: string; errorCode: string };

export type ApprovalSubmissionResult =
  | { kind: "success"; replayed: boolean; request: Record<string, unknown> }
  | { kind: "invalid_template" | "invalid_target" | "invalid_submission" }
  | { kind: "idempotency_conflict"; request?: Record<string, unknown> }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "dependency_error"; operation: string; errorCode: string };

export async function submitApprovalRequest({
  session,
  service,
  actor,
  submission,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  submission: ApprovalRequestSubmission;
}): Promise<ApprovalSubmissionResult> {
  const payloadHash = canonicalPayloadHash({ submission });
  const requestNo = `APR-${canonicalPayloadHash({
    actorId: actor.id,
    idempotencyKey: submission.idempotencyKey,
  })
    .slice(0, 24)
    .toUpperCase()}`;
  const { data: templateRow, error: templateError } = await service
    .from("workflow_template_versions")
    .select("id,version_number,name,template_snapshot,is_active,department_id")
    .eq("id", submission.templateVersionId)
    .eq("is_active", true)
    .maybeSingle();
  if (templateError) {
    return {
      kind: "dependency_error",
      operation: "template_lookup",
      errorCode: templateError.code || "unknown",
    };
  }
  const template = validTemplateSnapshot(templateRow?.template_snapshot)
    ? {
        ...templateRow.template_snapshot,
        version: templateRow.version_number,
      }
    : null;
  if (!template) return { kind: "invalid_template" };

  const assignedTemplate = applyWorkflowParticipantEmails(
    template,
    submission.participantEmails,
  );
  const task = createApprovalTaskFromTemplate({
    id: requestNo,
    requester: { name: actor.fullName, email: actor.email },
    template: assignedTemplate,
    extractedFields: submission.extractedFields,
  });
  const submissionTask = {
    ...task,
    title: submission.title,
    ...(submission.dueAt ? { dueAt: submission.dueAt } : {}),
    value: submission.valueLabel || task.value,
    auditTrail: [],
    schemaVersion: 1,
  };
  const participantEmails = uniqueNormalizedEmails([
    actor.email,
    ...submissionTask.participants,
    ...(submissionTask.pendingOwners || []),
    submissionTask.currentOwner,
  ]);
  const profiles = await profilesForEmails(service, participantEmails);
  if (profiles.length !== participantEmails.length) {
    return { kind: "invalid_target" };
  }
  if (
    profiles.some(
      (profile) =>
        profile.departmentId &&
        normalizeEmail(profile.departmentName) !== normalizeEmail(template.department),
    )
  ) {
    return { kind: "invalid_target" };
  }
  const profileIdByEmail = new Map(
    profiles.map((profile) => [profile.email.trim().toLowerCase(), profile.id]),
  );
  const currentOwnerId = submissionTask.currentOwner
    ? profileIdByEmail.get(submissionTask.currentOwner.trim().toLowerCase()) || null
    : null;
  if (submissionTask.currentOwner && !currentOwnerId) {
    return { kind: "invalid_target" };
  }
  const pendingOwnerProfileIds = uniqueNormalizedEmails(submissionTask.pendingOwners || [])
    .map((email) => profileIdByEmail.get(email))
    .filter((id): id is string => Boolean(id));
  const notifications = profiles
    .filter((profile) => profile.id !== actor.id)
    .filter((profile) =>
      uniqueNormalizedEmails([
        submissionTask.currentOwner,
        ...(submissionTask.pendingOwners || []),
      ]).includes(profile.email.trim().toLowerCase()),
    )
    .map((profile) => ({
      recipientProfileId: profile.id,
      kind: "assigned",
      title: `Approval request ${requestNo} assigned`,
      body: `${submission.title} is ready for your review.`,
      href: `/?tab=queue&request=${encodeURIComponent(requestNo)}`,
      sendEmail: true,
      templateKey: "approval-assigned",
    }));

  const { data: outcome, error } = await service.rpc("submit_approval_request", {
    p_actor_id: actor.id,
    p_idempotency_key: submission.idempotencyKey,
    p_payload_hash: payloadHash,
    p_request: {
      requestNo,
      templateVersionId: submission.templateVersionId,
      title: submission.title,
      status: submissionTask.status,
      dueLabel: submissionTask.due,
      dueAt: submissionTask.dueAt || "",
      valueLabel: submissionTask.value,
      currentStep: submissionTask.currentStep,
      currentNodeId: submissionTask.currentNodeId || "",
      currentOwnerId,
      pendingNodeIds: submissionTask.pendingNodeIds || [],
      pendingOwnerProfileIds,
      pendingOwnerEmails: submissionTask.pendingOwners || [],
      completedNodeIds: submissionTask.completedNodeIds || [],
      notifiedNodeIds: submissionTask.notifiedNodeIds || [],
      nodeDecisions: submissionTask.nodeDecisions || {},
      activeBranchId: submissionTask.activeBranchId || "",
      extractedFields: submissionTask.extractedFields,
      participants: participantEmails,
      participantProfileIds: profiles.map((profile) => profile.id),
      lastAction: submissionTask.lastAction,
      taskSnapshot: submissionTask,
      attachments: submission.attachments,
    },
    p_notifications: notifications,
  });
  if (error) {
    return {
      kind: "dependency_error",
      operation: "request_submission",
      errorCode: error.code || "unknown",
    };
  }
  const result = outcome as { outcome?: string; requestNo?: string } | null;
  const fresh = result?.requestNo
    ? await safeReload(session, result.requestNo, actor)
    : undefined;
  if (result?.outcome === "idempotency_conflict") {
    return { kind: "idempotency_conflict", ...(fresh ? { request: fresh } : {}) };
  }
  if (result?.outcome === "invalid_template") return { kind: "invalid_template" };
  if (result?.outcome === "invalid_target") return { kind: "invalid_target" };
  if (result?.outcome === "invalid_submission") return { kind: "invalid_submission" };
  if (result?.outcome === "rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: 60 };
  }
  if ((result?.outcome === "applied" || result?.outcome === "replayed") && fresh) {
    return {
      kind: "success",
      replayed: result.outcome === "replayed",
      request: fresh,
    };
  }
  return {
    kind: "dependency_error",
    operation: "submission_result",
    errorCode: "unknown",
  };
}

export async function loadApprovalRequestDetail(
  client: SupabaseClient,
  requestNo: string,
  actor: ApprovalRuntimeProfile,
) {
  const { data, error } = await client
    .from("approval_requests")
    .select(requestColumns)
    .eq("request_no", requestNo)
    .maybeSingle();
  if (error) throw new ApprovalDataError("request_detail", error.code);
  if (!data) return null;
  return loadApprovalRequestDto(client, data as unknown as ApprovalRequestRecord, actor);
}

export async function listApprovalRequests(
  client: SupabaseClient,
  actor: ApprovalRuntimeProfile,
  query: ApprovalRequestListQuery,
) {
  const cursor = decodeCursor(query.cursor);
  const fetchLimit = Math.min(query.limit * (query.view === "inbox" ? 4 : 1), 200);
  let builder = client
    .from("approval_requests")
    .select(requestColumns)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(fetchLimit);
  if (cursor) {
    builder = builder.or(
      `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
    );
  }
  if (query.view === "inbox") {
    builder = builder.in("status", [
      "pending",
      "overdue",
      "escalated",
      "returned",
      "reassigned",
      "delegated",
    ]);
  }
  const { data, error } = await builder;
  if (error) throw new ApprovalDataError("request_list", error.code);

  const rows = (data || []) as unknown as ApprovalRequestRecord[];
  const selected = rows
    .filter((row) => {
      if (query.view !== "inbox") return true;
      return getAvailableApprovalActions(buildCanonicalApprovalTask(row), actor).length > 0;
    })
    .slice(0, query.limit);
  return {
    items: selected.map((row) => requestSummary(row, actor)),
    nextCursor: rows.length === fetchLimit ? encodeCursor(rows.at(-1)) : null,
  };
}

export async function searchApprovalDirectory(
  service: SupabaseClient,
  query: string,
  limit: number,
  cursor?: string,
) {
  const pattern = `%${query}%`;
  const cursorEmail = decodeDirectoryCursor(cursor);
  let builder = service
    .from("profiles")
    .select("id,email,full_name,role,department_id")
    .eq("is_active", true)
    .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    .order("email")
    .limit(limit + 1);
  if (cursorEmail) builder = builder.gt("email", cursorEmail);
  const { data, error } = await builder;
  if (error) throw new ApprovalDataError("directory", error.code);
  const rows = data || [];
  const selected = rows.slice(0, limit);
  const profileIds = selected.map((profile) => profile.id);
  const now = new Date().toISOString();
  const { data: assignments, error: assignmentError } = profileIds.length
    ? await service
        .from("approval_scoped_role_assignments")
        .select("profile_id,role")
        .in("profile_id", profileIds)
        .eq("is_active", true)
        .lte("starts_at", now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
    : { data: [], error: null };
  if (assignmentError) {
    throw new ApprovalDataError("directory_roles", assignmentError.code);
  }
  const rolesByProfile = new Map<string, Set<string>>();
  (assignments || []).forEach((assignment) => {
    const roles = rolesByProfile.get(assignment.profile_id) || new Set<string>();
    roles.add(assignment.role);
    rolesByProfile.set(assignment.profile_id, roles);
  });
  return {
    users: selected.map((profile) => ({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      effectiveRoles: Array.from(
        new Set([
          profile.role,
          ...Array.from(rolesByProfile.get(profile.id) || []),
        ]),
      ),
      departmentId: profile.department_id,
    })),
    nextCursor:
      rows.length > limit && selected.length
        ? Buffer.from(selected.at(-1)!.email, "utf8").toString("base64url")
        : null,
  };
}

export async function executeApprovalCommand({
  session,
  service,
  actor,
  requestNo,
  command,
  correlationId,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  requestNo: string;
  command: ApprovalActionCommand;
  correlationId?: string;
}): Promise<ApprovalCommandResult> {
  let row: ApprovalRequestRecord | null;
  try {
    row = await loadRequestRecord(session, requestNo);
  } catch (error) {
    return dependencyResult(error);
  }
  if (!row) return { kind: "not_found" };

  const payloadHash = canonicalPayloadHash({ requestNo, command });
  const { data: receipt, error: receiptError } = await service
    .from("approval_command_receipts")
    .select("action,payload_hash")
    .eq("approval_request_id", row.id)
    .eq("actor_id", actor.id)
    .eq("idempotency_key", command.idempotencyKey)
    .maybeSingle();
  if (receiptError) {
    return {
      kind: "dependency_error",
      operation: "receipt_lookup",
      errorCode: receiptError.code || "unknown",
    };
  }
  if (receipt) {
    const fresh = await safeReload(session, requestNo, actor);
    if (!fresh) return { kind: "not_found" };
    if (receipt.action !== command.action || receipt.payload_hash !== payloadHash) {
      return { kind: "conflict", code: "idempotency_conflict", request: fresh };
    }
    return { kind: "success", replayed: true, request: fresh };
  }

  const currentDto = await safeDto(session, row, actor);
  if (row.state_version !== command.expectedVersion) {
    return { kind: "conflict", code: "stale_version", request: currentDto };
  }

  const task = buildCanonicalApprovalTask(row);
  const available = getAvailableApprovalActions(task, actor);
  if (!available.includes(command.action)) {
    if (task.status === "approved" || task.status === "cancelled") {
      return { kind: "conflict", code: "already_decided", request: currentDto };
    }
    return { kind: "forbidden" };
  }

  let target: ApprovalRuntimeProfile | undefined;
  if ("targetProfileId" in command) {
    target = await loadActiveProfile(service, command.targetProfileId);
    if (!target) return { kind: "invalid_target" };
    if (!isProfileInTaskScope(target, task)) return { kind: "invalid_target" };
  }

  const transition = computeApprovalTransition({ row, actor, command, target });
  if (!transition) return { kind: "invalid_transition", request: currentDto };

  const currentOwnerId = transition.task.currentOwner
    ? await profileIdForEmail(service, transition.task.currentOwner)
    : null;
  if (transition.task.currentOwner && !currentOwnerId) {
    return { kind: "invalid_target" };
  }
  const recipients = await profilesForEmails(service, transition.notificationEmails);
  if (recipients.length !== transition.notificationEmails.length) {
    return { kind: "invalid_target" };
  }

  const notifications = recipients.map((recipient) => ({
    recipientProfileId: recipient.id,
    kind: command.action,
    title: `Approval request ${requestNo} updated`,
    body: transition.event.summary,
    href: `/?tab=tracking&request=${encodeURIComponent(requestNo)}`,
    sendEmail: true,
    templateKey: "approval-update",
  }));
  const { data: outcome, error: commandError } = await service.rpc(
    "commit_approval_request_command",
    {
      p_request_no: requestNo,
      p_actor_id: actor.id,
      p_idempotency_key: command.idempotencyKey,
      p_action: command.action,
      p_payload_hash: payloadHash,
      p_expected_state_version: command.expectedVersion,
      p_next_state: {
        ...transition.nextState,
        currentOwnerId,
      },
      p_event: {
        ...transition.event,
        details: {
          ...transition.event.details,
          ...(correlationId ? { correlationId } : {}),
        },
      },
      p_notifications: notifications,
    },
  );
  if (commandError) {
    return {
      kind: "dependency_error",
      operation: "command_commit",
      errorCode: commandError.code || "unknown",
    };
  }

  const result = outcome as { outcome?: string } | null;
  if (result?.outcome === "forbidden") return { kind: "forbidden" };
  if (result?.outcome === "invalid_target") return { kind: "invalid_target" };
  if (result?.outcome === "invalid_command") {
    return { kind: "invalid_transition", request: currentDto };
  }
  if (result?.outcome === "rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: 60 };
  }

  const fresh = await safeReload(session, requestNo, actor);
  if (!fresh) return { kind: "not_found" };
  if (result?.outcome === "stale") {
    return { kind: "conflict", code: "stale_version", request: fresh };
  }
  if (result?.outcome === "idempotency_conflict") {
    return { kind: "conflict", code: "idempotency_conflict", request: fresh };
  }
  if (result?.outcome === "applied" || result?.outcome === "replayed") {
    return {
      kind: "success",
      replayed: result.outcome === "replayed",
      request: fresh,
    };
  }
  return { kind: "dependency_error", operation: "command_result", errorCode: "unknown" };
}

export async function executeApprovalCollaborationCommand({
  session,
  service,
  actor,
  requestNo,
  command,
  correlationId,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  requestNo: string;
  command: ApprovalCollaborationCommand;
  correlationId?: string;
}): Promise<ApprovalCommandResult> {
  let row: ApprovalRequestRecord | null;
  try {
    row = await loadRequestRecord(session, requestNo);
  } catch (error) {
    return dependencyResult(error);
  }
  if (!row) return { kind: "not_found" };

  const payloadHash = canonicalPayloadHash({ requestNo, command });
  const expectedReceiptAction =
    command.action === "decide_shared_fulfillment"
      ? command.decision === "confirm"
        ? "confirm_fulfillment"
        : "request_correction"
      : command.action;
  const { data: receipt, error: receiptError } = await service
    .from("approval_command_receipts")
    .select("action,payload_hash")
    .eq("approval_request_id", row.id)
    .eq("actor_id", actor.id)
    .eq("idempotency_key", command.idempotencyKey)
    .maybeSingle();
  if (receiptError) {
    return {
      kind: "dependency_error",
      operation: "receipt_lookup",
      errorCode: receiptError.code || "unknown",
    };
  }
  if (receipt) {
    const fresh = await safeReload(session, requestNo, actor);
    if (!fresh) return { kind: "not_found" };
    if (receipt.action !== expectedReceiptAction || receipt.payload_hash !== payloadHash) {
      return { kind: "conflict", code: "idempotency_conflict", request: fresh };
    }
    return { kind: "success", replayed: true, request: fresh };
  }

  const currentDto = await safeDto(session, row, actor);
  if (row.state_version !== command.expectedVersion) {
    return { kind: "conflict", code: "stale_version", request: currentDto };
  }
  const task = buildCanonicalApprovalTask(row);
  if (task.status === "approved" || task.status === "cancelled") {
    return { kind: "conflict", code: "already_decided", request: currentDto };
  }
  const approvalActor = { name: actor.fullName, email: actor.email };
  const attachmentFor = (
    value: Extract<
      ApprovalCollaborationCommand,
      { action: "submit_contribution" }
    >["attachment"],
  ): ApprovalAttachment => ({
    id: value.key,
    fileName: value.fileName,
    ...(value.documentId ? { documentId: value.documentId } : {}),
    documentType: value.documentType,
    format: value.format,
    ...(value.workflowNodeId ? { workflowNodeId: value.workflowNodeId } : {}),
    storagePath: value.storagePath,
    uploadedBy: actor.email,
    uploadedAt: new Date().toISOString(),
  });

  let nextTask: ApprovalTask;
  let databaseAction:
    | "request_contributor"
    | "submit_contribution"
    | "submit_shared_fulfillment"
    | "confirm_fulfillment"
    | "request_correction"
    | "submit_correction";
  let notificationEvents: Parameters<typeof buildCollaborationNotifications>[0]["event"][] = [];
  let attachment: ApprovalAttachment | undefined;

  if (command.action === "request_contributor") {
    if (!actor.isAdmin && normalizeEmail(task.currentOwner) !== normalizeEmail(actor.email)) {
      return { kind: "forbidden" };
    }
    const target = await loadActiveProfile(service, command.targetProfileId);
    if (!target) return { kind: "invalid_target" };
    if (!isProfileInTaskScope(target, task)) return { kind: "invalid_target" };
    const result = getTaskContributorRequestState({
      task,
      actor: approvalActor,
      contributorEmail: target.email,
      contributorName: command.contributorName || target.fullName,
      requestNote: command.requestNote,
      dueAt: command.dueAt || "",
      blocksApproval: command.blocksApproval,
    });
    if (!result.didApply) return { kind: "invalid_transition", request: currentDto };
    nextTask = result.task;
    databaseAction = "request_contributor";
  } else if (command.action === "submit_contribution") {
    attachment = attachmentFor(command.attachment);
    const result = getTaskContributorUploadState({
      task,
      collaborationRequestId: command.collaborationRequestId,
      actor: approvalActor,
      attachment,
      extractedFields: command.extractedFields,
    });
    if (!result.didApply) return { kind: "forbidden" };
    nextTask = result.task;
    databaseAction = "submit_contribution";
    notificationEvents = [
      { type: "contributor_submitted", collaborationRequestId: command.collaborationRequestId },
    ];
  } else if (command.action === "submit_shared_fulfillment") {
    const assigned = await loadActiveProfile(service, command.assignedSubmitterProfileId);
    if (!assigned) return { kind: "invalid_target" };
    if (!isProfileInTaskScope(assigned, task)) return { kind: "invalid_target" };
    const template = task.workflowTemplateSnapshot;
    const requirementNode = template?.graph?.nodes.find(
      (node) =>
        node.id === command.requirementNodeId && node.kind === "submit_request",
    );
    const document = template?.documents.find(
      (item) =>
        item.id === command.documentId &&
        requirementNode?.documentIds?.includes(item.id),
    );
    const sourceNode = template?.graph?.nodes.find(
      (node) =>
        node.kind === "submit_request" &&
        node.allowSharedFulfillment === true &&
        normalizeEmail(node.assigneeEmail) === normalizeEmail(actor.email),
    );
    if (!requirementNode || !document) return { kind: "invalid_transition", request: currentDto };
    if (normalizeEmail(requirementNode.assigneeEmail) !== normalizeEmail(assigned.email)) {
      return { kind: "invalid_target" };
    }
    if (!actor.isAdmin && !sourceNode) return { kind: "forbidden" };
    if (
      command.attachment.documentId !== document.id ||
      command.attachment.workflowNodeId !== requirementNode.id
    ) {
      return { kind: "invalid_transition", request: currentDto };
    }
    attachment = attachmentFor(command.attachment);
    const result = getTaskSharedFulfillmentSubmitState({
      task,
      actor: approvalActor,
      attachment,
      requirementNodeId: command.requirementNodeId,
      documentId: command.documentId,
      documentType: document.documentType,
      assignedSubmitterEmail: assigned.email,
      assignedSubmitterName: assigned.fullName,
      required: document.required,
      requiresConfirmation:
        sourceNode?.requireSharedFulfillmentConfirmation !== false,
      extractedFields: command.extractedFields,
    });
    nextTask = result.task;
    databaseAction = "submit_shared_fulfillment";
    const fulfillmentId = nextTask.sharedFulfillments?.at(-1)?.id;
    notificationEvents = fulfillmentId
      ? [{ type: "shared_pending_confirmation", fulfillmentId }]
      : [];
  } else if (command.action === "decide_shared_fulfillment") {
    const result = getTaskSharedFulfillmentDecisionState({
      task,
      fulfillmentId: command.fulfillmentId,
      actor: approvalActor,
      currentOwnerEmail: task.currentOwner,
      decision: command.decision,
      note: command.note,
    });
    if (!result.didApply) return { kind: "forbidden" };
    nextTask = result.task;
    databaseAction = command.decision === "confirm" ? "confirm_fulfillment" : "request_correction";
    notificationEvents = [
      {
        type: command.decision === "confirm" ? "shared_confirmed" : "shared_rejected",
        fulfillmentId: command.fulfillmentId,
      },
    ];
    const correctionId = nextTask.sharedFulfillments?.find(
      (item) => item.id === command.fulfillmentId,
    )?.correctionRequestId;
    if (correctionId) {
      notificationEvents.push({ type: "correction_created", correctionRequestId: correctionId });
    }
  } else {
    attachment = attachmentFor(command.attachment);
    const result = getTaskCorrectionUploadState({
      task,
      correctionRequestId: command.correctionRequestId,
      actor: approvalActor,
      attachment,
      extractedFields: command.extractedFields,
    });
    if (!result.didApply) return { kind: "forbidden" };
    nextTask = result.task;
    databaseAction = "submit_correction";
    notificationEvents = [
      { type: "correction_resolved", correctionRequestId: command.correctionRequestId },
    ];
    const fulfillmentId = nextTask.correctionRequests?.find(
      (item) => item.id === command.correctionRequestId,
    )?.resolvedByFulfillmentId;
    if (fulfillmentId) {
      notificationEvents.push({ type: "shared_pending_confirmation", fulfillmentId });
    }
  }

  const taskNotifications = notificationEvents.flatMap((event) =>
    buildCollaborationNotifications({ task: nextTask, event }),
  );
  if (command.action === "request_contributor") {
    const request = nextTask.collaborationRequests?.at(-1);
    if (request) {
      taskNotifications.push({
        id: `${request.id}-assigned`,
        title: "Contributor input requested",
        body: request.requestNote,
        time: nextTask.due,
        unread: true,
        requestId: requestNo,
        recipientEmail: request.contributorEmail,
        kind: "collaboration_update",
      });
    }
  }
  const recipientEmails = uniqueNormalizedEmails(
    taskNotifications.map((notification) => notification.recipientEmail),
  );
  const recipients = await profilesForEmails(service, recipientEmails);
  if (recipients.length !== recipientEmails.length) return { kind: "invalid_target" };
  const recipientByEmail = new Map(
    recipients.map((recipient) => [normalizeEmail(recipient.email), recipient]),
  );
  const notifications = taskNotifications
    .filter(
      (notification, index, values) =>
        values.findIndex(
          (candidate) =>
            normalizeEmail(candidate.recipientEmail) ===
              normalizeEmail(notification.recipientEmail) &&
            candidate.title === notification.title,
        ) === index,
    )
    .map((notification) => ({
      recipientProfileId: recipientByEmail.get(normalizeEmail(notification.recipientEmail))?.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: `/?tab=tracking&request=${encodeURIComponent(requestNo)}`,
      sendEmail: true,
      templateKey: "approval-collaboration",
    }));
  if (notifications.some((notification) => !notification.recipientProfileId)) {
    return { kind: "invalid_target" };
  }
  const event = nextTask.auditTrail.slice(task.auditTrail.length).at(-1);
  if (!event) return { kind: "invalid_transition", request: currentDto };
  const snapshot: ApprovalTask & { schemaVersion: number } = {
    ...nextTask,
    auditTrail: task.auditTrail,
    schemaVersion: 1,
  };
  const { data: outcome, error: commandError } = await service.rpc(
    "commit_approval_request_command",
    {
      p_request_no: requestNo,
      p_actor_id: actor.id,
      p_idempotency_key: command.idempotencyKey,
      p_action: databaseAction,
      p_payload_hash: payloadHash,
      p_expected_state_version: command.expectedVersion,
      p_next_state: {
        extractedFields: nextTask.extractedFields,
        lastAction: nextTask.lastAction,
        participants: nextTask.participants,
        taskSnapshot: snapshot,
        collaborationState: {
          collaborationRequests: nextTask.collaborationRequests || [],
          sharedFulfillments: nextTask.sharedFulfillments || [],
          correctionRequests: nextTask.correctionRequests || [],
          ...(attachment
            ? {
                attachment: {
                  key: attachment.id,
                  fileName: attachment.fileName,
                  documentId: attachment.documentId || "",
                  documentType: attachment.documentType,
                  format: attachment.format,
                  workflowNodeId: attachment.workflowNodeId || "",
                  storagePath: attachment.storagePath,
                },
              }
            : {}),
        },
      },
      p_event: {
        action: event.action,
        type: databaseAction,
        summary: event.detail,
        details: { collaborationAction: command.action, correlationId },
      },
      p_notifications: notifications,
    },
  );
  if (commandError) {
    return {
      kind: "dependency_error",
      operation: "collaboration_commit",
      errorCode: commandError.code || "unknown",
    };
  }
  const result = outcome as { outcome?: string } | null;
  const fresh = await safeReload(session, requestNo, actor);
  if (!fresh) return { kind: "not_found" };
  if (result?.outcome === "stale") {
    return { kind: "conflict", code: "stale_version", request: fresh };
  }
  if (result?.outcome === "idempotency_conflict") {
    return { kind: "conflict", code: "idempotency_conflict", request: fresh };
  }
  if (result?.outcome === "rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: 60 };
  }
  if (result?.outcome === "forbidden") return { kind: "forbidden" };
  if (result?.outcome === "invalid_target") return { kind: "invalid_target" };
  if (result?.outcome === "applied" || result?.outcome === "replayed") {
    return { kind: "success", replayed: result.outcome === "replayed", request: fresh };
  }
  return { kind: "dependency_error", operation: "collaboration_result", errorCode: "unknown" };
}

async function loadRequestRecord(client: SupabaseClient, requestNo: string) {
  const { data, error } = await client
    .from("approval_requests")
    .select(requestColumns)
    .eq("request_no", requestNo)
    .maybeSingle();
  if (error) throw new ApprovalDataError("request_lookup", error.code);
  return data ? (data as unknown as ApprovalRequestRecord) : null;
}

async function loadApprovalRequestDto(
  client: SupabaseClient,
  row: ApprovalRequestRecord,
  actor: ApprovalRuntimeProfile,
) {
  const [{ data: events, error: eventsError }, { data: attachments, error: attachmentsError }] =
    await Promise.all([
      client
        .from("approval_request_events")
        .select(
          "id,event_key,command_id,request_version,action,event_type,actor_id,actor_name,actor_email,detail,details,target_id,target_email,created_at",
        )
        .eq("approval_request_id", row.id)
        .order("created_at"),
      client
        .from("approval_request_attachments")
        .select(
          "id,attachment_key,file_name,document_id,document_type,document_format,workflow_node_id,uploaded_by_email,created_at",
        )
        .eq("approval_request_id", row.id)
        .order("created_at"),
    ]);
  if (eventsError) throw new ApprovalDataError("request_events", eventsError.code);
  if (attachmentsError) throw new ApprovalDataError("request_attachments", attachmentsError.code);
  return requestDto(
    row,
    actor,
    (events || []) as unknown as EventRecord[],
    (attachments || []) as unknown as AttachmentRecord[],
  );
}

function requestDto(
  row: ApprovalRequestRecord,
  actor: ApprovalRuntimeProfile,
  events: EventRecord[],
  attachments: AttachmentRecord[],
) {
  const task = buildCanonicalApprovalTask(row);
  return {
    requestNo: row.request_no,
    version: row.state_version,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    task: { ...task, auditTrail: undefined, attachments: undefined },
    events: events.map((event) => ({
      id: event.id,
      key: event.event_key,
      commandId: event.command_id,
      requestVersion: event.request_version,
      action: event.action,
      type: event.event_type,
      actor: { id: event.actor_id, name: event.actor_name, email: event.actor_email },
      detail: event.detail,
      details: event.details,
      target: event.target_id
        ? { id: event.target_id, email: event.target_email }
        : null,
      createdAt: event.created_at,
    })),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      key: attachment.attachment_key,
      fileName: attachment.file_name,
      documentId: attachment.document_id,
      documentType: attachment.document_type,
      format: attachment.document_format,
      workflowNodeId: attachment.workflow_node_id,
      uploadedByEmail: attachment.uploaded_by_email,
      createdAt: attachment.created_at,
    })),
    availableActions: getAvailableApprovalActions(task, actor),
  };
}

function requestSummary(row: ApprovalRequestRecord, actor: ApprovalRuntimeProfile) {
  const task = buildCanonicalApprovalTask(row);
  return {
    requestNo: row.request_no,
    version: row.state_version,
    title: row.title,
    workflow: row.workflow_name,
    status: row.status,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    currentStep: row.current_step,
    currentOwnerEmail: row.current_owner_email,
    dueAt: row.due_at,
    dueLabel: row.due_label,
    lastAction: row.last_action,
    updatedAt: row.updated_at,
    task: { ...task, auditTrail: undefined, attachments: undefined },
    availableActions: getAvailableApprovalActions(task, actor),
  };
}

async function loadActiveProfile(service: SupabaseClient, id: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id,email,full_name,role,is_admin,is_active,department_id,departments(name)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return undefined;
  const department = Array.isArray(data.departments)
    ? data.departments[0]
    : data.departments;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    isAdmin: data.is_admin,
    isActive: data.is_active,
    departmentId: data.department_id,
    departmentName: department?.name || null,
    businessUnitId: null,
    businessName: null,
  } satisfies ApprovalRuntimeProfile;
}

function isProfileInTaskScope(
  profile: ApprovalRuntimeProfile,
  task: ApprovalTask,
) {
  if (!profile.departmentId) return true;
  if (normalizeEmail(profile.departmentName) !== normalizeEmail(task.department)) {
    return false;
  }
  const taskBusiness = task.workflowTemplateSnapshot?.business;
  return (
    !taskBusiness ||
    !profile.businessName ||
    normalizeEmail(profile.businessName) === normalizeEmail(taskBusiness)
  );
}

async function profileIdForEmail(service: SupabaseClient, email: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .eq("is_active", true)
    .maybeSingle();
  return error ? null : data?.id || null;
}

async function profilesForEmails(service: SupabaseClient, emails: string[]) {
  if (!emails.length) return [];
  const results = await Promise.all(
    emails.map(async (email) => {
      const { data, error } = await service
        .from("profiles")
        .select("id,email,department_id,departments(name)")
        .ilike("email", email)
        .eq("is_active", true)
        .maybeSingle();
      return error ? null : data;
    }),
  );
  return results
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .map((value) => ({
      id: value.id,
      email: value.email,
      departmentId: value.department_id,
      departmentName: value.departments?.[0]?.name || null,
    }));
}

async function safeDto(
  session: SupabaseClient,
  row: ApprovalRequestRecord,
  actor: ApprovalRuntimeProfile,
) {
  try {
    return await loadApprovalRequestDto(session, row, actor);
  } catch {
    return requestDto(row, actor, [], []);
  }
}

async function safeReload(
  session: SupabaseClient,
  requestNo: string,
  actor: ApprovalRuntimeProfile,
) {
  try {
    return await loadApprovalRequestDetail(session, requestNo, actor);
  } catch {
    return null;
  }
}

function dependencyResult(error: unknown): ApprovalCommandResult {
  return error instanceof ApprovalDataError
    ? { kind: "dependency_error", operation: error.operation, errorCode: error.code }
    : { kind: "dependency_error", operation: "unknown", errorCode: "unknown" };
}

function validTemplateSnapshot(value: unknown): value is WorkflowTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const template = value as Partial<WorkflowTemplate>;
  return Boolean(
    template.id &&
      template.name &&
      typeof template.business === "string" &&
      typeof template.department === "string" &&
      Array.isArray(template.documentTypes) &&
      Array.isArray(template.documents) &&
      Array.isArray(template.languages) &&
      Array.isArray(template.fields) &&
      Array.isArray(template.steps),
  );
}

function uniqueNormalizedEmails(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function encodeCursor(row?: ApprovalRequestRecord) {
  if (!row) return null;
  return Buffer.from(
    JSON.stringify({ updatedAt: row.updated_at, id: row.id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    return typeof parsed.updatedAt === "string" && typeof parsed.id === "string"
      ? { updatedAt: parsed.updatedAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function decodeDirectoryCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const email = Buffer.from(cursor, "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

class ApprovalDataError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
  ) {
    super(`${operation} failed`);
  }
}
