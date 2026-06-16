import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  const supabase = createSupabaseRouteClient(request, response);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?mode=setup&error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 },
    );
  }

  if (!data.session) {
    return NextResponse.redirect(
      new URL("/login?message=check-email", request.url),
      { status: 303 },
    );
  }

  return response;
}
