import type { NextRequest } from "next/server";
import { approvalActionCommandSchema } from "@/lib/approval-api-contracts";
import { executeApprovalCommand } from "@/lib/approval-server-data";
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
  if (!requestNo || requestNo.length > 100) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request number is invalid." } },
      400,
    );
  }

  const body = await readBoundedJson(request, 24_000);
  const parsed = body.ok ? approvalActionCommandSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The approval action is invalid." } },
      400,
    );
  }

  const startedAt = Date.now();
  const result = await executeApprovalCommand({
    session,
    service,
    actor,
    requestNo,
    command: parsed.data,
  });
  safeApprovalLog("approval_command", correlationId, {
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
  if (result.kind === "not_found") {
    return error(cookieSource, correlationId, 404, "request_not_found", "Approval request not found.");
  }
  if (result.kind === "forbidden") {
    return error(cookieSource, correlationId, 403, "forbidden", "You cannot perform this action.");
  }
  if (result.kind === "invalid_target") {
    return error(
      cookieSource,
      correlationId,
      422,
      "invalid_target",
      "The selected user is unavailable or inactive.",
    );
  }
  if (result.kind === "invalid_transition") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: { code: "invalid_transition", message: "This transition is not valid." },
        request: result.request,
      },
      400,
    );
  }
  if (result.kind === "rate_limited") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "rate_limited",
          message: "Too many approval actions. Wait briefly and try again.",
        },
        retryAfterSeconds: result.retryAfterSeconds,
      },
      429,
    );
  }
  if (result.kind === "conflict") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: result.code,
          message:
            result.code === "stale_version"
              ? "This request changed. Review the latest version and try again."
              : result.code === "idempotency_conflict"
                ? "That retry key was already used for a different action."
                : "This request has already been decided.",
        },
        request: result.request,
      },
      409,
    );
  }
  return error(
    cookieSource,
    correlationId,
    503,
    "dependency_unavailable",
    "The action could not be completed. No partial change was committed.",
  );
}

async function readBoundedJson(request: NextRequest, maxBytes: number) {
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > maxBytes) return { ok: false as const };
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const };
  }
}

function error(
  cookieSource: Parameters<typeof approvalJson>[0],
  correlationId: string,
  status: number,
  code: string,
  message: string,
) {
  return approvalJson(cookieSource, correlationId, { error: { code, message } }, status);
}
