import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { classifyTemplateCopilotV2OperationError, templateCopilotFactIds, templateCopilotV2FactTransitionSchema } from "@/lib/template-copilot-facts";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2Step5EditingEnabled } from "@/lib/template-copilot-v2-feature";
import { applyTemplateCopilotV2Mutation } from "@/lib/template-copilot-v2-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

const commandSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  factId: z.enum(templateCopilotFactIds),
  transition: templateCopilotV2FactTransitionSchema,
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) {
    return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot v2 fact endpoint is unavailable." } }, 404);
  }
  if (!isTemplateCopilotV2Step5EditingEnabled()) {
    return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot map editor is unavailable." } }, 404);
  }
  const { sessionId } = await context.params;
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok ? commandSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The v2 fact command is invalid." } }, 400);
  try {
    const result = await applyTemplateCopilotV2Mutation({
      session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey, factId: parsed.data.factId,
      transition: parsed.data.transition,
    });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    const failure = classifyTemplateCopilotV2OperationError(error, "The v2 fact command could not be completed.");
    if (failure.status === 503) safeApprovalLog("template_copilot_v2_fact_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    return approvalJson(cookieSource, correlationId, { error: failure.error }, failure.status);
  }
}
