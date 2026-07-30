import assert from "node:assert/strict";
import test from "node:test";
import { orderTemplateCopilotMessages, transcriptMessageFromStored } from "./template-copilot-history.ts";

function row(turn, role, id, createdAt) {
  return {
    id,
    client_message_id: `v2:${String(turn).padStart(64, "0")}`,
    role,
    content: role === "user" ? `full answer ${turn}` : `next question ${turn}`,
    structured_detail: { schemaVersion: 2, turn },
    created_at: createdAt,
  };
}

test("a 316-turn v2 transcript can be paged beyond 200 messages without gaps or duplicate IDs", () => {
  const rows = [];
  rows.push({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", client_message_id: "start:copilot", role: "assistant", content: "first question", structured_detail: {}, created_at: "2026-07-27T07:59:59.999999Z" });
  for (let turn = 0; turn < 316; turn += 1) {
    const createdAt = `2026-07-27T08:${String(Math.floor(turn / 60)).padStart(2, "0")}:${String(turn % 60).padStart(2, "0")}.000Z`;
    // Deliberately reverse physical UUID order: logical transcript order must
    // still put a same-command user turn before its assistant response.
    rows.push(row(turn, "assistant", `${String(9999 - turn).padStart(8, "0")}-0000-4000-8000-000000000000`, createdAt));
    rows.push(row(turn, "user", `${String(turn).padStart(8, "0")}-0000-4000-8000-000000000000`, createdAt));
  }
  const pages = [];
  // 101 deliberately splits a same-timestamp user/assistant pair at a page
  // boundary; merging all cursor pages must still reconstruct the exact log.
  for (let index = 0; index < rows.length; index += 101) pages.push(rows.slice(index, index + 101));
  const ordered = orderTemplateCopilotMessages(pages.flat());
  assert.equal(ordered.length, 633);
  assert.equal(new Set(ordered.map((message) => message.id)).size, 633);
  assert.equal(ordered[0].role, "assistant");
  for (let index = 1; index < ordered.length; index += 2) {
    assert.equal(ordered[index].role, "user");
    assert.equal(ordered[index + 1].role, "assistant");
    assert.equal(ordered[index].client_message_id, ordered[index + 1].client_message_id);
  }
  const transcript = transcriptMessageFromStored(ordered[401]);
  assert.equal(transcript.content, "full answer 200");
  assert.deepEqual(transcript.structuredDetail, { schemaVersion: 2, turn: 200 });
});
