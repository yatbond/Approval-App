import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { publishTemplateDraftCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { publishTemplateAuthoringDraft } from "@/lib/template-authoring-server-data";

export async function POST(
  request: NextRequest,
  context: RouteContext<
    "/api/template-authoring/publish-requests/[requestId]/publish"
  >,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const { requestId } = await context.params;
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok
    ? publishTemplateDraftCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The publish command is invalid.",
        },
      },
      400,
    );
  }
  try {
    const result = await publishTemplateAuthoringDraft({
      service,
      actor,
      publishRequestId: requestId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    safeApprovalLog("template_version_publish", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_version_publish_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The immutable template version could not be published.",
        },
      },
      503,
    );
  }
}
