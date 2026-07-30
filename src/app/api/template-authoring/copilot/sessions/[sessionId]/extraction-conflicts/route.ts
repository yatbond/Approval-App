import type { NextRequest } from "next/server";
import { z } from "zod";
import { approvalError, approvalJson, createApprovalServerContext, safeApprovalLog } from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import { classifyTemplateCopilotV2OperationError } from "@/lib/template-copilot-facts";
import { isTemplateCopilotV2Enabled } from "@/lib/template-copilot-v2-feature";
import { resolveTemplateCopilotV2CommittedExtractionConflict } from "@/lib/template-copilot-v2-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";
import { TemplateCopilotV2StructuredEditorUnavailableError, TemplateCopilotV2StructuredFactsError } from "@/lib/template-copilot-v2-structured-facts";

const commandSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  conflictId: z.string().regex(/^[0-9a-f]{64}$/),
  choice: z.enum(["keep_existing", "commit_incoming", "commit_human_value"]),
  rationale: z.string().trim().min(1).max(1_000).optional(),
  humanValue: z.json().optional(),
}).strict().superRefine((value, context) => {
  if (value.choice === "commit_human_value" && value.humanValue === undefined) context.addIssue({ code: "custom", path: ["humanValue"], message: "A typed human value is required." });
  if (value.choice !== "commit_human_value" && value.humanValue !== undefined) context.addIssue({ code: "custom", path: ["humanValue"], message: "Only an explicit human-value decision may include a value." });
});

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  if (!isTemplateCopilotV2Enabled()) {
    return approvalJson(cookieSource, correlationId, { error: { code: "not_found", message: "The Copilot extraction review endpoint is unavailable." } }, 404);
  }
  // A typed human conflict decision can carry the same maximum-size strict
  // structure as the map editor. Candidate-ID-only choices remain small, but
  // every schema-valid human value must reach the deterministic validator.
  const body = await readBoundedJson(request, 2_000_000);
  const parsed = body.ok ? commandSchema.safeParse(body.value) : null;
  if (!parsed?.success) return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The extraction conflict decision is invalid." } }, 400);
  const { sessionId } = await context.params;
  try {
    const result = await resolveTemplateCopilotV2CommittedExtractionConflict({ session, service, actor, sessionId, expectedRevision: parsed.data.expectedRevision, idempotencyKey: parsed.data.idempotencyKey, conflictId: parsed.data.conflictId, choice: parsed.data.choice, rationale: parsed.data.rationale, humanValue: parsed.data.humanValue });
    return templateAuthoringRpcResponse({ cookieSource, correlationId, result });
  } catch (error) {
    safeApprovalLog("template_copilot_v2_extraction_conflict_failed", correlationId, { errorName: error instanceof Error ? error.name : "unknown" });
    if (error instanceof TemplateCopilotV2StructuredEditorUnavailableError) {
      return approvalJson(cookieSource, correlationId, { error: { code: "structured_editor_unavailable", message: "This structured editor is unavailable. Its saved value remains read-only." } }, 404);
    }
    if (error instanceof TemplateCopilotV2StructuredFactsError) {
      return approvalJson(cookieSource, correlationId, { error: { code: "invalid_structure", message: "Correct the structured workflow settings before resolving this suggestion.", issues: error.issues } }, 422);
    }
    const classified = classifyTemplateCopilotV2OperationError(error, "The extraction conflict decision could not be completed.");
    return approvalJson(cookieSource, correlationId, { error: classified.error }, classified.status);
  }
}
