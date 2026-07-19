import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("phase four stress covers the complete race and retry matrix", () => {
  const script = read("../../scripts/test-authoritative-concurrency.mjs");
  for (const scenario of [
    "approve/approve",
    "approve/reject",
    "approve/reassign",
    "request_correction/approve",
    "cancel/approve",
  ]) {
    assert.match(script, new RegExp(scenario.replace("/", "\\/")));
  }
  assert.match(script, /APPROVAL_RACE_ITERATIONS \|\| 1_000/);
  assert.match(script, /\["applied", "stale"\]/);
  assert.match(script, /\["applied", "replayed"\]/);
  assert.match(script, /idempotency_conflict/);
  assert.match(script, /rate_limited/);
  assert.match(script, /approval_command_receipts/);
  assert.match(script, /approval_request_events/);
  assert.match(script, /approval_notifications/);
  assert.match(script, /approval_email_outbox/);
});

test("failure injection covers every transaction write boundary", () => {
  const sql = read(
    "../../supabase/tests/authoritative_command_failure_injection.sql",
  );
  for (const step of [
    "approval_command_receipts:INSERT",
    "approval_requests:UPDATE",
    "approval_request_participants:UPDATE",
    "approval_request_events:INSERT",
    "approval_notifications:INSERT",
    "approval_email_outbox:INSERT",
    "approval_command_receipts:UPDATE",
  ]) {
    assert.ok(sql.includes(step), step);
  }
  assert.match(sql, /request changed after injected failure/);
  assert.match(sql, /receipt leaked after injected failure/);
  assert.match(sql, /event leaked after injected failure/);
  assert.match(sql, /notification leaked after injected failure/);
  assert.match(sql, /outbox row leaked after injected failure/);
});

test("lock contention proof enforces the bounded database wait", () => {
  const script = read("../../scripts/test-authoritative-lock-timeout.mjs");
  assert.match(script, /select pg_sleep\(6\)/);
  assert.match(script, /commandError\.code, "55P03"/);
  assert.match(script, /durationMs >= 2_500 && durationMs < 5_000/);
  assert.match(script, /state_version: request\.state_version/);
});

test("database failures stay retryable at the API boundary", () => {
  const data = read("./approval-server-data.ts");
  const route = read("../app/api/approval-requests/[requestNo]/actions/route.ts");
  assert.match(
    data,
    /if \(commandError\) \{[\s\S]*kind: "dependency_error"[\s\S]*errorCode: commandError\.code/,
  );
  assert.match(route, /503,[\s\S]*"dependency_unavailable"/);
  assert.match(route, /No partial change was committed/);
});
