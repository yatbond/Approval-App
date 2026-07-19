import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalPayloadHash,
  type ApprovalActionCommand,
  type ApprovalRequestListQuery,
  type ApprovalRequestSubmission,
} from "./approval-api-contracts.ts";
import {
  buildCanonicalApprovalTask,
  computeApprovalTransition,
  getAvailableApprovalActions,
  type ApprovalRequestRecord,
  type ApprovalRuntimeProfile,
} from "./approval-runtime.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import type { WorkflowTemplate } from "./types.ts";
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
    .select("id,version_number,name,template_snapshot,is_active")
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
) {
  const pattern = `%${query}%`;
  const { data, error } = await service
    .from("profiles")
    .select("id,email,full_name,role,department_id")
    .eq("is_active", true)
    .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    .order("full_name")
    .limit(limit);
  if (error) throw new ApprovalDataError("directory", error.code);
  return (data || []).map((profile) => ({
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    departmentId: profile.department_id,
  }));
}

export async function executeApprovalCommand({
  session,
  service,
  actor,
  requestNo,
  command,
}: {
  session: SupabaseClient;
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  requestNo: string;
  command: ApprovalActionCommand;
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
      p_event: transition.event,
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
    .select("id,email,full_name,role,is_admin,is_active")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return undefined;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    isAdmin: data.is_admin,
    isActive: data.is_active,
  } satisfies ApprovalRuntimeProfile;
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
        .select("id,email")
        .ilike("email", email)
        .eq("is_active", true)
        .maybeSingle();
      return error ? null : data;
    }),
  );
  return results.filter((value): value is { id: string; email: string } => Boolean(value));
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

class ApprovalDataError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string,
  ) {
    super(`${operation} failed`);
  }
}
