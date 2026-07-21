import type {
  ApprovalAction,
  ApprovalAttachment,
  ApprovalTask,
  AuditEvent,
} from "./types.ts";

export type CanonicalRequestDto = {
  requestNo: string;
  version: number;
  task: ApprovalTask;
  events: Array<{
    id: string;
    action: AuditEvent["action"];
    actor: { name: string; email: string };
    detail: string;
    target: { email: string | null } | null;
    createdAt: string;
  }>;
  attachments: Array<{
    key: string;
    fileName: string;
    documentId: string | null;
    documentType: string;
    format: ApprovalAttachment["format"];
    workflowNodeId: string | null;
    uploadedByEmail: string;
    createdAt: string;
  }>;
  availableActions: ApprovalAction[];
};

type ApprovalApiErrorBody = {
  error?: { code?: string; message?: string };
  request?: CanonicalRequestDto;
};

type CanonicalRequestSummary = {
  requestNo: string;
  version: number;
  task: ApprovalTask;
  availableActions: ApprovalAction[];
};

export class ApprovalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly canonicalTask?: ApprovalTask;

  constructor(
    message: string,
    status: number,
    code: string,
    canonicalTask?: ApprovalTask,
  ) {
    super(message);
    this.name = "ApprovalApiError";
    this.status = status;
    this.code = code;
    this.canonicalTask = canonicalTask;
  }
}

export async function loadCanonicalApprovalMe() {
  const response = await fetch("/api/me", { cache: "no-store" });
  const payload = (await safeJson(response)) as {
    profile?: {
      email: string;
      fullName: string;
      role: string;
      isAdmin: boolean;
      isActive: boolean;
    };
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.profile) throw apiError(response, payload);
  return payload.profile;
}

export async function loadCanonicalApprovalRequests({
  view,
  cursor,
  limit = 50,
}: {
  view: "inbox" | "tracking" | "all";
  cursor?: string;
  limit?: number;
}) {
  const query = new URLSearchParams({ view, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/approval-requests?${query}`, {
    cache: "no-store",
  });
  const payload = (await safeJson(response)) as {
    items?: CanonicalRequestSummary[];
    nextCursor?: string | null;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) throw apiError(response, payload);
  return {
    items: payload.items || [],
    nextCursor: payload.nextCursor || null,
  };
}

export async function loadCanonicalApprovalTasks(view: "inbox" | "tracking" | "all") {
  const tasks: ApprovalTask[] = [];
  let cursor: string | undefined;
  do {
    const page = await loadCanonicalApprovalRequests({ view, cursor, limit: 50 });
    tasks.push(
      ...page.items.map((item) => ({
        ...item.task,
        id: item.requestNo,
        stateVersion: item.version,
        availableActions: item.availableActions,
        auditTrail: [],
        attachments: [],
      })),
    );
    cursor = page.nextCursor || undefined;
  } while (cursor && tasks.length < 500);
  return tasks;
}

export async function loadCanonicalApprovalRequest(requestNo: string) {
  const response = await fetch(
    `/api/approval-requests/${encodeURIComponent(requestNo)}`,
    { cache: "no-store" },
  );
  const payload = (await safeJson(response)) as {
    request?: CanonicalRequestDto;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.request) throw apiError(response, payload);
  return canonicalDtoToTask(payload.request);
}

export async function executeCanonicalApprovalAction({
  task,
  action,
  idempotencyKey,
  comment,
  targetEmail,
  returnTargetNodeIds,
}: {
  task: ApprovalTask;
  action: ApprovalAction;
  idempotencyKey: string;
  comment?: string;
  targetEmail?: string;
  returnTargetNodeIds?: string[];
}) {
  if (!Number.isInteger(task.stateVersion) || Number(task.stateVersion) < 0) {
    throw new ApprovalApiError(
      "Refresh this request before taking action.",
      409,
      "stale_version",
    );
  }
  let targetProfileId: string | undefined;
  if (action === "reassign" || action === "delegate") {
    targetProfileId = await resolveDirectoryProfileId(targetEmail || "");
  }
  const body = {
    action,
    expectedVersion: task.stateVersion,
    idempotencyKey,
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
    ...(targetProfileId ? { targetProfileId } : {}),
    ...(action === "reject" || action === "reject_with_comment"
      ? { returnTargetNodeIds: returnTargetNodeIds || [] }
      : {}),
    ...(action === "amend_resubmit" ? { fieldUpdates: task.extractedFields } : {}),
  };
  const response = await fetch(
    `/api/approval-requests/${encodeURIComponent(task.id)}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await safeJson(response)) as ApprovalApiErrorBody & {
    outcome?: "applied" | "replayed";
  };
  if (!response.ok || !payload.request) throw apiError(response, payload);
  return {
    outcome: payload.outcome || "applied",
    task: canonicalDtoToTask(payload.request),
  };
}

export async function submitCanonicalApprovalRequest({
  templateVersionId,
  title,
  valueLabel,
  extractedFields,
  participantEmails = {},
  attachments = [],
  idempotencyKey,
}: {
  templateVersionId: string;
  title: string;
  valueLabel?: string;
  extractedFields: Record<string, string>;
  participantEmails?: Record<string, string>;
  attachments?: ApprovalAttachment[];
  idempotencyKey: string;
}) {
  const response = await fetch("/api/approval-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateVersionId,
      title,
      valueLabel: valueLabel || "",
      extractedFields,
      participantEmails,
      attachments: attachments.map((attachment) => ({
        fileName: attachment.fileName,
        ...(attachment.documentId ? { documentId: attachment.documentId } : {}),
        documentType: attachment.documentType,
        format: attachment.format,
        ...(attachment.workflowNodeId
          ? { workflowNodeId: attachment.workflowNodeId }
          : {}),
        storagePath: attachment.storagePath || "",
      })),
      idempotencyKey,
    }),
  });
  const payload = (await safeJson(response)) as ApprovalApiErrorBody & {
    outcome?: "applied" | "replayed";
  };
  if (!response.ok || !payload.request) throw apiError(response, payload);
  return {
    outcome: payload.outcome || "applied",
    task: canonicalDtoToTask(payload.request),
  };
}

export function canonicalDtoToTask(dto: CanonicalRequestDto): ApprovalTask {
  return {
    ...dto.task,
    id: dto.requestNo,
    stateVersion: dto.version,
    availableActions: dto.availableActions,
    auditTrail: dto.events.map((event) => ({
      id: event.id,
      action: event.action,
      actor: event.actor.name,
      actorEmail: event.actor.email,
      timestamp: event.createdAt,
      detail: event.detail,
      ...(event.target?.email ? { targetEmail: event.target.email } : {}),
    })),
    attachments: dto.attachments.map((attachment) => ({
      id: attachment.key,
      fileName: attachment.fileName,
      ...(attachment.documentId ? { documentId: attachment.documentId } : {}),
      documentType: attachment.documentType,
      format: attachment.format,
      ...(attachment.workflowNodeId
        ? { workflowNodeId: attachment.workflowNodeId }
        : {}),
      uploadedBy: attachment.uploadedByEmail,
      uploadedAt: attachment.createdAt,
    })),
  };
}

export async function resolveDirectoryProfileId(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new ApprovalApiError("Choose an active user.", 422, "invalid_target");
  }
  const query = new URLSearchParams({ query: normalized, limit: "20" });
  const response = await fetch(`/api/directory?${query}`, { cache: "no-store" });
  const payload = (await safeJson(response)) as {
    users?: Array<{ id: string; email: string }>;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) throw apiError(response, payload);
  const exact = payload.users?.find(
    (user) => user.email.trim().toLowerCase() === normalized,
  );
  if (!exact) {
    throw new ApprovalApiError(
      "The selected user is unavailable or inactive.",
      422,
      "invalid_target",
    );
  }
  return exact.id;
}

export async function validateActiveDirectoryEmails(emails: string[]) {
  const unique = Array.from(
    new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
  if (unique.length > 100) {
    throw new ApprovalApiError(
      "A workflow cannot contain more than 100 fixed directory assignments.",
      422,
      "invalid_target",
    );
  }
  for (let offset = 0; offset < unique.length; offset += 5) {
    await Promise.all(unique.slice(offset, offset + 5).map(resolveDirectoryProfileId));
  }
}

function apiError(response: Response, payload: ApprovalApiErrorBody) {
  const code = payload.error?.code || "dependency_unavailable";
  const message = payload.error?.message || "The approval service is unavailable.";
  return new ApprovalApiError(
    message,
    response.status,
    code,
    payload.request ? canonicalDtoToTask(payload.request) : undefined,
  );
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
}
