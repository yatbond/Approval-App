import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeTemplateCopilotSessionSummaries,
  templateCopilotSessionKeysetPlan,
} from "./template-copilot-history.ts";
import {
  decodeTemplateCopilotSessionCursor,
  encodeTemplateCopilotSessionCursor,
} from "./template-copilot-session-pagination.ts";

const secret = "template-copilot-pagination-test-secret-at-least-32-characters";
process.env.TEMPLATE_COPILOT_CURSOR_SECRET = secret;

function sessionRow(id, createdAt) {
  return {
    id,
    family_id: null,
    draft_id: null,
    status: "interviewing",
    revision: 1,
    model: "test-model",
    createdAt,
    updatedAt: "2026-07-27T12:00:00.000000Z",
  };
}

test("opaque session cursors reject tampering and retain an exact immutable created-at keyset", () => {
  const cursor = { createdAt: "2026-07-27T09:30:00.123456+08:00", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const encoded = encodeTemplateCopilotSessionCursor(cursor, secret);
  assert.doesNotMatch(encoded, /2026|aaaa/);
  assert.deepEqual(decodeTemplateCopilotSessionCursor(encoded, secret), cursor);
  const tampered = `${encoded.slice(0, -1)}${encoded.endsWith("A") ? "B" : "A"}`;
  assert.equal(decodeTemplateCopilotSessionCursor(tampered, secret), null);
  assert.equal(decodeTemplateCopilotSessionCursor("not-a-cursor", secret), null);
});

test("session keyset pages have no equal-timestamp gaps or duplicates, and merge deterministically", () => {
  const stamp = "2026-07-27T09:30:00.123456Z";
  const firstRows = [
    sessionRow("00000004-0000-4000-8000-000000000004", stamp),
    sessionRow("00000003-0000-4000-8000-000000000003", stamp),
    sessionRow("00000002-0000-4000-8000-000000000002", stamp),
  ];
  const first = firstRows.slice(0, 2).map((row) => ({ ...row, businessName: "Finance", departmentName: "Accounts Payable", locale: "en" }));
  const after = { createdAt: stamp, id: firstRows[1].id };
  const mine = templateCopilotSessionKeysetPlan({ view: "mine", actorId: "11111111-1111-4111-8111-111111111111", cursor: after });
  assert.equal(mine.ownerId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(mine.order, ["created_at", "id"]);
  assert.equal(mine.after, `created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${firstRows[1].id})`);

  const secondRows = [
    firstRows[2],
    sessionRow("00000001-0000-4000-8000-000000000001", "2026-07-27T09:29:59.999999Z"),
  ];
  const second = secondRows.map((row) => ({ ...row, businessName: "Finance", departmentName: "Accounts Payable", locale: "en" }));
  const merged = mergeTemplateCopilotSessionSummaries(first, second);
  assert.deepEqual(merged.map((row) => row.id), [firstRows[0].id, firstRows[1].id, firstRows[2].id, secondRows[1].id]);
  assert.equal(new Set(merged.map((row) => row.id)).size, 4);
});

test("review never inherits the employee owner filter", () => {
  const review = templateCopilotSessionKeysetPlan({ view: "review", actorId: "22222222-2222-4222-8222-222222222222", cursor: null });
  assert.equal(review.ownerId, null);
  assert.equal(review.after, null);
  assert.deepEqual(review.order, ["created_at", "id"]);
});
