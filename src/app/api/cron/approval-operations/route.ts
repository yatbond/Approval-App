import { NextResponse } from "next/server";
import { getSchedulerRunKey, isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runDurableApprovalOperations } from "@/lib/durable-workflow-operations";
import { drainTemplateCopilotV2ExtractionJobs } from "@/lib/template-copilot-v2-extraction-drain";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const runKey = getSchedulerRunKey(request);
  try {
    const [approvalOperations, templateCopilotExtraction] = await Promise.all([
      runDurableApprovalOperations({ runKey }),
      drainTemplateCopilotV2ExtractionJobs(),
    ]);
    const result = { ...approvalOperations, templateCopilotExtraction };
    console.info(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "approval-workflow",
      event: "approval_operations_completed",
      runKey,
      durationMs: Date.now() - startedAt,
      result,
    }));
    return NextResponse.json({ ok: true, runKey, ...result });
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "approval-workflow",
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
