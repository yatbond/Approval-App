import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskNotificationEmail,
  getEmailDeliveryConfig,
  sendTaskNotificationEmails,
} from "./email-delivery.ts";

const notification = {
  id: "APR-1-notify-owner",
  title: "Action required",
  body: "Invoice approval is waiting at Department review.",
  time: "Today",
  unread: true,
  requestId: "APR-1",
  recipientEmail: "approver@example.com",
  kind: "action_required",
};

test("email delivery config defaults to dry run when live email is not enabled", () => {
  const config = getEmailDeliveryConfig({
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "secret",
    EMAIL_FROM: "Approval App <approval@example.com>",
  });

  assert.equal(config.provider, "resend");
  assert.equal(config.live, false);
  assert.equal(config.from, "Approval App <approval@example.com>");
});

test("email delivery config enables live resend only with provider, key, and from address", () => {
  const config = getEmailDeliveryConfig({
    EMAIL_PROVIDER: "resend",
    EMAIL_LIVE: "true",
    RESEND_API_KEY: "secret",
    EMAIL_FROM: "Approval App <approval@example.com>",
  });

  assert.equal(config.provider, "resend");
  assert.equal(config.live, true);
  assert.equal(config.apiKey, "secret");
});

test("builds workflow notification email with request link and original recipient when redirected", () => {
  const email = buildTaskNotificationEmail({
    notification,
    from: "Approval App <approval@example.com>",
    appUrl: "http://localhost:3000",
    redirectTo: "tester@example.com",
  });

  assert.equal(email.to, "tester@example.com");
  assert.equal(email.from, "Approval App <approval@example.com>");
  assert.match(email.subject, /Action required/);
  assert.match(email.text, /Original recipient: approver@example.com/);
  assert.match(email.text, /http:\/\/localhost:3000\/\?tab=tracking&request=APR-1/);
});

test("dry run returns skipped sends without calling fetch", async () => {
  let didFetch = false;
  const result = await sendTaskNotificationEmails({
    notifications: [notification],
    env: {
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "secret",
      EMAIL_FROM: "Approval App <approval@example.com>",
    },
    fetchImpl: async () => {
      didFetch = true;
      throw new Error("should not fetch");
    },
  });

  assert.equal(didFetch, false);
  assert.equal(result.mode, "dry_run");
  assert.equal(result.attempted, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
});

test("live resend posts email payloads to the Resend API", async () => {
  const calls = [];
  const result = await sendTaskNotificationEmails({
    notifications: [notification],
    env: {
      EMAIL_PROVIDER: "resend",
      EMAIL_LIVE: "true",
      RESEND_API_KEY: "secret",
      EMAIL_FROM: "Approval App <approval@example.com>",
      EMAIL_TEST_REDIRECT_TO: "tester@example.com",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({ id: "email-1" }),
      };
    },
  });

  assert.equal(result.mode, "live");
  assert.equal(result.sent, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret");
  assert.equal(JSON.parse(calls[0].init.body).to, "tester@example.com");
});

test("live resend reports provider failures", async () => {
  const result = await sendTaskNotificationEmails({
    notifications: [notification],
    env: {
      EMAIL_PROVIDER: "resend",
      EMAIL_LIVE: "true",
      RESEND_API_KEY: "secret",
      EMAIL_FROM: "Approval App <approval@example.com>",
    },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      text: async () => "domain not verified",
    }),
  });

  assert.equal(result.sent, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /403/);
});
