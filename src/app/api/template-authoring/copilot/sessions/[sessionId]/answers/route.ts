import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2CandidateCreationEnabled, isTemplateCopilotV2Enabled, isTemplateCopilotV2ExtractionShadowEnabled, isTemplateCopilotV2ModeEnabled } from "@/lib/template-copilot-v2-feature";
import { applyTemplateCopilotV2AtomicAnswer, processTemplateCopilotV2AnswerExtractionJob } from "@/lib/template-copilot-v2-server-data";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { extractTemplateCopilotV2Candidates } from "@/lib/template-copilot-ai";

// Provider work is hard-capped below this Route Handler's `after()` duration.
export const maxDuration = 30;

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
  if (!isTemplateCopilotV2ModeEnabled("guided")) return approvalJson(cookieSource, correlationId, { error: { code: "mode_unavailable", message: "Guided Copilot answers are temporarily unavailable." } }, 404);
  // 8,000 four-byte Unicode code points plus the strict command envelope.
  const body = await readBoundedJson(request, 64 * 1024);
  const parsed = body.ok ? answerSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The Copilot v2 answer is invalid." } }, 400);
  const { sessionId } = await context.params;
  try {
    const textAnswer = parsed.data.answer.kind === "text";
    const shadowEnabled = isTemplateCopilotV2ExtractionShadowEnabled();
    const candidateCreationEnabled = textAnswer && isTemplateCopilotV2CandidateCreationEnabled();
    const result = await applyTemplateCopilotV2AtomicAnswer({
      session,
      service,
      actor,
      sessionId,
      expectedRevision: parsed.data.expectedRevision,
      idempotencyKey: parsed.data.idempotencyKey,
      answer: parsed.data.answer,
      enqueueExtractionJob: candidateCreationEnabled,
    });

    // Candidate creation is answer-bound and durable. The response carries the
    // already-committed manual answer; a bounded post-response worker may only
    // append candidates at that answer's exact revision.
    if (candidateCreationEnabled) {
      if (result.outcome === "applied" || result.outcome === "replayed") {
        const answerClientMessageId = parsed.data.idempotencyKey;
        after(async () => {
          try {
            const processed = await processTemplateCopilotV2AnswerExtractionJob({
              session,
              service,
              actor,
              sessionId,
              answerClientMessageId,
              dependencies: { extractCandidates: extractTemplateCopilotV2Candidates },
            });
            const candidateCount = typeof processed.candidateCount === "number"
              ? processed.candidateCount
              : null;
            safeApprovalLog("template_copilot_v2_extraction_job", correlationId, {
              outcome: typeof processed.outcome === "string" ? processed.outcome : "unknown",
              ...(candidateCount === null ? {} : { candidateCount }),
            });
          } catch (extractionError) {
            safeApprovalLog("template_copilot_v2_extraction_job_failed", correlationId, {
              errorName: extractionError instanceof Error ? extractionError.name : "unknown",
            });
          }
        });
      }
      return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
    }

    // Shadow-only calls are deliberately nonblocking, fresh-answer-only, and
    // incapable of writing candidates or extraction jobs.
    if (!shadowEnabled || parsed.data.answer.kind !== "text" || result.outcome !== "applied") {
      return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
    }
    const shadowMessageId = parsed.data.idempotencyKey;
    const shadowMessage = parsed.data.answer.text;
    after(async () => {
      try {
        const extracted = await extractTemplateCopilotV2Candidates({ message: shadowMessage, messageId: shadowMessageId });
        safeApprovalLog("template_copilot_v2_extraction_shadow", correlationId, { candidateCount: extracted.candidates.length, rejectedCount: extracted.rejected.length, model: extracted.model });
      } catch (extractionError) {
        safeApprovalLog("template_copilot_v2_extraction_failed", correlationId, { errorName: extractionError instanceof Error ? extractionError.name : "unknown" });
      }
    });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_answer_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    const classified = classifyTemplateCopilotV2OperationError(error, "The Copilot v2 answer could not be completed.");
    return approvalJson(cookieSource, correlationId, { error: classified.error }, classified.status);
  }
}
