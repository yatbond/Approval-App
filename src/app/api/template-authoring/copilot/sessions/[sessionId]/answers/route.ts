import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";
import { applyTemplateCopilotV2AtomicAnswer } from "@/lib/template-copilot-v2-server-data";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

const answerSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  answer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string().trim().min(1).superRefine((value, context) => { if (templateCopilotUnicodeCodePointCount(value) > 8_000) context.addIssue({ code: "custom", message: "Answer exceeds 8000 Unicode characters." }); }) }).strict(),
    z.object({ kind: z.literal("choice"), optionId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/) }).strict(),
  ]),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "v2_unavailable", message: "The Copilot v2 answer endpoint is unavailable." } }, 404);
  // 8,000 four-byte Unicode code points plus the strict command envelope.
  const body = await readBoundedJson(request, 64 * 1024);
  const parsed = body.ok ? answerSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The Copilot v2 answer is invalid." } }, 400);
  const { sessionId } = await context.params;
  try {
    const result = await applyTemplateCopilotV2AtomicAnswer({ session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision, idempotencyKey: parsed.data.idempotencyKey, answer: parsed.data.answer });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_answer_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    const classified = classifyTemplateCopilotV2OperationError(error, "The Copilot v2 answer could not be completed.");
    return approvalJson(cookieSource, correlationId, { error: classified.error }, classified.status);
  }
}
