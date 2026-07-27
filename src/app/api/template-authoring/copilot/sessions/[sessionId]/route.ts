import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import {
  loadTemplateCopilotSession,
  decodeTemplateCopilotMessageCursor,
  templateCopilotTranscriptFromStored,
} from "@/lib/template-copilot-server-data";
import { getTemplateCopilotV2ModeFlags, getTemplateCopilotV2StructuredEditorFlags, isTemplateCopilotV2Enabled, isTemplateCopilotV2Step4Enabled, isTemplateCopilotV2Step5EditingEnabled } from "@/lib/template-copilot-v2-feature";
import { getTemplateCopilotV2InterviewState, getTemplateCopilotV2SpecialReview } from "@/lib/template-copilot-question-library";
import { projectTemplateCopilotV2AuthoritativeLedger } from "@/lib/template-copilot-v2-authoritative-projection";
import { loadTemplateCopilotV2AuthoringModeState } from "@/lib/template-copilot-v2-server-data";
import { logTemplateCopilotHelpFallback } from "@/lib/template-authoring-http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, service, actor, cookieSource, correlationId } = resolved.context;
  const { sessionId } = await context.params;
  const cursorValue = request.nextUrl.searchParams.get("messageCursor");
  const messageCursor = decodeTemplateCopilotMessageCursor(cursorValue);
  const requestedLimit = Number(request.nextUrl.searchParams.get("messageLimit") || "200");
  const messageDirection = request.nextUrl.searchParams.get("messageDirection") || "forward";
  if ((cursorValue && !messageCursor) || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200 || (messageDirection !== "forward" && messageDirection !== "tail") || (messageDirection === "tail" && cursorValue)) {
    return approvalJson(cookieSource, correlationId, { error: { code: "invalid_request", message: "The transcript page request is invalid." } }, 400);
  }
  try {
    const result = await loadTemplateCopilotSession({ session, sessionId, messageCursor, messageLimit: requestedLimit, messageDirection });
    if (!result) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_found", message: "The Copilot session was not found." } },
        404,
      );
    }
    const transcript = templateCopilotTranscriptFromStored(result);
    let sessionPayload: typeof transcript | Record<string, unknown> = transcript;
    if (result.ledger.schemaVersion === 2 && isTemplateCopilotV2Enabled()) {
      const ledger = result.ledger;
      const interview = getTemplateCopilotV2InterviewState(ledger);
      logTemplateCopilotHelpFallback(correlationId, interview);
      const modeState = await loadTemplateCopilotV2AuthoringModeState(service, result.id);
      sessionPayload = { ...transcript, interview, specialReview: getTemplateCopilotV2SpecialReview(ledger), projection: projectTemplateCopilotV2AuthoritativeLedger(ledger, { inapplicableFactIds: interview.inapplicableFactIds }), step4Enabled: isTemplateCopilotV2Step4Enabled(), step5EditingEnabled: isTemplateCopilotV2Step5EditingEnabled(), modeFlags: getTemplateCopilotV2ModeFlags(), structuredEditorFlags: getTemplateCopilotV2StructuredEditorFlags(), modeState };
    }
    safeApprovalLog("template_copilot_session_read", correlationId, {
      viewer: result.owner_id === actor.id ? "owner" : "admin",
      status: result.status,
    });
    return approvalJson(cookieSource, correlationId, { session: sessionPayload });
  } catch {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The Copilot session is temporarily unavailable." } },
      503,
    );
  }
}
