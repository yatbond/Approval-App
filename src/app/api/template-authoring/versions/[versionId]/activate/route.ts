import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { activateTemplateVersionCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { isTemplateAuthoringActivationEnabled } from "@/lib/template-authoring-lifecycle-feature";
import { activateTemplateAuthoringVersion } from "@/lib/template-authoring-server-data";

export async function POST(
  request: NextRequest,
  context: RouteContext<
    "/api/template-authoring/versions/[versionId]/activate"
  >,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateAuthoringActivationEnabled()) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "feature_disabled",
          message: "Template activation is not enabled in this environment.",
        },
      },
      503,
    );
  }
  const { versionId } = await context.params;
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok
    ? activateTemplateVersionCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The activation command is invalid.",
        },
      },
      400,
    );
  }
  try {
    const result = await activateTemplateAuthoringVersion({
      service,
      actor,
      publishedVersionId: versionId,
      expectedVersionNumber: parsed.data.expectedVersionNumber,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    safeApprovalLog("template_version_activate", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch (error) {
    safeApprovalLog("template_version_activate_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The exact published version could not be activated.",
        },
      },
      503,
    );
  }
}
