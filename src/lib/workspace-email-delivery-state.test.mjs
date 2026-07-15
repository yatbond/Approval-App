import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  formatEmailDeliveryMessage,
  getEmailDeliveryErrorMessage,
} from "./workspace-email-delivery-state.ts";

test("formats successful email delivery counts", () => {
  assert.equal(
    formatEmailDeliveryMessage({
      mode: "live",
      attempted: 3,
      sent: 2,
      skipped: 1,
    }),
    "Email live: 2 sent, 1 skipped, 3 attempted.",
  );
});

test("includes the first provider failure in the email delivery message", () => {
  assert.equal(
    formatEmailDeliveryMessage({
      mode: "live",
      attempted: 2,
      sent: 1,
      failures: [{ message: "Mailbox unavailable" }],
    }),
    "Email live: 1 sent, 0 skipped, 2 attempted. 1 failed: Mailbox unavailable",
  );
});

test("prioritizes request-level email errors", () => {
  assert.equal(
    formatEmailDeliveryMessage({ error: "Provider is not configured" }),
    "Email failed: Provider is not configured",
  );
});

test("normalizes thrown and unknown delivery errors", () => {
  assert.equal(getEmailDeliveryErrorMessage(new Error("Network down"), "Fallback"), "Network down");
  assert.equal(getEmailDeliveryErrorMessage("Network down", "Fallback"), "Fallback");
});

test("workspace delegates delivery endpoints to the focused controller", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");
  const controllerSource = readFileSync(
    "src/app/use-workspace-email-delivery.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes("useWorkspaceEmailDelivery"), true);
  assert.equal(workspaceSource.includes("/api/email/task-notifications"), false);
  assert.equal(workspaceSource.includes("/api/email/test"), false);
  assert.equal(controllerSource.includes("/api/email/task-notifications"), true);
  assert.equal(controllerSource.includes("/api/email/test"), true);
});
