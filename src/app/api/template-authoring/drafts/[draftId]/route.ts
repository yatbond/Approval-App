import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { replaceTemplateDraftCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import {
  loadTemplateAuthoringDraft,
  replaceTemplateAuthoringDraft,
} from "@/lib/template-authoring-server-data";
import { validateTemplateAuthoringDefinition } from "@/lib/template-authoring-validation";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/template-authoring/drafts/[draftId]">,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, cookieSource, correlationId } = resolved.context;
  const { draftId } = await context.params;
  try {
    const draft = await loadTemplateAuthoringDraft(session, draftId);
    if (!draft) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_found", message: "The draft was not found." } },
        404,
      );
    }
    return approvalJson(cookieSource, correlationId, { draft });
  } catch (error) {
    safeApprovalLog("template_draft_load_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The template draft is temporarily unavailable.",
        },
      },
      503,
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/template-authoring/drafts/[draftId]">,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const { draftId } = await context.params;
  const body = await readBoundedJson(request, 2_000_000);
  const parsed = body.ok
    ? replaceTemplateDraftCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The draft command is invalid." } },
      400,
    );
  }

  const validation = validateTemplateAuthoringDefinition(parsed.data);
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
    const result = await replaceTemplateAuthoringDraft({
      service,
      actor,
      draftId,
      command: parsed.data,
    });
    safeApprovalLog("template_draft_replace", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
    });
  } catch (error) {
    safeApprovalLog("template_draft_replace_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The template draft could not be saved.",
        },
      },
      503,
    );
  }
}
