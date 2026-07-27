import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phase 2 provider documentation matches the quote-tree contract and server-derived evidence", async () => {
  const [docs, candidates, ai] = await Promise.all([
    readFile(new URL("../../docs/template-authoring/phase-2-template-copilot.md", import.meta.url), "utf8"),
    readFile(new URL("./template-copilot-v2-candidates.ts", import.meta.url), "utf8"),
    readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8"),
  ]);
  assert.match(docs, /fact-specific\s+quote tree that mirrors every primitive value leaf/i);
  assert.match(docs, /provider never\s+receives or returns JSON Pointer paths, message IDs, offsets, or normalization\s+rules/i);
  assert.match(docs, /server alone.*derives durable JSON\s+Pointer paths, message identity, Unicode code-point offsets, and any allowed\s+normalization rule/is);
  assert.match(candidates, /Every evidence value is a quote leaf mirroring[\s\S]{0,40}typed value tree/i);
  assert.match(candidates, /The only source is the known current message;[\s\S]{0,60}every offset and every non-exact rule is derived here/i);
  assert.match(ai, /Evidence is a quote tree that exactly mirrors value:[\s\S]{0,500}Do not emit JSON paths, message IDs, offsets, normalization rules, or original wording/);
  assert.doesNotMatch(docs, /provider[^.]*leaf-evidence\s+record[^.]*JSON Pointer path[^.]*durable message ID/is);
  assert.doesNotMatch(ai, /provider[^.]*must (?:return|emit)[^.]*startCodePoint|provider[^.]*must (?:return|emit)[^.]*messageId/is);
});

test("Phase 2 documentation retains the durable answer-bound outbox and rollback contract", async () => {
  const docs = await readFile(new URL("../../docs/template-authoring/phase-2-template-copilot.md", import.meta.url), "utf8");
  assert.match(docs, /text answer, its canonical transcript messages,\s+and an owner\/session\/message-bound extraction job are written by one locked\s+database transaction/i);
  assert.match(docs, /references the existing user-message row\s+instead of storing another copy of the raw answer/i);
  assert.match(docs, /checkpoints the complete candidate array plus a deterministic hash/i);
  assert.match(docs, /post-response callback is only a\s+latency optimization[\s\S]*once-per-minute protected Vercel Cron route/i);
  assert.match(docs, /FOR UPDATE SKIP LOCKED/);
  assert.match(docs, /returns only opaque job, owner, session, and lease identifiers/i);
  assert.match(docs, /raw answers are never\s+returned by dequeue or written to worker logs/i);
  assert.match(docs, /random `CRON_SECRET` of at least 16\s+characters/i);
  assert.match(docs, /later session revision\s+marks an uncommitted job superseded and can never be overwritten/i);
  assert.match(docs, /job table\s+has RLS enabled, no browser policy, no direct service-role table rights/i);
  assert.match(docs, /Rollback is flag-first/);
});
