"use client";

import { useState } from "react";
import {
  buildEmailOutboxEntries,
  mergeEmailOutboxEntries,
  type EmailOutboxEntry,
} from "@/lib/email-outbox-state";
import { getLiveEmailConfirmation, type ConfirmationRequest } from "@/lib/confirmation-policy";
import type { ApprovalTask } from "@/lib/types";
import {
  buildWorkflowTestNotification,
  isWorkflowTestTask,
} from "@/lib/workflow-test-request-state";
import {
  buildTaskNotifications,
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

  async function sendWorkflowEmailNotifications(
    task: ApprovalTask,
    notificationsOverride?: TaskNotification[],
  ) {
    const effectiveNotifications =
      notificationsOverride ||
      (isWorkflowTestTask(task) ? [buildWorkflowTestNotification(task)] : undefined);
    const notifications = effectiveNotifications || buildTaskNotifications([task]);
    try {
      const response = await fetch("/api/email/task-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          effectiveNotifications ? { notifications: effectiveNotifications } : { task },
        ),
      });
      const result = await response.json();
      setEmailDeliveryMessage(formatEmailDeliveryMessage(result));
      setEmailOutboxEntries((entries) =>
        mergeEmailOutboxEntries(
          entries,
          buildEmailOutboxEntries({ notifications, result }),
        ),
      );
    } catch (error) {
      const errorMessage = getEmailDeliveryErrorMessage(
        error,
        "Email delivery failed.",
      );
      setEmailOutboxEntries((entries) =>
        mergeEmailOutboxEntries(
          entries,
          buildEmailOutboxEntries({
            notifications,
            result: { error: errorMessage },
          }),
        ),
      );
      setEmailDeliveryMessage(`Email delivery failed: ${errorMessage}`);
    }
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
      setEmailOutboxEntries((entries) =>
        mergeEmailOutboxEntries(
          entries,
          buildEmailOutboxEntries({ notifications: [testNotification], result }),
        ),
      );
    } catch (error) {
      const errorMessage = getEmailDeliveryErrorMessage(error, "Email test failed.");
      setEmailOutboxEntries((entries) =>
        mergeEmailOutboxEntries(
          entries,
          buildEmailOutboxEntries({
            notifications: [testNotification],
            result: { error: errorMessage },
          }),
        ),
      );
      setEmailDeliveryMessage(`Email test failed: ${errorMessage}`);
    }
  }

  return {
    emailDeliveryMessage,
    emailOutboxEntries,
    sendTestEmail,
    sendWorkflowEmailNotifications,
  };
}
