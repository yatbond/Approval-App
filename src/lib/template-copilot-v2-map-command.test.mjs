import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPendingTemplateCopilotV2MapCommand,
  parsePendingTemplateCopilotV2MapCommand,
  templateCopilotV2PendingMapCommandBody,
} from "./template-copilot-v2-map-command.ts";
import { templateCopilotV2CommandHash } from "./template-copilot-v2-server-data.ts";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function serverHash(command) {
  const body = templateCopilotV2PendingMapCommandBody(command);
  const canonicalValue = "payload" in body.transition
    ? body.transition.payload.canonicalValue
    : null;
  const reason =
    body.transition.operation === "mark_not_applicable"
      ? body.transition.reason
      : null;
  return templateCopilotV2CommandHash({
    operation: body.transition.operation,
    sessionId: command.sessionId,
    expectedRevision: body.expectedRevision,
    factId: body.factId,
    canonicalValue,
    reason,
  });
}

test("a response-lost candidate commit remounts with the byte-identical command, key, and hash", () => {
  const original = createPendingTemplateCopilotV2MapCommand({
    sessionId,
    expectedRevision: 7,
    idempotencyKey: "map-edit:lost-response",
    factId: "workflow.name",
    factStatus: "candidate",
    intent: { action: "save", canonicalValue: "Invoice approval" },
  });
  assert.equal(original.operation, "human_commit");
  const storedBytes = JSON.stringify(original);
  const requestBytes = JSON.stringify(
    templateCopilotV2PendingMapCommandBody(original),
  );
  const originalHash = serverHash(original);

  // The server committed revision 8, but its response was lost. A freshly
  // derived command would now be human_replace and is intentionally ignored.
  const incorrectlyRecomputed = createPendingTemplateCopilotV2MapCommand({
    sessionId,
    expectedRevision: 8,
    idempotencyKey: "map-edit:new-command",
    factId: "workflow.name",
    factStatus: "committed",
    intent: { action: "save", canonicalValue: "Invoice approval" },
  });
  assert.equal(incorrectlyRecomputed.operation, "human_replace");
  assert.notEqual(serverHash(incorrectlyRecomputed), originalHash);

  const remounted = parsePendingTemplateCopilotV2MapCommand(
    JSON.parse(storedBytes),
  );
  assert.ok(remounted);
  assert.equal(remounted.operation, "human_commit");
  assert.equal(remounted.expectedRevision, 7);
  assert.equal(remounted.idempotencyKey, "map-edit:lost-response");
  assert.equal(
    JSON.stringify(templateCopilotV2PendingMapCommandBody(remounted)),
    requestBytes,
  );
  assert.equal(serverHash(remounted), originalHash);
});

test("pending map command parser rejects incomplete or operation-inconsistent storage", () => {
  assert.equal(parsePendingTemplateCopilotV2MapCommand(null), null);
  assert.equal(
    parsePendingTemplateCopilotV2MapCommand({
      sessionId,
      expectedRevision: 0,
      idempotencyKey: "bad",
      factId: "workflow.name",
      operation: "human_commit",
      canonicalValue: "A",
    }),
    null,
  );
  assert.equal(
    parsePendingTemplateCopilotV2MapCommand({
      sessionId,
      expectedRevision: 1,
      idempotencyKey: "bad",
      factId: "workflow.name",
      operation: "human_commit",
    }),
    null,
  );
  assert.equal(
    parsePendingTemplateCopilotV2MapCommand({
      sessionId,
      expectedRevision: 1,
      idempotencyKey: "bad",
      factId: "workflow.name",
      operation: "mark_not_applicable",
    }),
    null,
  );
});

test("the remount retry button executes the stored command without deriving a replacement", async () => {
  const source = await readFile(
    new URL("../app/template-copilot.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /createPendingTemplateCopilotV2MapCommand\(\{[\s\S]*?factStatus: state\.ledger\.facts\[factId\]\.status,[\s\S]*?intent: requestedTransition,[\s\S]*?\}\)/,
  );
  assert.match(
    source,
    /async function executePendingMapCommand\(pending: PendingTemplateCopilotV2MapCommand\)[\s\S]*?templateCopilotV2PendingMapCommandBody\(pending\)/,
  );
  assert.match(
    source,
    /onClick=\{\(\) => void executePendingMapCommand\(pendingMapEdit\)\}/,
  );
  const executor = source.slice(
    source.indexOf("async function executePendingMapCommand"),
    source.indexOf("async function start()"),
  );
  assert.doesNotMatch(executor, /createPendingTemplateCopilotV2MapCommand/);
  assert.doesNotMatch(executor, /ledger\.facts\[pending\.factId\]\.status/);
});
