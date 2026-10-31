import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";
import { approveTemplateCopilotV1Upgrade, previewTemplateCopilotV1Upgrade } from "@/lib/template-copilot-v2-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";

const approvalSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  previewHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot v2 upgrade endpoint is unavailable." } }, 404);
  const { sessionId } = await context.params;
  try {
    const preview = await previewTemplateCopilotV1Upgrade({ session, sessionId });
    if (!preview) return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The legacy Copilot session was not found." } }, 404);
    return approvalJson(cookieSource, correlationId, { preview });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_upgrade_preview_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    return approvalJson(cookieSource, correlationId, { error: { code: "dependency_unavailable", message: "The upgrade preview is temporarily unavailable." } }, 503);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot v2 upgrade endpoint is unavailable." } }, 404);
  const { sessionId } = await context.params;
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok ? approvalSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The upgrade approval is invalid." } }, 400);
  try {
    const result = await approveTemplateCopilotV1Upgrade({
      session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey, previewHash: parsed.data.previewHash,
    });
    if (result.outcome === "stale_preview") {
      return approvalJson(cookieSource, correlationId, { error: { code: "stale_revision", message: "Reload the upgrade preview before approving it." }, currentRevision: (result as Record<string, unknown>).currentRevision }, 409);
    }
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    const failure = classifyTemplateCopilotV2OperationError(error, "The legacy upgrade could not be completed.");
    if (failure.status === 503) safeApprovalLog("template_copilot_v2_upgrade_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    return approvalJson(cookieSource, correlationId, { error: failure.error }, failure.status);
  }
}
