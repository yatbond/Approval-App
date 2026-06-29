import type { TaskNotification } from "@/lib/workflow-system";

type EmailEnv = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type EmailDeliveryConfig = {
  provider: "resend" | "none";
  live: boolean;
  apiKey: string;
  from: string;
  appUrl: string;
  redirectTo: string;
};

export type WorkflowEmail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryResult = {
  mode: "disabled" | "dry_run" | "live";
  attempted: number;
  sent: number;
  skipped: number;
  failures: Array<{ recipientEmail: string; message: string }>;
};

export function getEmailDeliveryConfig(
  env: EmailEnv = process.env,
): EmailDeliveryConfig {
  const provider = env.EMAIL_PROVIDER === "resend" ? "resend" : "none";
  const apiKey = env.RESEND_API_KEY?.trim() || "";
  const from = env.EMAIL_FROM?.trim() || "Approval App <onboarding@resend.dev>";
  const appUrl =
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    env.OPENROUTER_SITE_URL?.trim() ||
    "http://localhost:3000";
  const redirectTo = env.EMAIL_TEST_REDIRECT_TO?.trim() || "";
  const live =
    provider === "resend" &&
    env.EMAIL_LIVE === "true" &&
    Boolean(apiKey) &&
    Boolean(from);

  return {
    provider,
    live,
    apiKey,
    from,
    appUrl,
    redirectTo,
  };
}

export function buildTaskNotificationEmail({
  notification,
  from,
  appUrl,
  redirectTo = "",
}: {
  notification: TaskNotification;
  from: string;
  appUrl: string;
  redirectTo?: string;
}): WorkflowEmail {
  const requestUrl = `${appUrl.replace(/\/$/, "")}/?tab=tracking&request=${encodeURIComponent(
    notification.requestId,
  )}`;
  const to = redirectTo || notification.recipientEmail;
  const originalRecipientLine = redirectTo
    ? `\nOriginal recipient: ${notification.recipientEmail}`
    : "";
  const subject = `[Approval App] ${notification.title}: ${notification.requestId}`;
  const text = [
    notification.body,
    "",
    `Request: ${notification.requestId}`,
    `Notification type: ${notification.kind}`,
    `Open request: ${requestUrl}`,
    originalRecipientLine.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    to,
    from,
    subject,
    text,
    html: [
      `<p>${escapeHtml(notification.body)}</p>`,
      "<ul>",
      `<li><strong>Request:</strong> ${escapeHtml(notification.requestId)}</li>`,
      `<li><strong>Notification type:</strong> ${escapeHtml(notification.kind)}</li>`,
      redirectTo
        ? `<li><strong>Original recipient:</strong> ${escapeHtml(notification.recipientEmail)}</li>`
        : "",
      "</ul>",
      `<p><a href="${escapeHtml(requestUrl)}">Open request</a></p>`,
    ]
      .filter(Boolean)
      .join(""),
  };
}

export async function sendTaskNotificationEmails({
  notifications,
  env = process.env,
  fetchImpl = fetch,
}: {
  notifications: TaskNotification[];
  env?: EmailEnv;
  fetchImpl?: FetchLike;
}): Promise<EmailDeliveryResult> {
  const config = getEmailDeliveryConfig(env);
  const attempted = notifications.length;

  if (!attempted) {
    return {
      mode: config.live ? "live" : config.provider === "none" ? "disabled" : "dry_run",
      attempted: 0,
      sent: 0,
      skipped: 0,
      failures: [],
    };
  }

  if (config.provider === "none") {
    return {
      mode: "disabled",
      attempted,
      sent: 0,
      skipped: attempted,
      failures: [],
    };
  }

  if (!config.live) {
    return {
      mode: "dry_run",
      attempted,
      sent: 0,
      skipped: attempted,
      failures: [],
    };
  }

  let sent = 0;
  const failures: EmailDeliveryResult["failures"] = [];

  for (const notification of notifications) {
    const email = buildTaskNotificationEmail({
      notification,
      from: config.from,
      appUrl: config.appUrl,
      redirectTo: config.redirectTo,
    });

    try {
      await sendResendEmail({
        apiKey: config.apiKey,
        email,
        fetchImpl,
      });
      sent += 1;
    } catch (error) {
      failures.push({
        recipientEmail: notification.recipientEmail,
        message: error instanceof Error ? error.message : "Unknown email error",
      });
    }
  }

  return {
    mode: "live",
    attempted,
    sent,
    skipped: attempted - sent - failures.length,
    failures,
  };
}

async function sendResendEmail({
  apiKey,
  email,
  fetchImpl,
}: {
  apiKey: string;
  email: WorkflowEmail;
  fetchImpl: FetchLike;
}) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed with ${response.status}: ${detail}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
