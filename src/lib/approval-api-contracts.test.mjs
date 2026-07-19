import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalActionCommandSchema,
  approvalRequestSubmissionSchema,
  canonicalPayloadHash,
  directoryQuerySchema,
} from "./approval-api-contracts.ts";

test("approval actions reject forged authority, audit, timestamp, and state fields", () => {
  for (const forged of [
    { actorId: "00000000-0000-4000-8000-000000000001" },
    { actorEmail: "forged@example.com" },
    { role: "superuser" },
    { timestamp: "2026-07-19T00:00:00Z" },
    { eventKey: "forged" },
    { nextState: { status: "approved" } },
    { taskSnapshot: { status: "approved" } },
  ]) {
    const parsed = approvalActionCommandSchema.safeParse({
      action: "approve",
      expectedVersion: 0,
      idempotencyKey: "approval-command-1",
      ...forged,
    });
    assert.equal(parsed.success, false, JSON.stringify(forged));
  }
});

test("approval actions enforce discriminated action-specific fields and bounds", () => {
  assert.equal(
    approvalActionCommandSchema.safeParse({
      action: "approve_with_comment",
      expectedVersion: 0,
      idempotencyKey: "approval-command-2",
      comment: "",
    }).success,
    false,
  );
  assert.equal(
    approvalActionCommandSchema.safeParse({
      action: "delegate",
      expectedVersion: 0,
      idempotencyKey: "approval-command-3",
      targetProfileId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(
    approvalActionCommandSchema.safeParse({
      action: "reject",
      expectedVersion: 0,
      idempotencyKey: "approval-command-4",
      returnTargetNodeIds: Array.from({ length: 21 }, (_, index) => `node-${index}`),
    }).success,
    false,
  );
});

test("submission schema rejects client authority and arbitrary snapshots", () => {
  const valid = {
    templateVersionId: "00000000-0000-4000-8000-000000000001",
    title: "Purchase approval",
    idempotencyKey: "submission-key-1",
  };
  assert.equal(approvalRequestSubmissionSchema.safeParse(valid).success, true);
  assert.equal(
    approvalRequestSubmissionSchema.safeParse({
      ...valid,
      requesterId: "00000000-0000-4000-8000-000000000002",
    }).success,
    false,
  );
  assert.equal(
    approvalRequestSubmissionSchema.safeParse({
      ...valid,
      taskSnapshot: { status: "approved" },
    }).success,
    false,
  );
});

test("canonical hashes are stable across object key ordering", () => {
  assert.equal(
    canonicalPayloadHash({ action: "approve", values: { b: 2, a: 1 } }),
    canonicalPayloadHash({ values: { a: 1, b: 2 }, action: "approve" }),
  );
});

test("directory searches are bounded and reject query-operator punctuation", () => {
  assert.equal(directoryQuerySchema.safeParse({ query: "Finance User", limit: "20" }).success, true);
  assert.equal(directoryQuerySchema.safeParse({ query: "%,is_admin.eq.true" }).success, false);
  assert.equal(directoryQuerySchema.safeParse({ query: "x", limit: "21" }).success, false);
});
