import type { NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";
import { reconcileTemplateCopilotV2SpecialDecision } from "@/lib/template-copilot-v2-server-data";
import { templateCopilotV2SpecialEnvelopeSchema } from "@/lib/template-copilot-v2-special-contract";

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 reconciliation endpoint is unavailable." } }, 404);
  const body = await readBoundedJson(request, 16_000);
  const parsed = body.ok ? templateCopilotV2SpecialEnvelopeSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The reconciliation command is invalid." } }, 400);
  try {
    const { sessionId } = await context.params;
    const result = await reconcileTemplateCopilotV2SpecialDecision({ session, service, actor, sessionId, ...parsed.data });
    return approvalJson(cookieSource, correlationId, result, 200);
  } catch (error) {
    safeApprovalLog("template_copilot_v2_special_reconcile_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    return approvalJson(cookieSource, correlationId, { error: { code: "dependency_unavailable", message: "The special action could not be reconciled." } }, 503);
  }
}
