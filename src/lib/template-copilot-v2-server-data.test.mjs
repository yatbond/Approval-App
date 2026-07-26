import assert from "node:assert/strict";
import test from "node:test";
import { classifyTemplateCopilotV2OperationError, createTemplateCopilotV2Ledger, TemplateCopilotFactTransitionError } from "./template-copilot-facts.ts";
import { applyTemplateCopilotV2Mutation, approveTemplateCopilotV1Upgrade, templateCopilotV2CommandHash } from "./template-copilot-v2-server-data.ts";

const enabled = { enabled: true };
const actor = { id: "33333333-3333-4333-8333-333333333333", email: "owner@example.com", fullName: "Owner", isAdmin: false };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };

function ownerSession(ledger, revision = 1) {
  return { from(table) { if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; } }; return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision, ledger }, error: null }) }; } }; } }; } };
}

test("server mutation derives confirmation and returns the RPC's authoritative replay unchanged", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  let rpcArgs;
  const service = { rpc: async (_name, args) => { rpcArgs = args; return { data: { outcome: "replayed", revision: 1, ledger }, error: null }; } };
  const result = await applyTemplateCopilotV2Mutation({
    session: ownerSession(ledger), service, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expectedRevision: 1, idempotencyKey: "v2-test:replay", factId: "workflow.name", flag: enabled,
    transition: { operation: "human_commit", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "message", sourceId: "message:one", sourceMessageIds: ["message:one"] }] } },
  });
  assert.equal(result.outcome, "replayed");
  assert.equal(result.ledger, ledger);
  assert.equal(rpcArgs.p_actor_id, actor.id);
  assert.equal(rpcArgs.p_fact_entry.confirmation.actorId, actor.id);
  assert.match(rpcArgs.p_fact_entry.confirmation.confirmedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal("confirmation" in rpcArgs, false);
});

test("canonical command hashes are key-order independent and bind payload changes", () => {
  assert.equal(templateCopilotV2CommandHash({ b: 2, a: { y: 2, x: 1 } }), templateCopilotV2CommandHash({ a: { x: 1, y: 2 }, b: 2 }));
  assert.notEqual(templateCopilotV2CommandHash({ operation: "human_commit", value: "A" }), templateCopilotV2CommandHash({ operation: "human_commit", value: "B" }));
});

test("post-success replays bypass protected transition evaluation and reject hash mismatch", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const response = { revision: 9, ledger };
  const replaySession = (hash) => ({ from(table) { assert.equal(table, "template_copilot_v2_operation_receipts"); return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { command_hash: hash, response }, error: null }) }; } }; } }; } }; } });
  const service = { rpc: async () => { throw new Error("RPC must not run for a matching receipt"); } };
  const cases = [
    { operation: "human_commit", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "message", sourceId: "m", sourceMessageIds: ["m"] }] } },
    { operation: "mark_not_applicable", reason: "No attachments are used." },
    { operation: "resolve_conflict", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "message", sourceId: "m", sourceMessageIds: ["m"] }] } },
  ];
  for (const transition of cases) {
    const hash = templateCopilotV2CommandHash({ operation: transition.operation, sessionId, expectedRevision: 8, factId: "workflow.name", transition });
    const replay = await applyTemplateCopilotV2Mutation({ session: replaySession(hash), service, actor, sessionId, expectedRevision: 8, idempotencyKey: `retry:${transition.operation}`, factId: "workflow.name", transition, flag: enabled });
    assert.equal(replay.outcome, "replayed");
  }
  const mismatch = await applyTemplateCopilotV2Mutation({ session: replaySession("0".repeat(64)), service, actor, sessionId, expectedRevision: 8, idempotencyKey: "retry:mismatch", factId: "workflow.name", transition: cases[0], flag: enabled });
  assert.equal(mismatch.outcome, "idempotency_conflict");
});

test("legacy-upgrade replay is resolved before the now-v2 session is inspected", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const previewHash = "a".repeat(64);
  const hash = templateCopilotV2CommandHash({ operation: "legacy_upgrade", sessionId, expectedRevision: 4, previewHash, targetQuestionLibraryVersion: "v2.0" });
  const session = { from(table) { assert.equal(table, "template_copilot_v2_operation_receipts"); return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { command_hash: hash, response: { revision: 5, ledger } }, error: null }) }; } }; } }; } }; } };
  const result = await approveTemplateCopilotV1Upgrade({ session, service: { rpc: async () => { throw new Error("must not call RPC"); } }, actor, sessionId, expectedRevision: 4, idempotencyKey: "upgrade:replay", previewHash, flag: enabled });
  assert.equal(result.outcome, "replayed");
});

test("stored-ledger and RPC response parser failures remain distinct from an invalid transition", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const corruptStoredLedger = { ...ledger, facts: { ...ledger.facts, "workflow.name": { ...ledger.facts["workflow.name"], status: "candidate", canonicalValue: { untrusted: true }, provenance: [{ kind: "message", sourceId: "message:bad", sourceMessageIds: ["message:bad"] }] } } };
  const command = { session: ownerSession(corruptStoredLedger), service: { rpc: async () => { throw new Error("must not call RPC for corrupt storage"); } }, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "parser:stored", factId: "workflow.name", flag: enabled, transition: { operation: "record_candidate", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "message", sourceId: "message:one", sourceMessageIds: ["message:one"] }] } } };
  let storedLedgerError;
  await assert.rejects(() => applyTemplateCopilotV2Mutation(command), (error) => {
    storedLedgerError = error;
    return /Canonical value does not match/.test(error.message);
  });
  assert.equal(classifyTemplateCopilotV2OperationError(storedLedgerError, "unavailable").status, 503);

  let rpcResponseError;
  await assert.rejects(() => applyTemplateCopilotV2Mutation({
    ...command,
    session: ownerSession(ledger), idempotencyKey: "parser:rpc",
    service: { rpc: async () => ({ data: { outcome: "applied", ledger: { schemaVersion: 2 } }, error: null }) },
  }), (error) => {
    rpcResponseError = error;
    return /Invalid input/.test(error.message);
  });
  assert.equal(classifyTemplateCopilotV2OperationError(rpcResponseError, "unavailable").status, 503);

  let transitionError;
  await assert.rejects(() => applyTemplateCopilotV2Mutation({
    ...command,
    session: ownerSession(ledger), idempotencyKey: "domain:transition",
    transition: { operation: "mark_not_applicable", reason: "Not needed" },
  }), (error) => {
    transitionError = error;
    return error instanceof TemplateCopilotFactTransitionError;
  });
  assert.equal(classifyTemplateCopilotV2OperationError(transitionError, "unavailable").status, 409);
});
