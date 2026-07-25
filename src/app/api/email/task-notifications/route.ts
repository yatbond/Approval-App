import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createSupabaseJsonResponse } from "@/lib/supabase/route-response";
import { getSupabaseRouteUser } from "@/lib/supabase/route-user";

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, response);
  const user = await getSupabaseRouteUser(supabase);
  if (!user) {
    return createSupabaseJsonResponse(response, { error: "Not signed in" }, { status: 401 });
  }
  return createSupabaseJsonResponse(response,
    {
      error: "Direct notification delivery is retired. Workflow commands enqueue durable delivery atomically.",
    },
    { status: 410 },
  );
}
