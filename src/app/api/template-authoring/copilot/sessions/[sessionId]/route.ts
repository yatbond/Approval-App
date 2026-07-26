import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";
import {
  loadTemplateCopilotSession,
  templateCopilotTranscriptFromStored,
} from "@/lib/template-copilot-server-data";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, actor, cookieSource, correlationId } = resolved.context;
  const { sessionId } = await context.params;
  try {
    const result = await loadTemplateCopilotSession({ session, sessionId });
    if (!result) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "not_found", message: "The Copilot session was not found." } },
        404,
      );
    }
    const transcript = templateCopilotTranscriptFromStored(result);
    safeApprovalLog("template_copilot_session_read", correlationId, {
      viewer: result.owner_id === actor.id ? "owner" : "admin",
      status: result.status,
    });
    return approvalJson(cookieSource, correlationId, { session: transcript });
  } catch {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The Copilot session is temporarily unavailable." } },
      503,
    );
  }
}
