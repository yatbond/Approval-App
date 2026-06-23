import { NextResponse, type NextRequest } from "next/server";
import { sendTaskNotificationEmails } from "@/lib/email-delivery";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    to?: string;
  };
  const recipientEmail = body.to?.trim() || process.env.EMAIL_TEST_REDIRECT_TO?.trim();

  if (!recipientEmail) {
    return NextResponse.json(
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

  return NextResponse.json(result, {
    status: result.failures.length ? 502 : 200,
  });
}
