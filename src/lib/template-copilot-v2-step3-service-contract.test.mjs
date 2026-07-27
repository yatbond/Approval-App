import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2AtomicAnswer,
  applyTemplateCopilotV2CandidateExtraction,
  confirmTemplateCopilotV2Candidate,
  resolveTemplateCopilotV2CommittedExtractionConflict,
  templateCopilotV2CommandHash,
} from "./template-copilot-v2-server-data.ts";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
  classifyTemplateCopilotV2OperationError,
} from "./template-copilot-facts.ts";
import { projectTemplateCopilotV2Candidates, templateCopilotV2CandidateEvidenceHash } from "./template-copilot-v2-candidates.ts";

const flag = { enabled: true };
const actor = { id: "33333333-3333-4333-8333-333333333333" };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts",
};

function textCandidate(factId, value, messageId = "m1") {
  return {
    factId,
    valueType: "text",
    value,
    originalWording: value,
    evidence: [{ path: "/", messageId, startCodePoint: 0, endCodePoint: Array.from(value).length, exactText: value }],
    confidence: "high",
    ambiguity: "none",
  };
}

function harness({ ledger = createTemplateCopilotV2Ledger(scope, flag), revision = 1, receipt = null, absent = false, rpcOutcome = "applied" } = {}) {
  const stored = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", owner_id: actor.id, status: "interviewing", revision, ledger };
  const calls = [];
  const query = (table) => ({
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    maybeSingle: async () => {
      if (absent && table === "template_copilot_sessions") return { data: null, error: null };
      if (table === "template_copilot_v2_operation_receipts") return { data: receipt, error: null };
      if (table === "template_copilot_sessions") return { data: stored, error: null };
      return { data: null, error: null };
    },
  });
  const session = { from: (table) => query(table) };
  const service = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "apply_template_copilot_v2_extraction" && rpcOutcome === "applied") {
        stored.ledger = args.p_ledger;
        stored.revision += 1;
        return { data: { outcome: "applied", sessionId: stored.id, revision: stored.revision, status: "interviewing", ledger: stored.ledger }, error: null };
      }
      if (name === "answer_template_copilot_v2_decision" && rpcOutcome === "applied") {
        stored.ledger = args.p_ledger;
        stored.revision += 1;
        return { data: { outcome: "applied", sessionId: stored.id, revision: stored.revision, status: "interviewing", ledger: stored.ledger }, error: null };
      }
      return { data: { outcome: rpcOutcome, currentRevision: stored.revision }, error: null };
    },
  };
  return { session, service, stored, calls };
}

async function createCandidateReview(h) {
  const candidate = textCandidate("workflow.name", "Purchase Approval");
  await applyTemplateCopilotV2CandidateExtraction({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: h.stored.revision, idempotencyKey: "extract:00000001", candidates: [candidate], flag });
  return h.stored.ledger.extractionEvidence.candidates[0];
}

function committedLedger(factId, value) {
  return applyTemplateCopilotV2FactTransition({
    ledger: createTemplateCopilotV2Ledger(scope, flag), factId,
    transition: { operation: "human_commit", payload: { canonicalValue: value, provenance: [{ kind: "human_editor", sourceId: `manual:${factId}`, sourceMessageIds: [] }] } },
    actorId: actor.id, confirmedAt: "2026-07-27T00:00:00Z", flag,
  });
}

test("candidate confirmation sends exact locked RPC arguments and commits only authoritative candidate state", async () => {
  const h = harness();
  const candidate = await createCandidateReview(h);
  const result = await confirmTemplateCopilotV2Candidate({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: h.stored.revision, idempotencyKey: "confirm:00000001", candidateId: candidate.candidateId, flag });
  assert.equal(result.outcome, "applied");
  const call = h.calls.at(-1);
  assert.equal(call.name, "apply_template_copilot_v2_extraction");
  assert.equal(call.args.p_operation, "candidate_confirmation");
  assert.equal(call.args.p_candidate_id, candidate.candidateId);
  assert.equal(call.args.p_conflict_id, null);
  assert.equal(call.args.p_choice, null);
  assert.equal(call.args.p_human_value, null);
  assert.equal(Object.hasOwn(call.args, "value"), false, "confirmation accepts only the durable candidate ID");
  assert.equal(call.args.p_ledger.facts["workflow.name"].status, "committed");
  assert.equal(call.args.p_ledger.extractionEvidence.candidates[0].state, "confirmed");
  assert.equal(call.args.p_ledger.extractionEvidence.history.at(-1).choice, "confirm_candidate");
});

test("conflict keep, incoming, and typed human choices preserve exact command inputs", async () => {
  for (const choice of ["keep_existing", "commit_incoming", "commit_human_value"]) {
    const base = committedLedger("workflow.name", "Invoice Approval");
    const ledger = projectTemplateCopilotV2Candidates({ ledger: base, candidates: [textCandidate("workflow.name", "Purchase Approval")] }).ledger;
    const h = harness({ ledger });
    const conflict = h.stored.ledger.extractionEvidence.conflicts[0];
    await resolveTemplateCopilotV2CommittedExtractionConflict({
      session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 1, idempotencyKey: `resolve:${choice}`,
      conflictId: conflict.conflictId, choice, rationale: "Process owner reviewed the evidence.", ...(choice === "commit_human_value" ? { humanValue: "Human Approved Name" } : {}), flag,
    });
    const call = h.calls.at(-1);
    assert.equal(call.args.p_operation, "resolve_extraction_conflict");
    assert.equal(call.args.p_conflict_id, conflict.conflictId);
    assert.equal(call.args.p_choice, choice);
    assert.equal(call.args.p_rationale, "Process owner reviewed the evidence.");
    assert.equal(call.args.p_ledger.extractionEvidence.conflicts[0].state, "closed");
    assert.equal(call.args.p_ledger.extractionEvidence.history.at(-1).rationale, "Process owner reviewed the evidence.");
    if (choice === "keep_existing") assert.equal(call.args.p_ledger.facts["workflow.name"].canonicalValue, "Invoice Approval");
    if (choice === "commit_incoming") assert.equal(call.args.p_ledger.facts["workflow.name"].canonicalValue, "Purchase Approval");
    if (choice === "commit_human_value") {
      assert.equal(call.args.p_human_value, "Human Approved Name");
      assert.equal(call.args.p_ledger.facts["workflow.name"].canonicalValue, "Human Approved Name");
      assert.equal(call.args.p_ledger.facts["workflow.name"].originalWording, undefined);
      assert.deepEqual(call.args.p_ledger.facts["workflow.name"].provenance, [{ kind: "human_editor", sourceId: `conflict:${conflict.conflictId}`, sourceMessageIds: [] }]);
      assert.equal(call.args.p_ledger.extractionEvidence.history.at(-1).choice, "commit_human_value");
      assert.equal(call.args.p_ledger.extractionEvidence.history.at(-1).humanValue, "Human Approved Name");
    }
  }
});

test("invalid human values and wrong or closed review IDs fail before any RPC", async () => {
  const base = committedLedger("workflow.name", "Invoice Approval");
  const ledger = projectTemplateCopilotV2Candidates({ ledger: base, candidates: [textCandidate("workflow.name", "Purchase Approval")] }).ledger;
  const h = harness({ ledger });
  const conflict = h.stored.ledger.extractionEvidence.conflicts[0];
  for (const operation of [
    () => resolveTemplateCopilotV2CommittedExtractionConflict({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 1, idempotencyKey: "bad-human:1", conflictId: conflict.conflictId, choice: "commit_human_value", humanValue: { invented: true }, flag }),
    () => resolveTemplateCopilotV2CommittedExtractionConflict({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 1, idempotencyKey: "wrong-id:1", conflictId: "f".repeat(64), choice: "keep_existing", flag }),
  ]) {
    await assert.rejects(operation, (error) => classifyTemplateCopilotV2OperationError(error, "unavailable").status === 409);
  }
  assert.equal(h.calls.length, 0);
  await resolveTemplateCopilotV2CommittedExtractionConflict({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 1, idempotencyKey: "close:0001", conflictId: conflict.conflictId, choice: "keep_existing", flag });
  await assert.rejects(() => resolveTemplateCopilotV2CommittedExtractionConflict({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 2, idempotencyKey: "closed:001", conflictId: conflict.conflictId, choice: "keep_existing", flag }), (error) => classifyTemplateCopilotV2OperationError(error, "unavailable").status === 409);
});

test("exact extraction, confirmation, and conflict replays return the current owner-scoped ledger", async () => {
  const extractionCandidate = textCandidate("workflow.name", "Purchase Approval");
  const extractionKey = "replay-extract";
  const extractionHash = templateCopilotV2CommandHash({ operation: "candidate_extraction", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: extractionKey, evidenceHash: templateCopilotV2CandidateEvidenceHash([extractionCandidate]) });
  const extraction = harness({ revision: 9, receipt: { command_hash: extractionHash, response: { ledger: createTemplateCopilotV2Ledger(scope, flag), revision: 1 } } });
  const extractionReplay = await applyTemplateCopilotV2CandidateExtraction({ session: extraction.session, service: extraction.service, actor, sessionId: extraction.stored.id, expectedRevision: 1, idempotencyKey: extractionKey, candidates: [extractionCandidate], flag });
  assert.equal(extractionReplay.revision, 9); assert.deepEqual(extractionReplay.ledger, extraction.stored.ledger); assert.equal(extraction.calls.length, 0);

  const candidateLedger = projectTemplateCopilotV2Candidates({ ledger: createTemplateCopilotV2Ledger(scope, flag), candidates: [extractionCandidate] }).ledger;
  const candidateId = candidateLedger.extractionEvidence.candidates[0].candidateId;
  const confirmationHash = templateCopilotV2CommandHash({ operation: "candidate_confirmation", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, candidateId });
  const confirmation = harness({ ledger: candidateLedger, revision: 10, receipt: { command_hash: confirmationHash, response: { ledger: createTemplateCopilotV2Ledger(scope, flag), revision: 1 } } });
  const confirmationReplay = await confirmTemplateCopilotV2Candidate({ session: confirmation.session, service: confirmation.service, actor, sessionId: confirmation.stored.id, expectedRevision: 1, idempotencyKey: "replay-confirm", candidateId, flag });
  assert.equal(confirmationReplay.revision, 10); assert.deepEqual(confirmationReplay.ledger, confirmation.stored.ledger); assert.equal(confirmation.calls.length, 0);

  const committed = committedLedger("workflow.name", "Invoice Approval");
  const conflictLedger = projectTemplateCopilotV2Candidates({ ledger: committed, candidates: [extractionCandidate] }).ledger;
  const conflictId = conflictLedger.extractionEvidence.conflicts[0].conflictId;
  const conflictKey = "replay-conflict";
  const conflictHash = templateCopilotV2CommandHash({ operation: "resolve_extraction_conflict", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, conflictId, choice: "keep_existing", rationale: undefined, humanValue: undefined });
  const conflict = harness({ ledger: conflictLedger, revision: 11, receipt: { command_hash: conflictHash, response: { ledger: createTemplateCopilotV2Ledger(scope, flag), revision: 1 } } });
  const conflictReplay = await resolveTemplateCopilotV2CommittedExtractionConflict({ session: conflict.session, service: conflict.service, actor, sessionId: conflict.stored.id, expectedRevision: 1, idempotencyKey: conflictKey, conflictId, choice: "keep_existing", flag });
  assert.equal(conflictReplay.revision, 11); assert.deepEqual(conflictReplay.ledger, conflict.stored.ledger); assert.equal(conflict.calls.length, 0);
});

test("replay, idempotency conflict, stale revision, and missing/other-owner requests reveal no mutable state", async () => {
  const replayLedger = createTemplateCopilotV2Ledger(scope, flag);
  const replay = harness({ receipt: { command_hash: "0".repeat(64), response: { ledger: replayLedger } } });
  const replayed = await applyTemplateCopilotV2CandidateExtraction({ session: replay.session, service: replay.service, actor, sessionId: replay.stored.id, expectedRevision: 1, idempotencyKey: "replay:0001", candidates: [textCandidate("workflow.name", "Purchase Approval")], flag });
  assert.equal(replayed.outcome, "idempotency_conflict", "different receipt hash never replays or writes");
  assert.equal(replay.calls.length, 0);

  const stale = harness({ rpcOutcome: "stale_revision" });
  const staleResult = await applyTemplateCopilotV2CandidateExtraction({ session: stale.session, service: stale.service, actor, sessionId: stale.stored.id, expectedRevision: 1, idempotencyKey: "stale:00001", candidates: [textCandidate("workflow.name", "Purchase Approval")], flag });
  assert.equal(staleResult.outcome, "stale_revision");
  assert.equal(stale.calls.length, 1);

  for (const absent of [true]) {
    const missing = harness({ absent });
    const result = await applyTemplateCopilotV2CandidateExtraction({ session: missing.session, service: missing.service, actor, sessionId: missing.stored.id, expectedRevision: 1, idempotencyKey: "private:001", candidates: [textCandidate("workflow.name", "Purchase Approval")], flag });
    assert.deepEqual(result, { outcome: "not_found" });
    assert.equal(missing.calls.length, 0);
  }
});

test("two-conflict attack cannot mutate an unrelated fact in a single resolution projection", async () => {
  let ledger = committedLedger("workflow.name", "Invoice Approval");
  ledger = applyTemplateCopilotV2FactTransition({ ledger, factId: "governance.owner", transition: { operation: "human_commit", payload: { canonicalValue: "CFO", provenance: [{ kind: "human_editor", sourceId: "manual:owner", sourceMessageIds: [] }] } }, actorId: actor.id, confirmedAt: "2026-07-27T00:00:00Z", flag });
  ledger = projectTemplateCopilotV2Candidates({ ledger, candidates: [textCandidate("workflow.name", "Purchase Approval"), textCandidate("governance.owner", "CEO", "m2")] }).ledger;
  const h = harness({ ledger });
  const [nameConflict, ownerConflict] = h.stored.ledger.extractionEvidence.conflicts;
  await resolveTemplateCopilotV2CommittedExtractionConflict({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: 1, idempotencyKey: "two-conflict", conflictId: nameConflict.conflictId, choice: "commit_incoming", flag });
  const projected = h.calls.at(-1).args.p_ledger;
  assert.equal(projected.facts["workflow.name"].canonicalValue, "Purchase Approval");
  assert.equal(projected.facts["governance.owner"].canonicalValue, "CFO");
  assert.equal(projected.extractionEvidence.conflicts.find((item) => item.conflictId === nameConflict.conflictId).state, "closed");
  assert.equal(projected.extractionEvidence.conflicts.find((item) => item.conflictId === ownerConflict.conflictId).state, "open");
});

test("review commands are server-v2-gated, not candidate-creation-gated; atomic answer has no extraction write and replay cannot duplicate one", async () => {
  const h = harness();
  const candidate = await createCandidateReview(h);
  await confirmTemplateCopilotV2Candidate({ session: h.session, service: h.service, actor, sessionId: h.stored.id, expectedRevision: h.stored.revision, idempotencyKey: "creation-off", candidateId: candidate.candidateId, flag });
  assert.equal(h.calls.at(-1).name, "apply_template_copilot_v2_extraction");

  const fresh = harness();
  const freshResult = await applyTemplateCopilotV2AtomicAnswer({ session: fresh.session, service: fresh.service, actor, sessionId: fresh.stored.id, expectedRevision: 1, idempotencyKey: "answer-fresh", answer: "Purchase Approval", flag });
  assert.equal(freshResult.outcome, "applied");
  assert.equal(fresh.calls.filter((call) => call.name === "apply_template_copilot_v2_extraction").length, 0, "extraction outage/malformed output is outside atomic mutation");

  const changedPayload = harness({ receipt: { command_hash: "not-the-command", response: {} } });
  const changedPayloadResult = await applyTemplateCopilotV2AtomicAnswer({ session: changedPayload.session, service: changedPayload.service, actor, sessionId: changedPayload.stored.id, expectedRevision: 1, idempotencyKey: "answer-replay", answer: "Purchase Approval", flag });
  assert.equal(changedPayloadResult.outcome, "idempotency_conflict");
  assert.equal(changedPayload.calls.length, 0, "same key with another payload cannot be sent to the answer RPC");

  const exactKey = "answer-exact";
  const exactHash = templateCopilotV2CommandHash({ operation: "atomic_answer", sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expectedRevision: 1, idempotencyKey: exactKey, answer: { kind: "text", text: "Purchase Approval" } });
  const exact = harness({ receipt: { command_hash: exactHash, response: { decisionId: "decision.workflow.name", questionId: "v2.workflow.name" } } });
  await applyTemplateCopilotV2AtomicAnswer({ session: exact.session, service: exact.service, actor, sessionId: exact.stored.id, expectedRevision: 1, idempotencyKey: exactKey, answer: "Purchase Approval", flag });
  assert.equal(exact.calls.filter((call) => call.name === "answer_template_copilot_v2_decision").length, 1, "exact replay uses the locked answer receipt path once");
  assert.equal(exact.calls.filter((call) => call.name === "apply_template_copilot_v2_extraction").length, 0, "exact answer replay cannot duplicate extraction persistence");
});
