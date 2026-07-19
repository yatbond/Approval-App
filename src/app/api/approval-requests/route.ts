import type { NextRequest } from "next/server";
import {
  approvalRequestListQuerySchema,
  approvalRequestSubmissionSchema,
} from "@/lib/approval-api-contracts";
import {
  listApprovalRequests,
  submitApprovalRequest,
} from "@/lib/approval-server-data";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { getApprovalRolloutDecision } from "@/lib/approval-rollout";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, actor, cookieSource, correlationId } = resolved.context;
  const parsed = approvalRequestListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request list query is invalid." } },
      400,
    );
  }
  try {
    const result = await listApprovalRequests(session, actor, parsed.data);
    return approvalJson(cookieSource, correlationId, result);
  } catch (error) {
    safeApprovalLog("request_list_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "Approval requests are temporarily unavailable.",
        },
      },
      503,
    );
  }
}

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const rollout = await getApprovalRolloutDecision(service, actor.id);
  if (!rollout.commandEnabled) {
    return approvalJson(cookieSource, correlationId, {
      error: { code: "cutover_paused", message: "Approval changes are temporarily paused during a controlled rollout." },
      rollout: { mode: rollout.mode },
    }, 503);
  }
  const body = await readBoundedJson(request, 64_000);
  if (!body.ok) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request submission is invalid." } },
      400,
    );
  }
  const parsed = approvalRequestSubmissionSchema.safeParse(body.value);
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request submission is invalid." } },
      400,
    );
  }

  const result = await submitApprovalRequest({
    session,
    service,
    actor,
    submission: parsed.data,
  });
  safeApprovalLog("approval_request_submission", correlationId, {
    outcome: result.kind,
  });
  if (result.kind === "success") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        outcome: result.replayed ? "replayed" : "applied",
        request: result.request,
      },
      result.replayed ? 200 : 201,
    );
  }
  if (result.kind === "idempotency_conflict") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "idempotency_conflict",
          message: "That retry key was already used for a different submission.",
        },
        ...(result.request ? { request: result.request } : {}),
      },
      409,
    );
  }
  if (result.kind === "invalid_template") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "business_precondition_failed",
          message: "The selected workflow version is unavailable.",
        },
      },
      422,
    );
  }
  if (result.kind === "invalid_target") {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_target",
          message: "One or more workflow participants are unavailable or inactive.",
        },
      },
      422,
    );
  }
  if (result.kind === "invalid_submission") {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request submission is invalid." } },
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
          message: "Too many submissions. Wait briefly and try again.",
        },
        retryAfterSeconds: result.retryAfterSeconds,
      },
      429,
    );
  }
  return approvalJson(
    cookieSource,
    correlationId,
    {
      error: {
        code: "dependency_unavailable",
        message: "The request could not be submitted. No partial request was created.",
      },
    },
    503,
  );
}
