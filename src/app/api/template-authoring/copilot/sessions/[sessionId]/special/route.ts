import type { NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { applyTemplateCopilotV2SpecialDecision } from "@/lib/template-copilot-v2-server-data";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { templateCopilotV2SpecialEnvelopeSchema } from "@/lib/template-copilot-v2-special-contract";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 special decision endpoint is unavailable." } }, 404);
  if (!isTemplateCopilotV2ModeEnabled("guided")) return approvalJson(cookieSource, correlationId, { error: { code: "mode_unavailable", message: "Guided Copilot decisions are temporarily unavailable." } }, 404);
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok ? templateCopilotV2SpecialEnvelopeSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The Copilot v2 special decision is invalid." } }, 400);
  try {
    const { sessionId } = await context.params;
    const result = await applyTemplateCopilotV2SpecialDecision({ session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision, idempotencyKey: parsed.data.idempotencyKey, command: parsed.data.command });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_special_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    const classified = classifyTemplateCopilotV2OperationError(error, "The Copilot v2 special decision could not be completed.");
    return approvalJson(cookieSource, correlationId, { error: classified.error }, classified.status);
  }
}
