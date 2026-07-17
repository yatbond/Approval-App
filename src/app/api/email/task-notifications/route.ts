import { NextResponse, type NextRequest } from "next/server";
import { sendTaskNotificationEmails } from "@/lib/email-delivery";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";
import type { ApprovalTask } from "@/lib/types";
import {
  buildTaskNotifications,
  type TaskNotification,
} from "@/lib/workflow-system";
import { recordWorkflowOperationEvent } from "@/lib/workflow-operation-monitor";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    task?: ApprovalTask;
    notifications?: TaskNotification[];
  };
  const notifications = Array.isArray(body.notifications)
    ? body.notifications
    : body.task
      ? buildTaskNotifications([body.task])
      : [];

  if (!notifications.length) {
    return NextResponse.json(
      { error: "Workflow notification(s) are required." },
      { status: 400 },
    );
  }

  const result = await sendTaskNotificationEmails({
    notifications,
  });
  const failed = result.failures.length > 0;
  await recordWorkflowOperationEvent(supabase, {
    ownerUserId: user.id,
    ownerEmail: user.email,
    operationType: "notification",
    outcome: failed ? "failed" : "succeeded",
    requestNo: body.task?.id || notifications[0]?.requestId,
    durationMs: Date.now() - startedAt,
    message: failed
      ? `${result.failures.length} notification(s) failed.`
      : `${result.sent} notification(s) sent.`,
    details: {
      sent: result.sent,
      failed: result.failures.length,
      skipped: result.skipped,
      mode: result.mode,
    },
  });

  return NextResponse.json(result, {
    status: result.failures.length ? 502 : 200,
  });
}
