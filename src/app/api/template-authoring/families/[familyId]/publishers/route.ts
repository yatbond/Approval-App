import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { setTemplatePublisherCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { setTemplateAuthoringPublisher } from "@/lib/template-authoring-server-data";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/template-authoring/families/[familyId]/publishers">,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const { familyId } = await context.params;
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok
    ? setTemplatePublisherCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The publisher access command is invalid.",
        },
      },
      400,
    );
  }
  try {
    const result = await setTemplateAuthoringPublisher({
      service,
      actor,
      familyId,
      command: parsed.data,
    });
    safeApprovalLog("template_authoring_publisher_set", correlationId, {
      outcome: String(result.outcome || "unknown"),
      enabled: String(parsed.data.enabled),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch (error) {
    safeApprovalLog("template_authoring_publisher_set_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "Publisher access could not be updated.",
        },
      },
      503,
    );
  }
}
