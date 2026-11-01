import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled, isTemplateCopilotV3DescribeEnabled } from "@/lib/template-copilot-v2-feature";
import { extractTemplateCopilotV3QuoteBatch } from "@/lib/template-copilot-ai";
import {
  extractTemplateCopilotV3Description,
  TemplateCopilotV3DescribeExtractionError,
} from "@/lib/template-copilot-v3-describe-extraction";
import { buildTemplateCopilotV3Proposal } from "@/lib/template-copilot-v3-proposal";
import { templateCopilotV3ProviderQuoteSlots } from "@/lib/template-copilot-v3-provider-quotes";
import { templateCopilotUnicodeCodePointCount } from "@/lib/template-copilot-unicode";

// Five bounded model calls, each retried once. Keep the window above the
// worst case (5 x 2 x the provider timeout) with a deadline that stops retries.
export const maxDuration = 300;
const retryDeadlineMs = 200_000;
// A sectioned description has its own long window; one batch can take 20 s on a self-hosted model.
const describeProviderTimeoutMs = 45_000;

const schema = z.object({
  locale: z.enum(["en", "zh-Hant", "zh-Hans"]),
  sections: z.array(z.object({
    slot: z.enum(templateCopilotV3ProviderQuoteSlots),
    text: z.string().max(16_000),
  }).strict()).min(1).max(templateCopilotV3ProviderQuoteSlots.length),
}).strict().superRefine((value, context) => {
  const total = value.sections.reduce((sum, section) => sum + templateCopilotUnicodeCodePointCount(section.text), 0);
  if (total > 80_000) context.addIssue({ code: "custom", message: "The description exceeds 80000 Unicode characters." });
});

/** Reads a sectioned description with the v3 quote-first reader and returns a
 * reviewable proposal. It saves nothing: a person confirms each fact through
 * the normal fact commands, then creates the draft. */
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled() || !isTemplateCopilotV3DescribeEnabled()) {
    return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The sectioned Describe endpoint is unavailable." } }, 404);
  }
  const body = await readBoundedJson(request, 512 * 1024);
  const parsed = body.ok ? schema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The requirements description is invalid." } }, 400);
  }
  const { sessionId } = await context.params;
  // Row-level security scopes this read to the signed-in owner's session.
  const { data: owned, error: ownedError } = await session
    .from("template_copilot_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (ownedError || !owned) {
    return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot session was not found." } }, 404);
  }
  const startedAt = Date.now();
  const sections = parsed.data.sections.map((section) => ({
    slot: section.slot,
    messageId: `describe:${section.slot}:${sessionId.slice(0, 8)}`,
    text: section.text.trim(),
  }));
  try {
    const extraction = await extractTemplateCopilotV3Description({
      sections,
      locale: parsed.data.locale,
      extractBatch: (input) => extractTemplateCopilotV3QuoteBatch({ ...input, timeoutMs: describeProviderTimeoutMs }),
      shouldContinue: () => Date.now() - startedAt < retryDeadlineMs,
    });
    const proposal = buildTemplateCopilotV3Proposal({ extraction, sections, locale: parsed.data.locale });
    return approvalJson(cookieSource, correlationId, {
      proposal,
      batches: extraction.batches,
      elapsedMs: Date.now() - startedAt,
    }, 200);
  } catch (error) {
    const reason = error instanceof TemplateCopilotV3DescribeExtractionError ? error.reasonCode : "provider_error";
    safeApprovalLog("template_copilot_v3_describe_failed", correlationId, { reason });
    // The caller falls back to the Guided questions; nothing was saved.
    return approvalJson(cookieSource, correlationId, {
      error: { code: "describe_unavailable", message: "The Copilot could not read the description right now. Use the guided questions instead.", reason },
    }, 503);
  }
}
