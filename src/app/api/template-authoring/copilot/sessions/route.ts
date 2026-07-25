import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import { readBoundedJson } from "@/lib/bounded-request";
import {
  createTemplateCopilotLedger,
  templateCopilotQuestions,
  templateCopilotStartSchema,
} from "@/lib/template-copilot-ledger";
import {
  createTemplateCopilotSession,
  resolveTemplateCopilotScope,
} from "@/lib/template-copilot-server-data";
import { templateAuthoringRpcResponse } from "@/lib/template-authoring-http";

export async function POST(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const body = await readBoundedJson(request, 32_000);
  const parsed = body.ok ? templateCopilotStartSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The Copilot session request is invalid." } },
      400,
    );
  }

  try {
    const scope = await resolveTemplateCopilotScope({
      service,
      businessUnitId: parsed.data.businessUnitId,
      departmentName: parsed.data.departmentName,
    });
    if (!scope) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "invalid_scope", message: "The selected business or department is unavailable." } },
        422,
      );
    }
    const ledger = createTemplateCopilotLedger(scope);
    const assistantMessage = [
      `I’ll help you design an approval template for ${scope.businessName} / ${scope.departmentName}.`,
      "I will keep a visible requirements checklist, flag unknowns, and create only an editable draft for human review.",
      templateCopilotQuestions.identity_scope,
    ].join("\n\n");
    const result = await createTemplateCopilotSession({
      service,
      actor,
      clientMessageId: parsed.data.clientMessageId,
      ledger,
      assistantMessage,
    });
    safeApprovalLog("template_copilot_session_created", correlationId, {
      outcome: String(result.outcome || "unknown"),
    });
    return templateAuthoringRpcResponse({
      cookieSource,
      correlationId,
      result: { ...result, assistantMessage },
      appliedStatus: 201,
    });
  } catch (error) {
    safeApprovalLog("template_copilot_session_create_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The Copilot session could not be started." } },
      503,
    );
  }
}
