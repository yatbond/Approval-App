import type { NextRequest } from "next/server";
import { loadApprovalRequestDetail } from "@/lib/approval-server-data";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestNo: string }> },
) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { session, actor, cookieSource, correlationId } = resolved.context;
  const { requestNo: rawRequestNo } = await context.params;
  const requestNo = rawRequestNo.trim();
  if (!requestNo || requestNo.length > 100) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "The request number is invalid." } },
      400,
    );
  }
  try {
    const approvalRequest = await loadApprovalRequestDetail(session, requestNo, actor);
    if (!approvalRequest) {
      return approvalJson(
        cookieSource,
        correlationId,
        { error: { code: "request_not_found", message: "Approval request not found." } },
        404,
      );
    }
    return approvalJson(cookieSource, correlationId, { request: approvalRequest });
  } catch (error) {
    safeApprovalLog("request_detail_failed", correlationId, {
      requestNo,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The approval request is temporarily unavailable.",
        },
      },
      503,
    );
  }
}
