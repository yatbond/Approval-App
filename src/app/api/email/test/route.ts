import { NextResponse, type NextRequest } from "next/server";
import { sendTaskNotificationEmails } from "@/lib/email-delivery";
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

  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
  };
  const recipientEmail = body.to?.trim() || process.env.EMAIL_TEST_REDIRECT_TO?.trim();

  if (!recipientEmail) {
    return createSupabaseJsonResponse(response,
      { error: "A test recipient email is required." },
      { status: 400 },
    );
  }

  const result = await sendTaskNotificationEmails({
    notifications: [
      {
        id: `test-email-${Date.now()}`,
        title: "Test email",
        body: "This is a live Approval App email test.",
        time: new Date().toISOString(),
        unread: true,
        requestId: "TEST",
        recipientEmail,
        kind: "fyi",
      },
    ],
  });

  return createSupabaseJsonResponse(response, result, {
    status: result.failures.length ? 502 : 200,
  });
}
