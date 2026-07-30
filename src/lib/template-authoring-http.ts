import type { NextResponse } from "next/server";
import { approvalJson, safeApprovalLog } from "./approval-server.ts";
import { getTemplateCopilotHelpFallbackTelemetry } from "./template-copilot-concepts.ts";

export function logTemplateCopilotHelpFallback(
  correlationId: string,
  value: unknown,
) {
  const fields = getTemplateCopilotHelpFallbackTelemetry(value);
  if (!fields) return false;
  safeApprovalLog("template_copilot_help_fallback", correlationId, {
    ...fields,
  });
  return true;
}

export function templateAuthoringRpcResponse({
  cookieSource,
  correlationId,
  result,
  appliedStatus = 200,
}: {
  cookieSource: NextResponse;
  correlationId: string;
  result: Record<string, unknown>;
  appliedStatus?: number;
}) {
  logTemplateCopilotHelpFallback(correlationId, result);
  const outcome = String(result.outcome || "");
  if (outcome === "applied" || outcome === "replayed") {
    return approvalJson(
      cookieSource,
      correlationId,
      result,
      outcome === "replayed" ? 200 : appliedStatus,
    );
  }

  const mapped = rpcError(outcome);
  return approvalJson(
    cookieSource,
    correlationId,
    {
      error: { code: mapped.code, message: mapped.message },
      ...safeConflictState(result),
    },
    mapped.status,
  );
}

function rpcError(outcome: string) {
  switch (outcome) {
    case "idempotency_conflict":
      return {
        status: 409,
        code: "idempotency_conflict",
        message: "That retry key was already used for a different command.",
      };
    case "stale_revision":
      return {
        status: 409,
        code: "stale_revision",
        message: "This draft changed. Review the latest revision before retrying.",
      };
    case "family_key_conflict":
      return {
        status: 409,
        code: "family_key_conflict",
        message: "A workflow family already uses that key.",
      };
    case "open_draft_exists":
      return {
        status: 409,
        code: "open_draft_exists",
        message: "This workflow family already has an editable or reviewed draft.",
      };
    case "invalid_transition":
      return {
        status: 409,
        code: "invalid_transition",
        message: "The authoring item is no longer in the required state.",
      };
    case "forbidden":
      return {
        status: 403,
        code: "forbidden",
        message: "You do not have permission for this template action.",
      };
    case "not_found":
      return {
        status: 404,
        code: "not_found",
        message: "The template authoring item was not found.",
      };
    case "invalid_scope":
      return {
        status: 422,
        code: "invalid_scope",
        message: "The selected business or department is unavailable.",
      };
    case "invalid_target":
      return {
        status: 422,
        code: "invalid_target",
        message: "Choose an active colleague with an exact directory email.",
      };
    case "validation_failed":
      return {
        status: 422,
        code: "validation_failed",
        message: "Resolve the coded validation errors before requesting publication.",
      };
    case "invalid_request":
      return {
        status: 400,
        code: "invalid_request",
        message: "The template authoring command is invalid.",
      };
    default:
      return {
        status: 503,
        code: "dependency_unavailable",
        message: "The template authoring command could not be completed.",
      };
  }
}

function safeConflictState(result: Record<string, unknown>) {
  const state: Record<string, unknown> = {};
  for (const key of [
    "currentRevision",
    "currentVersionNumber",
    "status",
    "draft",
  ]) {
    if (result[key] !== undefined) state[key] = result[key];
  }
  return state;
}
