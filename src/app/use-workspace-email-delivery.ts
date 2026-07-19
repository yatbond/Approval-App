"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildEmailOutboxEntries,
  type EmailOutboxEntry,
} from "@/lib/email-outbox-state";
import { getLiveEmailConfirmation, type ConfirmationRequest } from "@/lib/confirmation-policy";
import type { ApprovalTask } from "@/lib/types";
import {
  buildWorkflowTestNotification,
  isWorkflowTestTask,
} from "@/lib/workflow-test-request-state";
import {
  type TaskNotification,
} from "@/lib/workflow-system";
import {
  formatEmailDeliveryMessage,
  getEmailDeliveryErrorMessage,
} from "@/lib/workspace-email-delivery-state";

export function useWorkspaceEmailDelivery({
  requestConfirmation,
}: {
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
}) {
  const [emailDeliveryMessage, setEmailDeliveryMessage] = useState("");
  const [emailOutboxEntries, setEmailOutboxEntries] = useState<EmailOutboxEntry[]>([]);

  const refreshOutbox = useCallback(async () => {
    const response = await fetch("/api/email/outbox", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { entries?: ServerOutboxEntry[] };
    setEmailOutboxEntries((payload.entries || []).map(mapServerOutboxEntry));
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refreshOutbox());
  }, [refreshOutbox]);

  async function sendWorkflowEmailNotifications(
    task: ApprovalTask,
    notificationsOverride?: TaskNotification[],
  ) {
    const effectiveNotifications =
      notificationsOverride ||
      (isWorkflowTestTask(task) ? [buildWorkflowTestNotification(task)] : undefined);
    void effectiveNotifications;
    void task;
    setEmailDeliveryMessage("Notifications were queued atomically with the workflow update.");
    await refreshOutbox();
  }

  async function sendTestEmail(to: string) {
    const confirmed = await requestConfirmation(
      getLiveEmailConfirmation({ recipientEmail: to }),
    );
    if (!confirmed) {
      return;
    }

    const testNotification: TaskNotification = {
      id: `test-email-${Date.now()}`,
      title: "Test email",
      body: "This is a live Approval App email test.",
      time: new Date().toISOString(),
      unread: true,
      requestId: "TEST",
      recipientEmail: to,
      kind: "fyi",
    };
    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const result = await response.json();
      setEmailDeliveryMessage(formatEmailDeliveryMessage(result));
      setEmailOutboxEntries((entries) => [
        ...buildEmailOutboxEntries({ notifications: [testNotification], result }),
        ...entries,
      ].slice(0, 50));
    } catch (error) {
      const errorMessage = getEmailDeliveryErrorMessage(error, "Email test failed.");
      setEmailOutboxEntries((entries) => [
        ...buildEmailOutboxEntries({
          notifications: [testNotification],
          result: { error: errorMessage },
        }),
        ...entries,
      ].slice(0, 50));
      setEmailDeliveryMessage(`Email test failed: ${errorMessage}`);
    }
  }

  async function retryOutboxEntry(id: string) {
    const response = await fetch("/api/email/outbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) throw new Error("Unable to retry this outbox entry.");
    setEmailDeliveryMessage("Outbox entry queued for retry.");
    await refreshOutbox();
  }

  return {
    emailDeliveryMessage,
    emailOutboxEntries,
    sendTestEmail,
    sendWorkflowEmailNotifications,
    retryOutboxEntry,
  };
}

type ServerOutboxEntry = {
  id: string;
  created_at: string;
  recipient_email: string;
  template_key: string;
  status: EmailOutboxEntry["status"];
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  provider_message_id: string | null;
  last_error_message: string | null;
  payload: { title?: string; requestNo?: string };
  approval_requests?: { request_no?: string } | Array<{ request_no?: string }>;
};

function mapServerOutboxEntry(entry: ServerOutboxEntry): EmailOutboxEntry {
  const request = Array.isArray(entry.approval_requests)
    ? entry.approval_requests[0]
    : entry.approval_requests;
  return {
    id: entry.id,
    createdAt: entry.created_at,
    requestId: entry.payload.requestNo || request?.request_no || "",
    recipientEmail: entry.recipient_email,
    title: entry.payload.title || entry.template_key,
    kind: entry.template_key === "approval-escalation" ? "escalation" : "originator_update",
    mode: "live",
    status: entry.status,
    message: entry.last_error_message || entry.provider_message_id ||
      `Attempt ${entry.attempt_count}/${entry.max_attempts}; next ${entry.next_attempt_at}`,
  };
}
