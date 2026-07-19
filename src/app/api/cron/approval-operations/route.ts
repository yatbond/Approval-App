import { NextResponse } from "next/server";
import { getSchedulerRunKey, isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDurableApprovalOperations } from "@/lib/durable-workflow-operations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const runKey = getSchedulerRunKey(request);
  try {
    const result = await runDurableApprovalOperations({ runKey });
    console.info(JSON.stringify({
      event: "approval_operations_completed",
      runKey,
      durationMs: Date.now() - startedAt,
      result,
    }));
    return NextResponse.json({ ok: true, runKey, ...result });
  } catch (error) {
    console.error(JSON.stringify({
      event: "approval_operations_failed",
      runKey,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown operation error",
    }));
    return NextResponse.json(
      { error: "Approval operations failed", runKey },
      { status: 503 },
    );
  }
}
