import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { createTemplateDraftCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { removeUntrustedCopilotLineage } from "@/lib/template-authoring-lineage";
import { createTemplateAuthoringDraft } from "@/lib/template-authoring-server-data";
import { validateTemplateAuthoringDefinition } from "@/lib/template-authoring-validation";

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/template-authoring/families/[familyId]/drafts">,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const { familyId } = await context.params;
  const body = await readBoundedJson(request, 2_000_000);
  const parsed = body.ok
    ? createTemplateDraftCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The draft command is invalid." } },
      400,
    );
  }
  const command = removeUntrustedCopilotLineage(parsed.data);
  const validation = validateTemplateAuthoringDefinition(command);
  if (!validation.valid) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "validation_failed",
          message: "The workflow definition contains errors.",
        },
        validation,
      },
      422,
    );
  }
  try {
    const result = await createTemplateAuthoringDraft({
      service,
      actor,
      familyId,
      command,
    });
    safeApprovalLog("template_draft_create", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_draft_create_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The template draft could not be created.",
        },
      },
      503,
    );
  }
}
