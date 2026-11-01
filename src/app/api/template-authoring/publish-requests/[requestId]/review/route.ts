import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { reviewTemplatePublishCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { reviewTemplateAuthoringPublish } from "@/lib/template-authoring-server-data";

export async function POST(
  request: NextRequest,
  context: RouteContext<
    "/api/template-authoring/publish-requests/[requestId]/review"
  >,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const { requestId } = await context.params;
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok
    ? reviewTemplatePublishCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The review is invalid." } },
      400,
    );
  }
  try {
    const result = await reviewTemplateAuthoringPublish({
      service,
      actor,
      publishRequestId: requestId,
      command: parsed.data,
    });
    safeApprovalLog("template_publish_review", correlationId, {
      outcome: String(result.outcome || "unknown"),
      decision: parsed.data.decision,
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch (error) {
    safeApprovalLog("template_publish_review_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The publication review could not be saved.",
        },
      },
      503,
    );
  }
}
