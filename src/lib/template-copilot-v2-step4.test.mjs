import assert from "node:assert/strict";
import test from "node:test";
import { applyTemplateCopilotV2AtomicDecision, createTemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import { getTemplateCopilotQuestionLibrary, getTemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";
import { applyTemplateCopilotV2AtomicAnswer, templateCopilotV2CommandHash } from "./template-copilot-v2-server-data.ts";
import { getTemplateCopilotV2CommittedAcknowledgement, getTemplateCopilotV2Step4Interaction } from "./template-copilot-v2-step4.ts";
import { getTemplateCopilotV2Step4RenderContract } from "./template-copilot-v2-ui-contract.ts";

const enabled = { enabled: true };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts Payable",
};
const actor = { id: "33333333-3333-4333-8333-333333333333", email: "owner@example.com", fullName: "Owner", isAdmin: false };

function ownerSession(ledger) {
  return { from(table) {
    if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; } };
    return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision: 1, ledger }, error: null }) }; } }; } };
  } };
}

function replayRaceSession({ initialLedger, transcript }) {
  return { from(table) {
    if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; } };
    if (table === "template_copilot_sessions") return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision: 1, ledger: initialLedger }, error: null }) }; } }; } };
    if (table === "template_copilot_messages") return {
      select() { return this; }, eq() { return this; }, order: async () => ({ data: transcript, error: null }),
    };
    throw new Error(`Unexpected table ${table}`);
  } };
}

test("Step 4 interactions are pinned to v2.1 and remain inert display metadata", () => {
  assert.equal(getTemplateCopilotV2Step4Interaction({ libraryVersion: "v2.0", questionId: "v2.workflow.name.name", answerType: "short_text", locale: "en" }), null);
  const interaction = getTemplateCopilotV2Step4Interaction({ libraryVersion: "v2.1", questionId: "v2.workflow.name.name", answerType: "short_text", locale: "en" });
  assert.equal(interaction.requiresExplicitContinue, false);
  assert.deepEqual(interaction.suggestions, [{ id: "v2.workflow.name.name:suggestion:1", text: "Supplier payment request" }]);
  assert.equal(interaction.alternateExamples[0], "Travel expense claim");
  assert.match(interaction.labels.exampleOnly, /Example only/);
  const choice = getTemplateCopilotV2Step4Interaction({ libraryVersion: "v2.1", questionId: "v2.request.initiator_policy.who_can_start", answerType: "choice", locale: "zh-Hant" });
  assert.equal(choice.requiresExplicitContinue, true);
  assert.equal(choice.labels.continue, "繼續");
  assert.equal(choice.suggestions.length, 0, "choices are server-owned; suggestions cannot add an undeclared option");
});

test("controller provides Step 4 controls only from its pinned v2.1 library in all locales", () => {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const ledger = createTemplateCopilotV2Ledger({ ...scope, locale, questionLibraryVersion: "v2.1" }, enabled);
    const next = getTemplateCopilotV2InterviewState(ledger);
    assert.equal(next.libraryVersion, "v2.1");
    assert.equal(next.nextQuestion.interaction.enabled, true);
    assert.equal(next.nextQuestion.interaction.suggestions.length, 1);
    assert.ok(next.nextQuestion.interaction.labels.whyAsking.length > 0);
  }
  const legacyV2 = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.0" }, enabled);
  assert.equal(getTemplateCopilotV2InterviewState(legacyV2).nextQuestion.interaction, undefined);
  assert.equal(getTemplateCopilotQuestionLibrary("v2.1").questions.length, getTemplateCopilotQuestionLibrary("v2.0").questions.length);
});

test("Step 4 switch withdraws only the enhanced controls and preserves the v2.1 answer path", () => {
  assert.deepEqual(getTemplateCopilotV2Step4RenderContract({ schemaVersion: 2, hasInteraction: true, enabled: false }), { enhanced: false, plainTypedFallback: true });
  assert.deepEqual(getTemplateCopilotV2Step4RenderContract({ schemaVersion: 2, hasInteraction: true, enabled: true }), { enhanced: true, plainTypedFallback: false });
  assert.deepEqual(getTemplateCopilotV2Step4RenderContract({ schemaVersion: 2, hasInteraction: false, enabled: true }), { enhanced: false, plainTypedFallback: false }, "v2.0 stays unchanged");
  assert.deepEqual(getTemplateCopilotV2Step4RenderContract({ schemaVersion: 1, hasInteraction: true, enabled: true }), { enhanced: false, plainTypedFallback: false }, "v1 stays unchanged");
});

test("acknowledgement can only be generated from a committed authoritative decision", () => {
  const initial = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  assert.equal(getTemplateCopilotV2CommittedAcknowledgement({ ledger: initial, decisionId: "decision.workflow.name.name" }), null);
  const committed = applyTemplateCopilotV2AtomicDecision({
    ledger: initial,
    decisionId: "decision.workflow.name.name",
    answer: { kind: "text", text: "Invoice approval" },
    provenance: [{ kind: "human_editor", sourceId: "answer:step4", sourceMessageIds: [] }],
    answeredAt: "2026-07-27T12:00:00.000Z",
    flag: enabled,
  });
  assert.equal(getTemplateCopilotV2CommittedAcknowledgement({ ledger: committed, decisionId: "decision.workflow.name.name" }), "Saved: Invoice approval");
  assert.equal(getTemplateCopilotV2CommittedAcknowledgement({ ledger: committed, decisionId: "decision.workflow.purpose.purpose" }), null);
});

test("a stale response with a newer ledger never produces a false saved acknowledgement", async () => {
  const ledger = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session: ownerSession(ledger),
    service: { rpc: async (_name, args) => ({ data: { outcome: "stale_revision", revision: 2, status: "interviewing", ledger: args.p_ledger }, error: null }) },
    actor,
    sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expectedRevision: 1,
    idempotencyKey: "step4:stale",
    answer: "Invoice approval",
    flag: enabled,
  });
  assert.equal(result.outcome, "stale_revision");
  assert.equal(result.assistantMessage, undefined);
});

test("a post-RPC concurrent replay returns only the original durable acknowledgement, never a later ledger value", async () => {
  const initial = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const later = applyTemplateCopilotV2AtomicDecision({
    ledger: initial, decisionId: "decision.workflow.name.name", answer: { kind: "text", text: "Later renamed workflow" },
    provenance: [{ kind: "human_editor", sourceId: "answer:later", sourceMessageIds: [] }], answeredAt: "2026-07-27T13:00:00.000Z", flag: enabled,
  });
  const originalAck = "Saved: Original workflow What job should this workflow help people complete?";
  const transcript = [
    { id: "race:answer", client_message_id: "race:answer", role: "user", content: "Original workflow", created_at: "2026-07-27T12:00:00.000Z" },
    { id: "race:answer-assistant", client_message_id: "race:answer", role: "assistant", content: originalAck, created_at: "2026-07-27T12:00:01.000Z" },
  ];
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session: replayRaceSession({ initialLedger: initial, transcript }),
    service: { rpc: async () => ({ data: { outcome: "replayed", revision: 3, status: "interviewing", ledger: later }, error: null }) },
    actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "race:answer", answer: "Original workflow", flag: enabled,
  });
  assert.equal(result.assistantMessage, originalAck);
  assert.doesNotMatch(result.assistantMessage, /Later renamed workflow/);
  const missing = await applyTemplateCopilotV2AtomicAnswer({
    session: replayRaceSession({ initialLedger: initial, transcript: [] }),
    service: { rpc: async () => ({ data: { outcome: "replayed", revision: 3, status: "interviewing", ledger: later }, error: null }) },
    actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "race:answer", answer: "Original workflow", flag: enabled,
  });
  assert.equal(missing.assistantMessage, undefined, "an incomplete durable transcript cannot claim Saved");
});

test("simultaneous same-key answers converge on one durable transcript acknowledgement", async () => {
  const initial = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const originalAck = "Saved: Double-click workflow What job should this workflow help people complete?";
  const session = replayRaceSession({ initialLedger: initial, transcript: [
    { id: "race:double", client_message_id: "race:double", role: "user", content: "Double-click workflow", created_at: "2026-07-27T12:00:00.000Z" },
    { id: "race:double-assistant", client_message_id: "race:double", role: "assistant", content: originalAck, created_at: "2026-07-27T12:00:01.000Z" },
  ] });
  let calls = 0;
  const service = { rpc: async (_name, args) => {
    calls += 1;
    return { data: calls === 1
      ? { outcome: "applied", revision: 2, status: "interviewing", ledger: args.p_ledger, assistantMessage: originalAck }
      : { outcome: "replayed", revision: 3, status: "interviewing", ledger: args.p_ledger }, error: null };
  } };
  const input = { session, service, actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: "race:double", answer: "Double-click workflow", flag: enabled };
  const [first, second] = await Promise.all([applyTemplateCopilotV2AtomicAnswer(input), applyTemplateCopilotV2AtomicAnswer(input)]);
  assert.equal(calls, 2);
  assert.equal(first.assistantMessage, originalAck);
  assert.equal(second.assistantMessage, originalAck);
});

test("an Admin-readable other-owner receipt cannot expose transcript content before the locked owner check", async () => {
  const ledger = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const idempotencyKey = "owner-check:answer";
  const commandHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey, answer: { kind: "text", text: "Private workflow" } });
  const reads = [];
  const session = { from(table) {
    reads.push(table);
    if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { command_hash: commandHash, response: { decisionId: "decision.workflow.name.name", questionId: "v2.workflow.name.name" } }, error: null }) }; } }; } }; } };
    if (table === "template_copilot_sessions") return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: "44444444-4444-4444-8444-444444444444", status: "interviewing", revision: 2, ledger }, error: null }) }; } }; } };
    throw new Error("transcript must not be read for an owner-check failure");
  } };
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session, service: { rpc: async () => ({ data: { outcome: "not_found" }, error: null }) },
    actor: { ...actor, isAdmin: true }, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey, answer: "Private workflow", flag: enabled,
  });
  assert.equal(result.outcome, "not_found");
  assert.equal(result.assistantMessage, undefined);
  assert.equal(result.messages, undefined);
  assert.deepEqual(reads, ["template_copilot_v2_operation_receipts", "template_copilot_sessions"], "owner-check failure must not query messages");
});

test("a same-owner receipt replay reads only the owner-filtered durable transcript", async () => {
  const ledger = createTemplateCopilotV2Ledger({ ...scope, questionLibraryVersion: "v2.1" }, enabled);
  const idempotencyKey = "owner-check:replay";
  const commandHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey, answer: { kind: "text", text: "Owner workflow" } });
  const filters = [];
  const assistantMessage = "Saved: Owner workflow What job should this workflow help people complete?";
  const session = { from(table) {
    if (table === "template_copilot_v2_operation_receipts") return { select() { return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { command_hash: commandHash, response: { decisionId: "decision.workflow.name.name", questionId: "v2.workflow.name.name" } }, error: null }) }; } }; } }; } };
    if (table === "template_copilot_sessions") return { select() { return { eq() { return { maybeSingle: async () => ({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision: 2, ledger }, error: null }) }; } }; } };
    if (table === "template_copilot_messages") return { select() { return this; }, eq(column, value) { filters.push([column, value]); return this; }, order: async () => ({ data: [
      { id: idempotencyKey, client_message_id: idempotencyKey, role: "user", content: "Owner workflow", created_at: "2026-07-27T12:00:00.000Z" },
      { id: `${idempotencyKey}-assistant`, client_message_id: idempotencyKey, role: "assistant", content: assistantMessage, created_at: "2026-07-27T12:00:01.000Z" },
    ], error: null }) };
    throw new Error(`Unexpected table ${table}`);
  } };
  const result = await applyTemplateCopilotV2AtomicAnswer({
    session, service: { rpc: async () => ({ data: { outcome: "replayed", revision: 2, status: "interviewing", ledger }, error: null }) },
    actor, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey, answer: "Owner workflow", flag: enabled,
  });
  assert.equal(result.assistantMessage, assistantMessage);
  assert.ok(filters.some(([column, value]) => column === "owner_id" && value === actor.id), "transcript must be explicitly owner-filtered");
});
