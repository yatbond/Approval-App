import { NextResponse, type NextRequest } from "next/server";
import { sendTaskNotificationEmails } from "@/lib/email-delivery";
import type { ApprovalTask } from "@/lib/types";
import {
  buildTaskNotifications,
  type TaskNotification,
} from "@/lib/workflow-system";

export async function POST(request: NextRequest) {
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

  return NextResponse.json(result, {
    status: result.failures.length ? 502 : 200,
  });
}
