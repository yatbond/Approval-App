import assert from "node:assert/strict";
import test from "node:test";
import { classifyTemplateCopilotV2OperationError, createTemplateCopilotV2Ledger, TemplateCopilotFactTransitionError } from "./template-copilot-facts.ts";
import { applyTemplateCopilotV2AtomicAnswer, applyTemplateCopilotV2Mutation, applyTemplateCopilotV2SpecialDecision, approveTemplateCopilotV1Upgrade, createTemplateCopilotV2Session, reconcileTemplateCopilotV2SpecialDecision, templateCopilotV2CommandHash } from "./template-copilot-v2-server-data.ts";

const enabled = { enabled: true };
const actor = { id: "33333333-3333-4333-8333-333333333333", email: "owner@example.com", fullName: "Owner", isAdmin: false };
const scope = { businessUnitId: "11111111-1111-4111-8111-111111111111", businessName: "Finance", departmentId: "22222222-2222-4222-8222-222222222222", departmentName: "Accounts Payable" };

function ownerSession(ledger, revision = 1) {
  return { from(table) { if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; } }; return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision, ledger }, error: null }) }; } }; } }; } };
}

function specialService({ ledger, revision = 1, preflightOutcome = "missing", onApply, status = "interviewing" }) {
  const calls = [];
  return {
    calls,
    client: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "reconcile_template_copilot_v2_special_decision") {
          const data = ["not_found", "invalid_command"].includes(preflightOutcome)
            ? { outcome: preflightOutcome }
            : { outcome: preflightOutcome, sessionId: args.p_session_id, revision, status, ledger };
          return { data, error: null };
        }
        assert.equal(name, "apply_template_copilot_v2_special_decision");
        if (onApply) return onApply(args);
        return { data: { outcome: "applied", revision: revision + 1, status, ledger: args.p_ledger }, error: null };
      },
    },
  };
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

test("v2 start and authoritative mutation responses include the deterministic pinned interview state", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  let startArgs;
  const created = await createTemplateCopilotV2Session({
    service: { rpc: async (_name, args) => { startArgs = args; return { data: { outcome: "applied", revision: 1, ledger }, error: null }; } },
    actor, clientMessageId: "v2-start:question", scope: { ...scope, locale: "en" }, flag: enabled,
  });
  assert.match(startArgs.p_assistant_message, /What should we call this approval workflow\?/);
  assert.equal(created.interview.libraryVersion, "v2.0");
  assert.equal(created.interview.nextQuestion.targetFactId, "workflow.name");

  const answeredName = (await applyTemplateCopilotV2AtomicAnswer({
    session: ownerSession(ledger), service: { rpc: async (_name, args) => ({ data: { outcome: "applied", revision: 2, ledger: args.p_ledger }, error: null }) }, actor,
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "v2-answer:name", answer: "Invoice approval", flag: enabled,
  })).ledger;
  const mutated = await applyTemplateCopilotV2Mutation({
    session: ownerSession(ledger), service: { rpc: async () => ({ data: { outcome: "applied", revision: 2, ledger: answeredName }, error: null }) }, actor,
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "v2-mutate:question", factId: "workflow.name", flag: enabled,
    transition: { operation: "human_commit", payload: { canonicalValue: "Invoice approval", provenance: [{ kind: "message", sourceId: "message:one", sourceMessageIds: ["message:one"] }] } },
  });
  assert.equal(mutated.interview.nextQuestion.targetFactId, "workflow.purpose");
});

test("atomic answers bind only the server-chosen decision, persist one append, and replay before a later interview is read", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  let rpcArgs;
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session: ownerSession(ledger), actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1,
    idempotencyKey: "atomic:first", answer: "Invoice approval", flag: enabled,
    service: { rpc: async (_name, args) => { rpcArgs = args; return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null }; } },
  });
  assert.equal(rpcArgs.p_decision_id, "decision.workflow.name.name");
  assert.equal(Object.keys(rpcArgs.p_ledger.atomicDecisions).length, 1);
  assert.equal(result.interview.nextQuestion.primaryDecisionId, "decision.workflow.purpose.purpose");
  const replayHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "atomic:first", answer: { kind: "text", text: "Invoice approval" } });
  const replaySession = { from(table) {
    if (table === "template_copilot_v2_operation_receipts") {
      return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { command_hash: replayHash, response: { appliedRevision: 2, decisionId: "decision.workflow.name.name", questionId: "v2.workflow.name.name", assistantMessage: "What job should this workflow help people complete?" } }, error: null }) }; } }; } }; } };
    }
    assert.equal(table, "template_copilot_sessions");
    return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision: 2, ledger: rpcArgs.p_ledger }, error: null }) }; } }; } };
  } };
  let replayArgs;
  const replay = await applyTemplateCopilotV2AtomicAnswer({ session: replaySession, service: { rpc: async (_name, args) => { replayArgs = args; return { data: { outcome: "replayed", revision: 2, status: "interviewing", ledger: rpcArgs.p_ledger, assistantMessage: "What job should this workflow help people complete?" }, error: null }; } }, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "atomic:first", answer: "Invoice approval", flag: enabled });
  assert.equal(replay.outcome, "replayed");
  assert.equal(replayArgs.p_decision_id, "decision.workflow.name.name");
});

test("a valid 8000-character atomic text answer commits with a bounded display preview", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const answer = "審".repeat(8000);
  let rpcArgs;
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session: ownerSession(ledger), actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1,
    idempotencyKey: "atomic:long", answer: { kind: "text", text: answer }, flag: enabled,
    service: { rpc: async (_name, args) => { rpcArgs = args; return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger, assistantMessage: "What job should this workflow help people complete?" }, error: null }; } },
  });
  const decision = result.ledger.atomicDecisions["decision.workflow.name.name"];
  assert.equal(decision.answer, answer);
  assert.equal(decision.display.length, 500);
  assert.equal(decision.display.endsWith("…"), true);
  assert.equal(rpcArgs.p_user_message, answer, "the durable transcript keeps the canonical full answer, not its display preview");
  assert.equal(rpcArgs.p_assistant_message, "What job should this workflow help people complete?");
});

test("choice questions reject free prose and accept only their server-owned option IDs", async () => {
  let ledger = createTemplateCopilotV2Ledger(scope, enabled);
  for (const [decisionId, text] of [["decision.workflow.name.name", "Invoice approval"], ["decision.workflow.purpose.purpose", "Approve invoices"], ["decision.workflow.scope.included", "Invoices"], ["decision.workflow.scope.excluded", "Expenses"]]) {
    ledger = (await applyTemplateCopilotV2AtomicAnswer({ session: ownerSession(ledger), service: { rpc: async (_name, args) => ({ data: { outcome: "applied", revision: 2, ledger: args.p_ledger }, error: null }) }, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: `seed:${decisionId}`, answer: text, flag: enabled })).ledger;
  }
  await assert.rejects(() => applyTemplateCopilotV2AtomicAnswer({ session: ownerSession(ledger), service: { rpc: async () => { throw new Error("must not write"); } }, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "choice:prose", answer: { kind: "text", text: "anyone" }, flag: enabled }), /listed options/);
  let choiceArgs;
  const accepted = await applyTemplateCopilotV2AtomicAnswer({ session: ownerSession(ledger), service: { rpc: async (_name, args) => { choiceArgs = args; return { data: { outcome: "applied", revision: 2, ledger: args.p_ledger, assistantMessage: "What is one piece of information every request must include?" }, error: null }; } }, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "choice:id", answer: { kind: "choice", optionId: "any_employee" }, flag: enabled });
  assert.equal(accepted.ledger.atomicDecisions["decision.request.initiator_policy.who_can_start"].optionId, "any_employee");
  assert.equal(choiceArgs.p_user_message, "Any employee");
  assert.equal(choiceArgs.p_user_detail.optionId, "any_employee");
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

test("special service applies defer and eligible N/A as one exact server-derived ledger delta", async () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const initial = createTemplateCopilotV2Ledger(scope, enabled);
  let deferArgs;
  const deferService = specialService({
    ledger: initial,
    onApply: async (args) => {
      deferArgs = args;
      return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null };
    },
  });
  const deferred = await applyTemplateCopilotV2SpecialDecision({
    session: ownerSession(initial), actor, sessionId, expectedRevision: 1, idempotencyKey: "special:defer", command: { operation: "defer" }, flag: enabled,
    service: deferService.client,
  });
  assert.deepEqual(deferService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision", "apply_template_copilot_v2_special_decision"]);
  assert.equal(deferArgs.p_projection_valid, true);
  assert.equal(deferArgs.p_decision_id, "decision.workflow.name.name");
  assert.equal(deferArgs.p_ledger.atomicDecisions[deferArgs.p_decision_id].kind, "unknown");
  assert.equal(deferArgs.p_user_detail.operation, "defer");
  assert.match(deferArgs.p_assistant_message, /What job should this workflow help people complete/);
  assert.equal(deferred.specialReview[0].prompt, "What should we call this approval workflow?");

  let ledger = initial;
  for (const [key, answer] of [["name", "Invoice approval"], ["purpose", "Approve supplier invoices"], ["included", "Supplier invoices"]]) {
    ledger = (await applyTemplateCopilotV2AtomicAnswer({ session: ownerSession(ledger), actor, sessionId, expectedRevision: 1, idempotencyKey: `seed:${key}`, answer, flag: enabled, service: { rpc: async (_name, args) => ({ data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null }) } })).ledger;
  }
  let naArgs;
  const naService = specialService({
    ledger,
    onApply: async (args) => {
      naArgs = args;
      return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null };
    },
  });
  const na = await applyTemplateCopilotV2SpecialDecision({
    session: ownerSession(ledger), actor, sessionId, expectedRevision: 1, idempotencyKey: "special:na", command: { operation: "not_applicable", reason: "No excluded request types." }, flag: enabled,
    service: naService.client,
  });
  assert.equal(naArgs.p_projection_valid, true);
  assert.equal(naArgs.p_decision_id, "decision.workflow.scope.excluded");
  assert.equal(naArgs.p_ledger.atomicDecisions[naArgs.p_decision_id].reason, "No excluded request types.");
  assert.equal(naArgs.p_user_detail.reason, "No excluded request types.");
  assert.match(naArgs.p_user_message, /No excluded request types/);
  assert.equal(na.specialReview[0].prompt, "What requests should not use this workflow?");
  let invalidProjectionArgs;
  const invalidService = specialService({
    ledger: initial,
    onApply: async (args) => {
      invalidProjectionArgs = args;
      return { data: { outcome: "invalid_transition" }, error: null };
    },
  });
  const ineligible = await applyTemplateCopilotV2SpecialDecision({ session: ownerSession(initial), actor, sessionId, expectedRevision: 1, idempotencyKey: "special:bad-na", command: { operation: "not_applicable", reason: "Wrong question" }, flag: enabled, service: invalidService.client });
  assert.equal(ineligible.outcome, "invalid_transition");
  assert.deepEqual(invalidService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision", "apply_template_copilot_v2_special_decision"]);
  assert.equal(invalidProjectionArgs.p_projection_valid, false, "owned ineligible N/A reaches the authoritative audited RPC");
  assert.deepEqual(invalidProjectionArgs.p_ledger, initial, "the invalid projection leaves the authoritative ledger unchanged");
  assert.deepEqual(invalidProjectionArgs.p_user_detail, {});

  let invalidReopenArgs;
  const invalidReopenService = specialService({
    ledger: initial,
    onApply: async (args) => {
      invalidReopenArgs = args;
      return { data: { outcome: "invalid_transition" }, error: null };
    },
  });
  const invalidReopen = await applyTemplateCopilotV2SpecialDecision({
    session: ownerSession(initial),
    service: invalidReopenService.client,
    actor,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "special:bad-reopen",
    command: { operation: "reopen", decisionId: "decision.workflow.name.name" },
    flag: enabled,
  });
  assert.equal(invalidReopen.outcome, "invalid_transition");
  assert.equal(invalidReopenArgs.p_projection_valid, false, "owned invalid reopen reaches the authoritative audited RPC");
  assert.deepEqual(invalidReopenService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision", "apply_template_copilot_v2_special_decision"]);
});

test("special preflight owns hash-conflict auditing and hides other-owner receipts from Admin actors", async () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ledger = createTemplateCopilotV2Ledger(scope, enabled);
  const browserMustRemainUnread = { from(table) { throw new Error(`browser policy read would leak through ${table}`); } };

  const conflictService = specialService({ ledger, preflightOutcome: "idempotency_conflict" });
  const conflict = await applyTemplateCopilotV2SpecialDecision({
    session: browserMustRemainUnread,
    service: conflictService.client,
    actor,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "special:conflict",
    command: { operation: "defer" },
    flag: enabled,
  });
  assert.equal(conflict.outcome, "idempotency_conflict");
  assert.deepEqual(conflictService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision"], "owned conflict is classified and audited by one DB preflight only");
  assert.equal(conflictService.calls[0].args.p_actor_id, actor.id);

  const admin = { ...actor, id: "44444444-4444-4444-8444-444444444444", email: "admin@example.com", isAdmin: true };
  const hiddenService = specialService({ ledger, preflightOutcome: "not_found" });
  const hidden = await applyTemplateCopilotV2SpecialDecision({
    session: browserMustRemainUnread,
    service: hiddenService.client,
    actor: admin,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "special:hidden",
    command: { operation: "defer" },
    flag: enabled,
  });
  assert.deepEqual(hidden, { outcome: "not_found" });
  assert.deepEqual(hiddenService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision"], "other-owner Admin receives no receipt, ledger, or mutation call");
  assert.equal(hiddenService.calls[0].args.p_actor_id, admin.id);

  const hiddenReconcileService = specialService({ ledger, preflightOutcome: "not_found" });
  const hiddenReconcile = await reconcileTemplateCopilotV2SpecialDecision({
    session: browserMustRemainUnread,
    service: hiddenReconcileService.client,
    actor: admin,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: "special:hidden",
    command: { operation: "defer" },
    flag: enabled,
  });
  assert.deepEqual(hiddenReconcile, { outcome: "not_found" });
  assert.equal(hiddenReconcileService.calls.length, 1);
});

test("special replay keeps its original persisted transcript while the current interview reflects later cross-tab progress", async () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const initial = createTemplateCopilotV2Ledger(scope, enabled);
  let appliedArgs;
  const initialService = specialService({
    ledger: initial,
    onApply: async (args) => {
      appliedArgs = args;
      return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null };
    },
  });
  await applyTemplateCopilotV2SpecialDecision({ session: ownerSession(initial), actor, sessionId, expectedRevision: 1, idempotencyKey: "special:lost", command: { operation: "defer" }, flag: enabled, service: initialService.client });
  const command = { operation: "defer" };
  const laterLedger = (await applyTemplateCopilotV2AtomicAnswer({
    session: ownerSession(appliedArgs.p_ledger, 2), actor, sessionId, expectedRevision: 2, idempotencyKey: "atomic:other-tab",
    answer: "Approve supplier invoices", flag: enabled,
    service: { rpc: async (_name, args) => ({ data: { outcome: "applied", revision: 3, status: "interviewing", ledger: args.p_ledger }, error: null }) },
  })).ledger;
  const originalUserCreatedAt = "2026-07-27T12:00:00.123456Z";
  const originalAssistantCreatedAt = "2026-07-27T12:00:00.123457Z";
  const originalAssistantContent = "This decision is marked as not yet known. Reopen it to continue. What job should this workflow help people complete?";
  const receiptSession = () => ({ from(table) {
    if (table === "template_copilot_messages") return { select() { return { eq() { return { eq() { return { order: async () => ({ data: [
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", client_message_id: "special:lost", role: "user", content: "Not sure", created_at: originalUserCreatedAt },
      { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", client_message_id: "special:lost", role: "assistant", content: originalAssistantContent, created_at: originalAssistantCreatedAt },
    ], error: null }) }; } }; } }; } };
    throw new Error(`unexpected browser read: ${table}`);
  } });
  const replayService = specialService({ ledger: laterLedger, revision: 3, preflightOutcome: "committed" });
  const replay = await applyTemplateCopilotV2SpecialDecision({ session: receiptSession(), service: replayService.client, actor, sessionId, expectedRevision: 1, idempotencyKey: "special:lost", command, flag: enabled });
  assert.equal(replay.outcome, "replayed");
  assert.deepEqual(replayService.calls.map((call) => call.name), ["reconcile_template_copilot_v2_special_decision"], "preflight exact replay is audited once and does not call mutation");
  assert.equal(replay.assistantMessage, originalAssistantContent, "historical B content comes from the durable message row, not the current interview");
  assert.equal(replay.interview.nextQuestion.prompt, "What requests belong in this workflow?", "current interview independently advances to C");
  assert.equal(replay.messages.filter((message) => message.clientMessageId === "special:lost").length, 2);
  const reconcileService = specialService({ ledger: laterLedger, revision: 3, preflightOutcome: "committed" });
  const reconciled = await reconcileTemplateCopilotV2SpecialDecision({ session: receiptSession(), service: reconcileService.client, actor, sessionId, expectedRevision: 1, idempotencyKey: "special:lost", command, flag: enabled });
  assert.equal(reconciled.outcome, "committed");
  assert.equal(reconcileService.calls.length, 1);
  assert.equal(reconciled.interview.nextQuestion.prompt, "What requests belong in this workflow?");
  assert.deepEqual(reconciled.messages, [
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", clientMessageId: "special:lost", role: "user", content: "Not sure", createdAt: originalUserCreatedAt },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", clientMessageId: "special:lost", role: "assistant", content: originalAssistantContent, createdAt: originalAssistantCreatedAt },
  ]);
  const conflictService = specialService({ ledger: laterLedger, revision: 3, preflightOutcome: "idempotency_conflict" });
  assert.equal((await reconcileTemplateCopilotV2SpecialDecision({ session: receiptSession(), service: conflictService.client, actor, sessionId, expectedRevision: 1, idempotencyKey: "special:lost", command, flag: enabled })).outcome, "idempotency_conflict");
  assert.equal(conflictService.calls.length, 1);
  const missingService = specialService({ ledger: laterLedger, revision: 3 });
  assert.equal((await reconcileTemplateCopilotV2SpecialDecision({ session: ownerSession(laterLedger, 3), service: missingService.client, actor, sessionId, expectedRevision: 1, idempotencyKey: "special:missing", command, flag: enabled })).outcome, "missing");
});

test("special service reopens exactly the stored reverse dependency closure and preserves unrelated answers", async () => {
  const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const base = createTemplateCopilotV2Ledger(scope, enabled);
  const evidence = (sourceId) => [{ kind: "human_editor", sourceId, sourceMessageIds: [] }];
  const answeredAt = "2026-07-27T12:00:00.000Z";
  const ledger = {
    ...base,
    atomicDecisions: {
      "decision.workflow.name.name": { kind: "text", answer: "Invoice approval", display: "Invoice approval", provenance: evidence("answer:name"), answeredAt },
      "decision.workflow.stages.first_stage_person_mode": { kind: "unknown", answer: "unknown", display: "Not sure", provenance: evidence("special:original"), answeredAt },
      "decision.workflow.stages.stage_2_needed": { kind: "choice", answer: "yes", optionId: "yes", display: "Yes", provenance: evidence("answer:stage2"), answeredAt },
    },
  };
  let rpcArgs;
  const reopenService = specialService({
    ledger,
    onApply: async (args) => {
      rpcArgs = args;
      return { data: { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null };
    },
  });
  const result = await applyTemplateCopilotV2SpecialDecision({
    session: ownerSession(ledger), actor, sessionId, expectedRevision: 1, idempotencyKey: "special:reopen-closure", command: { operation: "reopen", decisionId: "decision.workflow.stages.first_stage_person_mode" }, flag: enabled,
    service: reopenService.client,
  });
  assert.equal(rpcArgs.p_projection_valid, true);
  assert.deepEqual(rpcArgs.p_removed_decision_ids, ["decision.workflow.stages.first_stage_person_mode", "decision.workflow.stages.stage_2_needed"]);
  assert.equal(result.ledger.atomicDecisions["decision.workflow.name.name"].answer, "Invoice approval");
  assert.equal(result.ledger.atomicDecisions["decision.workflow.stages.first_stage_person_mode"], undefined);
  assert.equal(result.ledger.atomicDecisions["decision.workflow.stages.stage_2_needed"], undefined);
});
