import { NextResponse, type NextRequest } from "next/server";
import { saveCollaborationMirrorState } from "@/lib/collaboration-mirror-store";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import type { ApprovalTask } from "@/lib/types";
import type { TaskNotification } from "@/lib/workflow-system";

type RouteUser = {
  id: string;
  email: string;
};

async function getRouteUser(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
): Promise<RouteUser | null> {
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined;

  if (!claimsError && claims?.sub && claims.email) {
    return {
      id: claims.sub,
      email: claims.email,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ? { id: user.id, email: user.email } : null;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getRouteUser(supabase);

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
