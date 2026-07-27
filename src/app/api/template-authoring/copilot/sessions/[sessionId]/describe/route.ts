import type { NextRequest } from "next/server";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { runTemplateCopilotV2DescribeCommand } from "@/lib/template-copilot-v2-describe-command";
import { templateCopilotV2DescribeResponseDisposition } from "@/lib/template-copilot-v2-describe-response";
import { extractTemplateCopilotV2Candidates, TemplateCopilotModelError } from "@/lib/template-copilot-ai";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { z } from "zod";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";

// The mode command schema is refined, and Zod deliberately disallows omit on
// refined objects. Keep the describe command explicit and equally bounded.
const schema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  mode: z.enum(["describe_everything", "similar_template"]),
  message: z.string().trim().min(1).superRefine((value, context) => {
    if (templateCopilotUnicodeCodePointCount(value) > 80_000) context.addIssue({ code: "custom", message: "Description exceeds 80000 Unicode characters." });
  }),
}).strict();

/** The durable lifecycle writes the source message and reconciles its receipt
 * before any provider invocation. A retry therefore returns its stored
 * success/fallback terminal result, never a second model branch. */
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 Describe endpoint is unavailable." } }, 404);
  // 80,000 Unicode code points can require four UTF-8 bytes each, while JSON
  // escaping can require more. Keep a hard byte bound that still admits every
  // valid schema-sized narrative plus its small command envelope.
  const body = await readBoundedJson(request, 512 * 1024);
  const parsed = body.ok ? schema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The requirements description is invalid." } }, 400);
  const { sessionId } = await context.params;
  if (!isTemplateCopilotV2ModeEnabled(parsed.data.mode)) return approvalJson(cookieSource, correlationId, { error: { code: "mode_unavailable", message: "This Copilot mode is temporarily unavailable." } }, 404);
  try {
    const result = await runTemplateCopilotV2DescribeCommand({
      session, service, actor, sessionId,
      expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey,
      mode: parsed.data.mode,
      sourceText: parsed.data.message,
      extractCandidates: extractTemplateCopilotV2Candidates,
      fallbackReason: (error) => error instanceof TemplateCopilotModelError
        ? error.reasonCode
        : "provider_error",
    });
    if (result.outcome === "guided_fallback") {
      safeApprovalLog("template_copilot_v2_describe_fallback", correlationId, {
        reason: typeof result.detail === "object" && result.detail && "fallbackReason" in result.detail
          ? String(result.detail.fallbackReason).slice(0, 64)
          : "provider_error",
      });
    }
    const terminal = templateCopilotV2DescribeResponseDisposition(result);
    if (terminal) return approvalJson(cookieSource, correlationId, terminal.body, terminal.status);
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    const failure = classifyTemplateCopilotV2OperationError(error, "The requirements description could not be processed.");
    return approvalJson(cookieSource, correlationId, { error: failure.error }, failure.status);
  }
}
