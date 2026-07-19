import type { NextRequest } from "next/server";
import { approvalCollaborationCommandSchema } from "@/lib/approval-collaboration-contracts";
import { executeApprovalCollaborationCommand } from "@/lib/approval-server-data";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestNo: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const { requestNo: rawRequestNo } = await context.params;
  const requestNo = rawRequestNo.trim();
  const text = await request.text().catch(() => "");
  const parsed =
    requestNo && requestNo.length <= 100 && Buffer.byteLength(text) <= 40_000
      ? approvalCollaborationCommandSchema.safeParse(safeJson(text))
      : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The collaboration action is invalid." } },
      400,
    );
  }

  const startedAt = Date.now();
  const result = await executeApprovalCollaborationCommand({
    session,
    service,
    actor,
    requestNo,
    command: parsed.data,
    correlationId,
  });
  safeApprovalLog("approval_collaboration_command", correlationId, {
    requestNo,
    action: parsed.data.action,
    outcome: result.kind,
    durationMs: Date.now() - startedAt,
  });
  if (result.kind === "success") {
    return approvalJson(cookieSource, correlationId, {
      outcome: result.replayed ? "replayed" : "applied",
      request: result.request,
    });
  }
  if (result.kind === "not_found") return failure(404, "request_not_found", "Approval request not found.");
  if (result.kind === "forbidden") return failure(403, "forbidden", "You cannot perform this collaboration action.");
  if (result.kind === "invalid_target") return failure(422, "invalid_target", "The selected user is unavailable or inactive.");
  if (result.kind === "invalid_transition") {
    return approvalJson(cookieSource, correlationId, {
      error: { code: "invalid_transition", message: "This collaboration transition is not valid." },
      request: result.request,
    }, 400);
  }
  if (result.kind === "rate_limited") {
    return approvalJson(cookieSource, correlationId, {
      error: { code: "rate_limited", message: "Too many collaboration actions. Wait briefly and retry." },
      retryAfterSeconds: result.retryAfterSeconds,
    }, 429);
  }
  if (result.kind === "conflict") {
    return approvalJson(cookieSource, correlationId, {
      error: {
        code: result.code,
        message: result.code === "stale_version"
          ? "This request changed. Review the latest version and retry."
          : result.code === "idempotency_conflict"
            ? "That retry key was already used for a different collaboration action."
            : "This request has already been decided.",
      },
      request: result.request,
    }, 409);
  }
  return failure(503, "dependency_unavailable", "The collaboration action could not be completed. No partial change was committed.");

  function failure(status: number, code: string, message: string) {
    return approvalJson(cookieSource, correlationId, { error: { code, message } }, status);
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
