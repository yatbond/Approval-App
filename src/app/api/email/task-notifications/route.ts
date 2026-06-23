import { NextResponse, type NextRequest } from "next/server";
import { sendTaskNotificationEmails } from "@/lib/email-delivery";
import type { ApprovalTask } from "@/lib/types";
import { buildTaskNotifications } from "@/lib/workflow-system";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    task?: ApprovalTask;
  };

  if (!body.task?.id) {
    return NextResponse.json(
      { error: "A workflow task is required." },
      { status: 400 },
    );
  }

  const result = await sendTaskNotificationEmails({
    notifications: buildTaskNotifications([body.task]),
  });

  return NextResponse.json(result, {
    status: result.failures.length ? 502 : 200,
  });
}
