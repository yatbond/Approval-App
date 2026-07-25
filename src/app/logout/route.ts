import { type NextRequest, NextResponse } from "next/server";
import { shouldSignOutWithSupabase } from "@/lib/logout-route-state";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  if (
    !shouldSignOutWithSupabase({
      cookies: request.cookies.getAll(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    })
  ) {
    return response;
  }

  const supabase = createSupabaseRouteClient(request, response);

  await supabase.auth.signOut();
  return response;
}
