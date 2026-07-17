import { NextResponse, type NextRequest } from "next/server";
import { saveCollaborationMirrorState } from "@/lib/collaboration-mirror-store";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";
import type { ApprovalTask } from "@/lib/types";
import type { TaskNotification } from "@/lib/workflow-system";
import { recordWorkflowOperationEvent } from "@/lib/workflow-operation-monitor";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);

  if (!user) {
    return NextResponse.json(
      { mode: "local", reason: "Not signed in" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    task?: ApprovalTask;
    notifications?: TaskNotification[];
  };
  if (!body.task?.id || !Array.isArray(body.notifications)) {
    return NextResponse.json(
      { mode: "local", reason: "A task and notifications array are required." },
      { status: 400 },
    );
  }

  try {
    await saveCollaborationMirrorState(supabase, body.task, body.notifications);
    await recordWorkflowOperationEvent(supabase, {
      ownerUserId: user.id,
      ownerEmail: user.email,
      operationType: "collaboration",
      outcome: "succeeded",
      requestNo: body.task.id,
      durationMs: Date.now() - startedAt,
      message: "Collaboration state saved.",
      details: {
        collaborationRequests: body.task.collaborationRequests?.length || 0,
        sharedFulfillments: body.task.sharedFulfillments?.length || 0,
        correctionRequests: body.task.correctionRequests?.length || 0,
        notifications: body.notifications.length,
      },
    });
    return NextResponse.json({ mode: "supabase" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Collaboration persistence failed.";
    await recordWorkflowOperationEvent(supabase, {
      ownerUserId: user.id,
      ownerEmail: user.email,
      operationType: "collaboration",
      outcome: "failed",
      requestNo: body.task.id,
      durationMs: Date.now() - startedAt,
      message,
    });
    return NextResponse.json(
      {
        mode: "local",
        reason: message,
      },
      { status: 503 },
    );
  }
}
