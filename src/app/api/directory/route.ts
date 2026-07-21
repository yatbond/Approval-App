import type { NextRequest } from "next/server";
import { directoryQuerySchema } from "@/lib/approval-api-contracts";
import { searchApprovalDirectory } from "@/lib/approval-server-data";
import {
  approvalError,
  approvalJson,
  createApprovalServerContext,
  safeApprovalLog,
} from "@/lib/approval-server";

export async function GET(request: NextRequest) {
  const resolved = await createApprovalServerContext(request);
  if (!resolved.ok) return approvalError(resolved);
  const { service, actor, cookieSource, correlationId } = resolved.context;
  const parsed = directoryQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "invalid_request", message: "Enter a valid directory search." } },
      400,
    );
  }
  if (!actor.isAdmin && !parsed.data.query) {
    return approvalJson(
      cookieSource,
      correlationId,
      { error: { code: "forbidden", message: "Enter a directory search." } },
      403,
    );
  }
  try {
    const directory = await searchApprovalDirectory(
      service,
      parsed.data.query,
      parsed.data.limit,
      parsed.data.cursor,
    );
    return approvalJson(cookieSource, correlationId, directory);
  } catch (error) {
    safeApprovalLog("directory_failed", correlationId, {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return approvalJson(
      cookieSource,
      correlationId,
      {
        error: {
          code: "dependency_unavailable",
          message: "The directory is temporarily unavailable.",
        },
      },
      503,
    );
  }
}
