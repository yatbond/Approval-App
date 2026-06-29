import type { ApprovalAction } from "@/lib/types";

export type ConfirmationTone = "danger" | "warning";

export type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmationTone;
};

function quoted(value: string) {
  return value.trim() ? `"${value.trim()}"` : "this item";
}

export function getApprovalActionConfirmation({
  action,
  taskTitle,
  targetEmail = "",
}: {
  action: ApprovalAction;
  taskTitle: string;
  targetEmail?: string;
}): ConfirmationRequest | null {
  if (action === "approve" || action === "approve_with_comment") {
    return null;
  }

  const requestName = quoted(taskTitle);
  if (action === "reject" || action === "reject_with_comment") {
    return {
      title: "Reject request?",
      message: `This will reject ${requestName} and send it back through the configured rejection path.`,
      confirmLabel: "Reject request",
      tone: "danger",
    };
  }

  if (action === "reassign") {
    return {
      title: "Request reassignment?",
      message: `This will ask ${targetEmail || "the entered target email"} to take ownership of ${requestName}. You stay responsible until they accept.`,
      confirmLabel: "Request reassignment",
      tone: "warning",
    };
  }

  if (action === "delegate") {
    return {
      title: "Delegate request?",
      message: `This will let ${targetEmail || "the entered target email"} act on ${requestName} while you remain the owner.`,
      confirmLabel: "Delegate request",
      tone: "warning",
    };
  }

  if (action === "cancel") {
    return {
      title: "Cancel?",
      message: `This will close ${requestName}. The request will remain trackable, but it will no longer continue through approval.`,
      confirmLabel: "Cancel",
      tone: "danger",
    };
  }

  return null;
}

export function getAdminRecordDeleteConfirmation({
  recordType,
  recordName,
}: {
  recordType: "business" | "department";
  recordName: string;
}): ConfirmationRequest {
  return {
    title: `Delete ${recordType}?`,
    message: `This will remove ${quoted(recordName)} from active admin setup. Existing historical requests will keep their saved data.`,
    confirmLabel: recordType === "business" ? "Delete business" : "Delete department",
    tone: "danger",
  };
}

export function getDraftDeleteConfirmation({
  draftTitle,
  action,
}: {
  draftTitle: string;
  action: "clear" | "delete";
}): ConfirmationRequest {
  return {
    title: action === "clear" ? "Clear draft?" : "Delete draft?",
    message: `This will ${action} ${quoted(draftTitle)} and cannot be undone.`,
    confirmLabel: action === "clear" ? "Clear draft" : "Delete draft",
    tone: "danger",
  };
}

export function getWorkflowTemplateArchiveConfirmation({
  templateName,
}: {
  templateName: string;
}): ConfirmationRequest {
  return {
    title: "Archive workflow template?",
    message: `This will archive ${quoted(templateName)} so it cannot be used for new requests. Existing requests keep their saved workflow copy.`,
    confirmLabel: "Archive template",
    tone: "danger",
  };
}

export function getWorkflowCanvasDeleteConfirmation({
  itemLabel,
}: {
  itemLabel: string;
}): ConfirmationRequest {
  return {
    title: "Delete workflow item?",
    message: `This will delete ${quoted(itemLabel)} from the workflow canvas. You can use Undo if this was a mistake.`,
    confirmLabel: "Delete item",
    tone: "danger",
  };
}

export function getLiveEmailConfirmation({
  recipientEmail,
}: {
  recipientEmail: string;
}): ConfirmationRequest {
  return {
    title: "Send test email?",
    message: `This will send a test email to ${recipientEmail || "the entered recipient"}.`,
    confirmLabel: "Send test email",
    tone: "warning",
  };
}

export function getSignOutConfirmation(): ConfirmationRequest {
  return {
    title: "Sign out?",
    message: "This will end your current Approval App session.",
    confirmLabel: "Sign out",
    tone: "warning",
  };
}
