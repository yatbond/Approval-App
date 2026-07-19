import { NextResponse } from "next/server";
import { createSupabaseJsonResponse } from "@/lib/supabase/route-response";

export async function POST() {
  return createSupabaseJsonResponse(
    NextResponse.next(),
    {
      error: {
        code: "legacy_endpoint_retired",
        message:
          "Collaboration changes must use the versioned approval request command API.",
      },
    },
    {
      status: 410,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
