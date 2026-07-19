import type { ApprovalCollaborationCommand } from "./approval-collaboration-contracts.ts";
import {
  ApprovalApiError,
  canonicalDtoToTask,
  resolveDirectoryProfileId,
  type CanonicalRequestDto,
} from "./approval-client.ts";
import type { ApprovalAttachment, ApprovalTask } from "./types.ts";

export type ClientCollaborationIntent =
  | {
      action: "request_contributor";
      targetEmail: string;
      contributorName?: string;
      requestNote: string;
      dueAt?: string;
      blocksApproval: boolean;
    }
  | {
      action: "submit_contribution";
      collaborationRequestId: string;
      attachment: ApprovalAttachment;
      extractedFields: Record<string, string>;
    }
  | {
      action: "submit_shared_fulfillment";
      requirementNodeId: string;
      documentId: string;
      assignedSubmitterEmail: string;
      attachment: ApprovalAttachment;
      extractedFields: Record<string, string>;
    }
  | {
      action: "decide_shared_fulfillment";
      fulfillmentId: string;
      decision: "confirm" | "reject";
      note?: string;
    }
  | {
      action: "submit_correction";
      correctionRequestId: string;
      attachment: ApprovalAttachment;
      extractedFields: Record<string, string>;
    };

export async function executeCanonicalCollaborationAction({
  task,
  intent,
  idempotencyKey,
}: {
  task: ApprovalTask;
  intent: ClientCollaborationIntent;
  idempotencyKey: string;
}) {
  if (!Number.isInteger(task.stateVersion)) {
    throw new ApprovalApiError(
      "Refresh this request before changing collaboration state.",
      409,
      "stale_version",
    );
  }
  const command = await buildCommand(intent, Number(task.stateVersion), idempotencyKey);
  const response = await fetch(
    `/api/approval-requests/${encodeURIComponent(task.id)}/collaboration`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    },
  );
  const payload = (await safeJson(response)) as {
    outcome?: "applied" | "replayed";
    request?: CanonicalRequestDto;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.request) {
    throw new ApprovalApiError(
      payload.error?.message || "The collaboration service is unavailable.",
      response.status,
      payload.error?.code || "dependency_unavailable",
      payload.request ? canonicalDtoToTask(payload.request) : undefined,
    );
  }
  return {
    outcome: payload.outcome || "applied",
    task: canonicalDtoToTask(payload.request),
  };
}

async function buildCommand(
  intent: ClientCollaborationIntent,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<ApprovalCollaborationCommand> {
  const base = { expectedVersion, idempotencyKey };
  if (intent.action === "request_contributor") {
    return {
      ...base,
      action: intent.action,
      targetProfileId: await resolveDirectoryProfileId(intent.targetEmail),
      ...(intent.contributorName ? { contributorName: intent.contributorName } : {}),
      requestNote: intent.requestNote,
      ...(intent.dueAt ? { dueAt: new Date(intent.dueAt).toISOString() } : {}),
      blocksApproval: intent.blocksApproval,
    };
  }
  if (intent.action === "submit_shared_fulfillment") {
    return {
      ...base,
      action: intent.action,
      requirementNodeId: intent.requirementNodeId,
      documentId: intent.documentId,
      assignedSubmitterProfileId: await resolveDirectoryProfileId(
        intent.assignedSubmitterEmail,
      ),
      attachment: attachmentCommand(intent.attachment),
      extractedFields: intent.extractedFields,
    };
  }
  if (intent.action === "submit_contribution") {
    return {
      ...base,
      action: intent.action,
      collaborationRequestId: intent.collaborationRequestId,
      attachment: attachmentCommand(intent.attachment),
      extractedFields: intent.extractedFields,
    };
  }
  if (intent.action === "submit_correction") {
    return {
      ...base,
      action: intent.action,
      correctionRequestId: intent.correctionRequestId,
      attachment: attachmentCommand(intent.attachment),
      extractedFields: intent.extractedFields,
    };
  }
  return { ...base, ...intent };
}

function attachmentCommand(attachment: ApprovalAttachment) {
  return {
    key: attachment.id,
    fileName: attachment.fileName,
    ...(attachment.documentId ? { documentId: attachment.documentId } : {}),
    documentType: attachment.documentType,
    format: attachment.format,
    ...(attachment.workflowNodeId
      ? { workflowNodeId: attachment.workflowNodeId }
      : {}),
    storagePath: attachment.storagePath || "",
  };
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return {};
  }
}
