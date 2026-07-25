import type { NextRequest } from "next/server";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
} from "@/lib/approval-server";
import { loadTemplateCopilotSession } from "@/lib/template-copilot-server-data";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, cookieSource, correlationId } = resolved.context;
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
    return approvalJson(cookieSource, correlationId, { session: result });
  } catch {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "dependency_unavailable", message: "The Copilot session is temporarily unavailable." } },
      503,
    );
  }
}
