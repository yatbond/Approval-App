import { NextResponse, type NextRequest } from "next/server";
import { saveCollaborationMirrorState } from "@/lib/collaboration-mirror-store";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";
import type { ApprovalTask } from "@/lib/types";
import type { TaskNotification } from "@/lib/workflow-system";

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ mode: "supabase" });
  } catch (error) {
    return NextResponse.json(
      {
        mode: "local",
        reason:
          error instanceof Error
            ? error.message
            : "Collaboration persistence failed.",
      },
      { status: 503 },
    );
  }
}
