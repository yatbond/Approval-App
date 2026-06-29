import type { EmailDeliveryResult } from "@/lib/email-delivery";
import type { TaskNotification } from "@/lib/workflow-system";

export type EmailOutboxEntry = {
  id: string;
  createdAt: string;
  requestId: string;
  recipientEmail: string;
  title: string;
  kind: TaskNotification["kind"];
  mode: EmailDeliveryResult["mode"];
  status: "sent" | "failed" | "skipped";
  message: string;
};

export function buildEmailOutboxEntries({
  notifications,
  result,
  nowIso = new Date().toISOString(),
}: {
  notifications: TaskNotification[];
  result: Partial<EmailDeliveryResult> & { error?: string };
  nowIso?: string;
}): EmailOutboxEntry[] {
  const failuresByRecipient = new Map(
    (result.failures || []).map((failure) => [
      failure.recipientEmail,
      failure.message,
    ]),
  );
  const mode = result.mode || "disabled";

  return notifications.map((notification, index) => {
    const failureMessage =
      failuresByRecipient.get(notification.recipientEmail) || result.error;
    const status = failureMessage
      ? "failed"
      : mode === "live" && (result.sent || 0) > 0
        ? "sent"
        : "skipped";

    return {
      id: `${nowIso}-${notification.id}-${index}`,
      createdAt: nowIso,
      requestId: notification.requestId,
      recipientEmail: notification.recipientEmail,
      title: notification.title,
      kind: notification.kind,
      mode,
      status,
      message:
        failureMessage ||
        (status === "sent"
          ? "Sent by Resend."
          : result.mode === "dry_run"
            ? "Dry run only. Enable EMAIL_LIVE to send."
            : "Email provider is disabled."),
    };
  });
}

export function mergeEmailOutboxEntries(
  existing: EmailOutboxEntry[],
  next: EmailOutboxEntry[],
  limit = 50,
) {
  return [...next, ...existing].slice(0, limit);
}
