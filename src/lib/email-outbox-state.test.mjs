import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmailOutboxEntries,
  mergeEmailOutboxEntries,
} from "./email-outbox-state.ts";

const notifications = [
  {
    id: "APR-1-owner",
    title: "Action required",
    body: "Invoice request is waiting.",
    time: "Today",
    unread: true,
    requestId: "APR-1",
    recipientEmail: "approver@example.com",
    kind: "action_required",
  },
  {
    id: "APR-1-originator",
    title: "Request status updated",
    body: "Invoice request moved.",
    time: "Today",
    unread: false,
    requestId: "APR-1",
    recipientEmail: "originator@example.com",
    kind: "originator_update",
  },
];

test("builds sent outbox entries for successful live delivery", () => {
  const entries = buildEmailOutboxEntries({
    notifications,
    result: {
      mode: "live",
      attempted: 2,
      sent: 2,
      skipped: 0,
      failures: [],
    },
    nowIso: "2026-06-24T08:00:00.000Z",
  });

  assert.deepEqual(
    entries.map((entry) => ({
      recipientEmail: entry.recipientEmail,
      status: entry.status,
      requestId: entry.requestId,
    })),
    [
      {
        recipientEmail: "approver@example.com",
        status: "sent",
        requestId: "APR-1",
      },
      {
        recipientEmail: "originator@example.com",
        status: "sent",
        requestId: "APR-1",
      },
    ],
  );
});

test("maps provider failures to failed recipients and keeps successful recipients sent", () => {
  const entries = buildEmailOutboxEntries({
    notifications,
    result: {
      mode: "live",
      attempted: 2,
      sent: 1,
      skipped: 0,
      failures: [
        {
          recipientEmail: "originator@example.com",
          message: "domain not verified",
        },
      ],
    },
    nowIso: "2026-06-24T08:00:00.000Z",
  });

  assert.equal(entries[0].status, "sent");
  assert.equal(entries[1].status, "failed");
  assert.equal(entries[1].message, "domain not verified");
});

test("marks dry-run and disabled deliveries as skipped", () => {
  const entries = buildEmailOutboxEntries({
    notifications,
    result: {
      mode: "dry_run",
      attempted: 2,
      sent: 0,
      skipped: 2,
      failures: [],
    },
    nowIso: "2026-06-24T08:00:00.000Z",
  });

  assert.deepEqual(entries.map((entry) => entry.status), ["skipped", "skipped"]);
});

test("marks request-level delivery errors as failed for every recipient", () => {
  const entries = buildEmailOutboxEntries({
    notifications,
    result: {
      error: "Email API unavailable",
    },
    nowIso: "2026-06-24T08:00:00.000Z",
  });

  assert.deepEqual(entries.map((entry) => entry.status), ["failed", "failed"]);
  assert.deepEqual(entries.map((entry) => entry.message), [
    "Email API unavailable",
    "Email API unavailable",
  ]);
});

test("merges newest outbox entries first and limits history", () => {
  const existing = Array.from({ length: 40 }, (_, index) => ({
    id: `old-${index}`,
    createdAt: "2026-06-23T08:00:00.000Z",
    requestId: `OLD-${index}`,
    recipientEmail: "old@example.com",
    title: "Old",
    kind: "fyi",
    mode: "live",
    status: "sent",
    message: "",
  }));
  const next = buildEmailOutboxEntries({
    notifications,
    result: {
      mode: "live",
      attempted: 2,
      sent: 2,
      skipped: 0,
      failures: [],
    },
    nowIso: "2026-06-24T08:00:00.000Z",
  });

  const merged = mergeEmailOutboxEntries(existing, next, 25);

  assert.equal(merged.length, 25);
  assert.equal(merged[0].id, next[0].id);
  assert.equal(merged[1].id, next[1].id);
});
