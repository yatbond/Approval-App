import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getSchedulerRunKey, isAuthorizedCronRequest } from "./cron-auth.ts";
import {
  EmailProviderError,
  isRetryableProviderStatus,
  sendDurableOutboxEmail,
} from "./email-delivery.ts";

const migration = fs.readFileSync(
  new URL("../../supabase/migrations/20260720060000_durable_scheduler_and_outbox.sql", import.meta.url),
  "utf8",
);

test("cron authentication uses a configured bearer secret and stable minute replay key", () => {
  const request = new Request("https://example.test/api/cron/approval-operations", {
    headers: {
      authorization: "Bearer 0123456789abcdef",
      "x-vercel-deployment-url": "Approval.Example.com",
    },
  });
  assert.equal(isAuthorizedCronRequest(request, "0123456789abcdef"), true);
  assert.equal(isAuthorizedCronRequest(request, "wrong-wrong-wrong"), false);
  assert.equal(isAuthorizedCronRequest(request, ""), false);
  assert.equal(
    getSchedulerRunKey(request, new Date("2026-07-19T10:42:59.999Z")),
    "approval-operations:approval.example.com:2026-07-19T10:42",
  );
});

test("durable Resend send uses the outbox id as provider idempotency key", async () => {
  let captured;
  const id = await sendDurableOutboxEmail({
    row: {
      id: "20db11f0-bacf-4d42-82bd-f4e69c0c7307",
      recipient_email: "owner@example.com",
      template_key: "approval-escalation",
      payload: { requestNo: "APR-6", title: "Escalated", body: "Needs action", href: "/?request=APR-6" },
      lease_token: "d30e09bb-4222-4160-b852-e1a8c7ac78ef",
    },
    env: {
      EMAIL_PROVIDER: "resend",
      EMAIL_LIVE: "true",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Approval <approval@example.com>",
      NEXT_PUBLIC_APP_URL: "https://approval.example.com",
    },
    fetchImpl: async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({ id: "provider-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(id, "provider-message-1");
  assert.equal(captured.headers["Idempotency-Key"], "approval-outbox-20db11f0-bacf-4d42-82bd-f4e69c0c7307");
});

test("provider failures distinguish retryable and permanent responses", async () => {
  assert.equal(isRetryableProviderStatus(429), true);
  assert.equal(isRetryableProviderStatus(503), true);
  assert.equal(isRetryableProviderStatus(400), false);
  await assert.rejects(
    sendDurableOutboxEmail({
      row: {
        id: "20db11f0-bacf-4d42-82bd-f4e69c0c7307",
        recipient_email: "owner@example.com",
        template_key: "approval-update",
        payload: {},
        lease_token: "d30e09bb-4222-4160-b852-e1a8c7ac78ef",
      },
      env: {
        EMAIL_PROVIDER: "resend", EMAIL_LIVE: "true", RESEND_API_KEY: "re_test",
        EMAIL_FROM: "Approval <approval@example.com>",
      },
      fetchImpl: async () => new Response("invalid recipient", { status: 422 }),
    }),
    (error) => error instanceof EmailProviderError && error.retryable === false,
  );
});

test("phase 6 migration defines row claims, leases, bounded attempts, and service-only RPCs", () => {
  assert.match(migration, /for update of r skip locked/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /lease_expires_at/i);
  assert.match(migration, /lease_owner = left\(trim\(p_worker_id\)/i);
  assert.match(migration, /attempt_count >= v_row\.max_attempts/i);
  assert.match(migration, /from public, anon, authenticated/i);
  assert.match(migration, /approval_scheduler_runs/i);
  assert.match(migration, /delegation_expired/i);
});
