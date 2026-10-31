import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";
import { confirmTemplateCopilotV2Candidate } from "@/lib/template-copilot-v2-server-data";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { TemplateCopilotV2StructuredEditorUnavailableError, TemplateCopilotV2StructuredFactsError } from "@/lib/template-copilot-v2-structured-facts";

const schema = z.object({ expectedRevision: z.number().int().min(1), idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/), candidateId: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request); if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The extraction review endpoint is unavailable." } }, 404);
  const body = await readBoundedJson(request, 16_000); const parsed = body.ok ? schema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The extraction confirmation is invalid." } }, 400);
  try { const { sessionId } = await context.params; const result = await confirmTemplateCopilotV2Candidate({ session, service, actor, sessionId, ...parsed.data }); return templateAuthoringRpcResponse({ cookieSource, correlationId, result }); }
  catch (error) {
    if (error instanceof TemplateCopilotV2StructuredEditorUnavailableError) {
      return approvalJson(cookieSource, correlationId, { error: { code: "structured_editor_unavailable", message: "This structured editor is unavailable. Its saved value remains read-only." } }, 404);
    }
    if (error instanceof TemplateCopilotV2StructuredFactsError) {
      return approvalJson(cookieSource, correlationId, { error: { code: "invalid_structure", message: "Correct the structured workflow settings before confirming this suggestion.", issues: error.issues } }, 422);
    }
    const classified = classifyTemplateCopilotV2OperationError(error, "The extraction confirmation could not be completed.");
    return approvalJson(cookieSource, correlationId, { error: classified.error }, classified.status);
  }
}
