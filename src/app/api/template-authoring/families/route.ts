import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import {
  createTemplateFamilyCommandSchema,
  templateFamilyListQuerySchema,
} from "@/lib/template-authoring-api-contracts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import {
  createTemplateAuthoringFamily,
  listTemplateAuthoringFamilies,
} from "@/lib/template-authoring-server-data";
import { validateTemplateAuthoringDefinition } from "@/lib/template-authoring-validation";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, cookieSource, correlationId } = resolved.context;
  const parsed = templateFamilyListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The family query is invalid." } },
      400,
    );
  }
  try {
    const families = await listTemplateAuthoringFamilies({
      session,
      ...parsed.data,
    });
    return approvalJson(cookieSource, correlationId, { families });
  } catch (error) {
    safeApprovalLog("template_family_list_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "Template families are temporarily unavailable.",
        },
      },
      503,
    );
  }
}

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const body = await readBoundedJson(request, 2_000_000);
  const parsed = body.ok
    ? createTemplateFamilyCommandSchema.safeParse(body.value)
    : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The family command is invalid." } },
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
          message: "The initial workflow definition contains errors.",
        },
        validation,
      },
      422,
    );
  }

  try {
    const result = await createTemplateAuthoringFamily({
      service,
      actor,
      command: parsed.data,
    });
    safeApprovalLog("template_family_create", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result,
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_family_create_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The template proposal could not be created.",
        },
      },
      503,
    );
  }
}
