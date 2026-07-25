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

export type DurableEmailOutboxRow = {
  id: string;
  recipient_email: string;
  template_key: string;
  payload: {
    requestNo?: string;
    title?: string;
    body?: string;
    href?: string;
  };
  lease_token: string;
};

export class EmailProviderError extends Error {
  retryable: boolean;
  provider_status: number;

  constructor(message: string, providerStatus: number, retryable: boolean) {
    super(message);
    this.name = "EmailProviderError";
    this.retryable = retryable;
    this.provider_status = providerStatus;
  }
}

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
  const requestUrl = `${appUrl.replace(/\/$/, "")}/?tab=${notification.targetTab || "tracking"}&request=${encodeURIComponent(
    notification.requestId,
  )}`;
  const to = redirectTo || notification.recipientEmail;
  const originalRecipientLine = redirectTo
    ? `\nOriginal recipient: ${notification.recipientEmail}`
    : "";
  const subject = `[Approval App] ${notification.title}: ${notification.requestId}`;
  const detailLines = (notification.details || []).map(
    (detail) => `${detail.label}: ${detail.value}`,
  );
  const text = [
    notification.body,
    "",
    ...detailLines,
    ...(detailLines.length ? [""] : []),
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
      ...(notification.details?.length
        ? [
            "<ul>",
            ...notification.details.map(
              (detail) =>
                `<li><strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}</li>`,
            ),
            "</ul>",
          ]
        : []),
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
    throw new EmailProviderError(
      `Resend failed with ${response.status}: ${detail}`,
      response.status,
      isRetryableProviderStatus(response.status),
    );
  }
}

export async function sendDurableOutboxEmail({
  row,
  env = process.env,
  fetchImpl = fetch,
}: {
  row: DurableEmailOutboxRow;
  env?: EmailEnv;
  fetchImpl?: FetchLike;
}) {
  const config = getEmailDeliveryConfig(env);
  if (!config.live) throw new Error("Live email delivery is not configured.");
  const requestNo = row.payload.requestNo?.trim() || "Approval request";
  const href = row.payload.href?.trim() || "/";
  const url = href.startsWith("http")
    ? href
    : `${config.appUrl.replace(/\/$/, "")}${href.startsWith("/") ? "" : "/"}${href}`;
  const to = config.redirectTo || row.recipient_email;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `approval-outbox-${row.id}`,
    },
    body: JSON.stringify({
      from: config.from,
      to,
      subject: `[Approval App] ${row.payload.title || requestNo}`,
      text: `${row.payload.body || "Approval request updated."}\n\nOpen request: ${url}`,
      html: `<p>${escapeHtml(row.payload.body || "Approval request updated.")}</p><p><a href="${escapeHtml(url)}">Open request</a></p>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new EmailProviderError(
      `Resend failed with ${response.status}: ${detail}`,
      response.status,
      isRetryableProviderStatus(response.status),
    );
  }
  const result = (await response.json().catch(() => ({}))) as { id?: string };
  if (!result.id) {
    throw new EmailProviderError("Resend response did not include a message id.", 502, true);
  }
  return result.id;
}

export function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
