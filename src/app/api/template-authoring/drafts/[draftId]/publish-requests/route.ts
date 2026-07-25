import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { requestTemplatePublishCommandSchema } from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import {
  findInactiveFixedTemplateEmails,
  loadTemplateAuthoringDraft,
  parseStoredAuthoringDraft,
  requestTemplateAuthoringPublish,
} from "@/lib/template-authoring-server-data";
import { validateTemplateAuthoringDefinition } from "@/lib/template-authoring-validation";

export async function POST(
  request: NextRequest,
  context: RouteContext<
    "/api/template-authoring/drafts/[draftId]/publish-requests"
  >,
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } =
    resolved.context;
  const { draftId } = await context.params;
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok
    ? requestTemplatePublishCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "invalid_request",
          message: "The publication request is invalid.",
        },
      },
      400,
    );
  }

  try {
    const stored = parseStoredAuthoringDraft(
      await loadTemplateAuthoringDraft(session, draftId),
    );
    if (!stored) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_found", message: "The draft was not found." } },
        404,
      );
    }
    if (stored.revision !== parsed.data.expectedRevision) {
      return approvalJson(
        cookieSource,
        correlationId,
        {
          error: {
            code: "stale_revision",
            message: "This draft changed. Review the latest revision.",
          },
          currentRevision: stored.revision,
        },
        409,
      );
    }

    const validation = validateTemplateAuthoringDefinition(stored);
    const inactiveEmails = await findInactiveFixedTemplateEmails({
      service,
      definition: stored.definition,
    });
    for (const inactiveEmail of inactiveEmails) {
      validation.issues.push({
        code: "inactive_directory_participant",
        severity: "error",
        message: `${inactiveEmail} is not an active directory participant.`,
      });
    }
    validation.errorCount += inactiveEmails.length;
    validation.valid = validation.errorCount === 0;
    if (!validation.valid) {
      return approvalJson(
        cookieSource,
        correlationId,
        {
          error: {
            code: "validation_failed",
            message: "Resolve the validation errors before publication review.",
          },
          validation,
        },
        422,
      );
    }

    const result = await requestTemplateAuthoringPublish({
      service,
      actor,
      draftId,
      expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey,
      requestNote: parsed.data.requestNote,
      validation,
    });
    safeApprovalLog("template_publish_request", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_publish_request_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The publication request could not be created.",
        },
      },
      503,
    );
  }
}
