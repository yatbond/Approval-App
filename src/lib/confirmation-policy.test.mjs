import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminRecordDeleteConfirmation,
  getApprovalActionConfirmation,
  getDraftDeleteConfirmation,
  getLiveEmailConfirmation,
  getSignOutConfirmation,
  getWorkflowCanvasDeleteConfirmation,
  getWorkflowTemplateArchiveConfirmation,
} from "./confirmation-policy.ts";

test("keeps approval actions one-click while confirming risky decisions", () => {
  assert.equal(
    getApprovalActionConfirmation({ action: "approve", taskTitle: "Invoice" }),
    null,
  );
  assert.equal(
    getApprovalActionConfirmation({
      action: "approve_with_comment",
      taskTitle: "Invoice",
    }),
    null,
  );

  const rejection = getApprovalActionConfirmation({
    action: "reject",
    taskTitle: "Invoice",
  });
  assert.equal(rejection?.confirmLabel, "Reject request");
  assert.match(rejection?.message || "", /Invoice/);

  const reassignment = getApprovalActionConfirmation({
    action: "reassign",
    taskTitle: "Invoice",
    targetEmail: "manager@example.com",
  });
  assert.equal(reassignment?.confirmLabel, "Reassign request");
  assert.match(reassignment?.message || "", /manager@example\.com/);

  const cancellation = getApprovalActionConfirmation({
    action: "cancel",
    taskTitle: "Invoice",
  });
  assert.equal(cancellation?.confirmLabel, "Cancel request");
});

test("destructive records, drafts, templates, canvas edits, and email sends require confirmation", () => {
  assert.equal(
    getAdminRecordDeleteConfirmation({
      recordType: "business",
      recordName: "Chun Wo Construction",
    }).confirmLabel,
    "Delete business",
  );
  assert.match(
    getDraftDeleteConfirmation({
      draftTitle: "Gleneagles final account",
      action: "delete",
    }).message,
    /Gleneagles final account/,
  );
  assert.equal(
    getWorkflowTemplateArchiveConfirmation({
      templateName: "General approval workflow",
    }).confirmLabel,
    "Archive template",
  );
  assert.equal(
    getWorkflowCanvasDeleteConfirmation({ itemLabel: "Finance review box" })
      .confirmLabel,
    "Delete item",
  );
  assert.equal(
    getLiveEmailConfirmation({ recipientEmail: "approver@example.com" })
      .confirmLabel,
    "Send test email",
  );
});

test("sign out requires explicit confirmation", () => {
  assert.deepEqual(getSignOutConfirmation(), {
    title: "Sign out?",
    message: "This will end your current Approval App session.",
    confirmLabel: "Sign out",
    tone: "warning",
  });
});
