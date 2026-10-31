import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2AtomicAnswer,
  processTemplateCopilotV2AnswerExtractionJob,
  templateCopilotV2CommandHash,
} from "./template-copilot-v2-server-data.ts";
import { createTemplateCopilotV2Ledger } from "./template-copilot-facts.ts";
import { templateCopilotV2CandidateEvidenceHash } from "./template-copilot-v2-candidates.ts";

const flag = { enabled: true };
const actor = { id: "33333333-3333-4333-8333-333333333333" };
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const answerClientMessageId = "answer:00000001";
const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const leaseToken = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts",
};
const candidate = {
  factId: "workflow.name",
  valueType: "text",
  value: "Purchase Approval",
  originalWording: "Purchase Approval",
  evidence: [{
    path: "/",
    messageId: answerClientMessageId,
    startCodePoint: 0,
    endCodePoint: 17,
    exactText: "Purchase Approval",
  }],
  confidence: "high",
  ambiguity: "none",
};

function jobHarness({
  claim = {
    outcome: "claimed",
    jobId,
    attempt: 1,
    answerRevision: 2,
    currentRevision: 2,
    answerMessageId: answerClientMessageId,
    answerMessage: "Purchase Approval",
    candidatePayload: null,
    candidatePayloadHash: null,
  },
  checkpoint = { outcome: "checkpointed" },
  finish = { outcome: "completed" },
  fail = { outcome: "retry" },
} = {}) {
  const calls = [];
  const service = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "claim_template_copilot_v2_answer_extraction_job") return { data: claim, error: null };
      if (name === "checkpoint_template_copilot_v2_answer_extraction_job") return { data: checkpoint, error: null };
      if (name === "finish_template_copilot_v2_answer_extraction_job") return { data: finish, error: null };
      if (name === "fail_template_copilot_v2_answer_extraction_job") return { data: fail, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { calls, service, session: {} };
}

test("candidate mode selects the atomic answer-plus-job RPC and exact replay selects it again", async () => {
  const ledger = createTemplateCopilotV2Ledger(scope, flag);
  const stored = { id: sessionId, owner_id: actor.id, status: "interviewing", revision: 1, ledger };
  const calls = [];
  let receipt = null;
  const session = {
    from: (table) => ({
      select() { return this; },
      eq() { return this; },
      order: async () => table === "template_copilot_messages" ? ({ data: [
        { id: answerClientMessageId, client_message_id: answerClientMessageId, role: "user", content: "Purchase Approval", created_at: "2026-07-27T12:00:00.000Z" },
        { id: `${answerClientMessageId}-assistant`, client_message_id: answerClientMessageId, role: "assistant", content: calls[0]?.args.p_assistant_message || "Saved: Purchase Approval", created_at: "2026-07-27T12:00:01.000Z" },
      ], error: null }) : ({ data: [], error: null }),
      maybeSingle: async () => {
        if (table === "template_copilot_v2_operation_receipts") return { data: receipt, error: null };
        if (table === "template_copilot_sessions") return { data: stored, error: null };
        return { data: null, error: null };
      },
    }),
  };
  const service = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data: {
          outcome: receipt ? "replayed" : "applied",
          sessionId,
          revision: 2,
          status: "interviewing",
          ledger: args.p_ledger,
        },
        error: null,
      };
    },
  };
  await applyTemplateCopilotV2AtomicAnswer({
    session,
    service,
    actor,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: answerClientMessageId,
    answer: "Purchase Approval",
    enqueueExtractionJob: true,
    flag,
  });
  assert.equal(calls[0].name, "answer_template_copilot_v2_decision_with_extraction_job");
  assert.equal(calls[0].args.p_enqueue_extraction, true);

  const commandHash = templateCopilotV2CommandHash({
    operation: "atomic_answer",
    sessionId,
    expectedRevision: 1,
    idempotencyKey: answerClientMessageId,
    answer: { kind: "text", text: "Purchase Approval" },
  });
  receipt = {
    command_hash: commandHash,
    response: {
      appliedRevision: 2,
      questionId: "v2.workflow.name",
      decisionId: "decision.workflow.name",
    },
  };
  await applyTemplateCopilotV2AtomicAnswer({
    session,
    service,
    actor,
    sessionId,
    expectedRevision: 1,
    idempotencyKey: answerClientMessageId,
    answer: "Purchase Approval",
    enqueueExtractionJob: true,
    flag,
  });
  assert.equal(calls[1].name, "answer_template_copilot_v2_decision_with_extraction_job");
  assert.equal(calls[1].args.p_enqueue_extraction, true);
});

test("fresh processing checkpoints validated candidates before one answer-revision-bound write", async () => {
  const h = jobHarness();
  let persistedInput;
  const result = await processTemplateCopilotV2AnswerExtractionJob({
    session: h.session,
    service: h.service,
    actor,
    sessionId,
    answerClientMessageId,
    dependencies: {
      leaseToken,
      extractCandidates: async ({ message, messageId }) => {
        assert.equal(message, "Purchase Approval");
        assert.equal(messageId, answerClientMessageId);
        return { candidates: [candidate], rejected: [], model: "synthetic" };
      },
      persistCandidates: async (input) => {
        persistedInput = input;
        return { outcome: "applied", revision: 3 };
      },
    },
    flag,
  });
  assert.equal(result.outcome, "completed");
  assert.equal(result.candidateCount, 1);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "claim_template_copilot_v2_answer_extraction_job",
    "checkpoint_template_copilot_v2_answer_extraction_job",
    "finish_template_copilot_v2_answer_extraction_job",
  ]);
  assert.equal(persistedInput.expectedRevision, 2);
  assert.equal(persistedInput.idempotencyKey, `extract-job:${jobId}`);
  assert.deepEqual(persistedInput.candidates, [candidate]);
  assert.deepEqual(h.calls[1].args.p_candidate_payload, [candidate]);
  assert.equal(h.calls[1].args.p_candidate_payload_hash, templateCopilotV2CandidateEvidenceHash([candidate]));
  assert.equal(h.calls[2].args.p_completion_outcome, "applied");
  assert.equal(h.calls[2].args.p_completed_revision, 3);
});

test("scheduled processing resolves an opaque job id through the existing owner-bound claim", async () => {
  const h = jobHarness();
  let providerMessageId;
  const result = await processTemplateCopilotV2AnswerExtractionJob({
    session: h.session,
    service: h.service,
    actor,
    sessionId,
    jobId,
    dependencies: {
      leaseToken,
      extractCandidates: async ({ messageId }) => {
        providerMessageId = messageId;
        return { candidates: [candidate] };
      },
      persistCandidates: async () => ({ outcome: "applied", revision: 3 }),
    },
    flag,
  });
  assert.equal(result.outcome, "completed");
  assert.equal(providerMessageId, answerClientMessageId);
  assert.equal(h.calls[0].args.p_job_id, jobId);
  assert.equal(h.calls[0].args.p_answer_client_message_id, null);
  assert.equal(h.calls[0].args.p_actor_id, actor.id);
  assert.equal(h.calls[0].args.p_session_id, sessionId);
});

test("job processing fails closed unless exactly one opaque locator is supplied", async () => {
  const h = jobHarness();
  for (const locators of [
    {},
    { jobId, answerClientMessageId },
  ]) {
    await assert.rejects(
      processTemplateCopilotV2AnswerExtractionJob({
        session: h.session,
        service: h.service,
        actor,
        sessionId,
        ...locators,
        dependencies: {
          leaseToken,
          extractCandidates: async () => ({ candidates: [] }),
        },
        flag,
      }),
      /Exactly one extraction job locator/,
    );
  }
  assert.equal(h.calls.length, 0);
});

test("a private checkpoint resumes without another provider call and makes duplicate persistence replay-safe", async () => {
  const h = jobHarness({
    claim: {
      outcome: "claimed",
      jobId,
      attempt: 2,
      answerRevision: 2,
      currentRevision: 4,
      answerMessageId: answerClientMessageId,
      answerMessage: "Purchase Approval",
      candidatePayload: [candidate],
      candidatePayloadHash: templateCopilotV2CandidateEvidenceHash([candidate]),
    },
  });
  let extracted = false;
  const result = await processTemplateCopilotV2AnswerExtractionJob({
    session: h.session,
    service: h.service,
    actor,
    sessionId,
    answerClientMessageId,
    dependencies: {
      leaseToken,
      extractCandidates: async () => {
        extracted = true;
        throw new Error("checkpoint should suppress provider");
      },
      persistCandidates: async (input) => {
        assert.equal(input.expectedRevision, 2);
        return { outcome: "replayed", revision: 4 };
      },
    },
    flag,
  });
  assert.equal(extracted, false);
  assert.equal(result.outcome, "completed");
  assert.deepEqual(h.calls.map((call) => call.name), [
    "claim_template_copilot_v2_answer_extraction_job",
    "finish_template_copilot_v2_answer_extraction_job",
  ]);
  assert.equal(h.calls[1].args.p_completion_outcome, "replayed");
});

test("a later manual revision supersedes an uncheckpointed job without a provider call or candidate write", async () => {
  const h = jobHarness({
    claim: {
      outcome: "claimed",
      jobId,
      attempt: 1,
      answerRevision: 2,
      currentRevision: 3,
      answerMessageId: answerClientMessageId,
      answerMessage: "Purchase Approval",
      candidatePayload: null,
      candidatePayloadHash: null,
    },
    finish: { outcome: "superseded" },
  });
  let providerCalls = 0;
  let persistenceCalls = 0;
  const result = await processTemplateCopilotV2AnswerExtractionJob({
    session: h.session,
    service: h.service,
    actor,
    sessionId,
    answerClientMessageId,
    dependencies: {
      leaseToken,
      extractCandidates: async () => {
        providerCalls += 1;
        return { candidates: [candidate], rejected: [], model: "synthetic" };
      },
      persistCandidates: async () => {
        persistenceCalls += 1;
        return { outcome: "applied", revision: 4 };
      },
    },
    flag,
  });
  assert.equal(result.outcome, "superseded");
  assert.equal(providerCalls, 0);
  assert.equal(persistenceCalls, 0);
  assert.equal(h.calls[1].name, "finish_template_copilot_v2_answer_extraction_job");
  assert.equal(h.calls[1].args.p_completion_outcome, "superseded");
});

test("provider failure is retriable and never invokes candidate persistence", async () => {
  const h = jobHarness();
  let persistenceCalls = 0;
  const result = await processTemplateCopilotV2AnswerExtractionJob({
    session: h.session,
    service: h.service,
    actor,
    sessionId,
    answerClientMessageId,
    dependencies: {
      leaseToken,
      extractCandidates: async () => {
        throw Object.assign(new Error("timeout"), { reasonCode: "provider_error" });
      },
      persistCandidates: async () => {
        persistenceCalls += 1;
        return { outcome: "applied", revision: 3 };
      },
    },
    flag,
  });
  assert.equal(result.outcome, "retry");
  assert.equal(result.errorCode, "provider_error");
  assert.equal(persistenceCalls, 0);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "claim_template_copilot_v2_answer_extraction_job",
    "fail_template_copilot_v2_answer_extraction_job",
  ]);
  assert.equal(h.calls[1].args.p_retry, true);
  assert.equal(h.calls[1].args.p_error_code, "provider_error");
});

test("busy, not-yet-due retry, completed, missing, and other-owner claim outcomes are idempotent no-ops", async () => {
  for (const outcome of ["busy", "retry_later", "completed", "missing", "not_found"]) {
    const h = jobHarness({ claim: { outcome } });
    const result = await processTemplateCopilotV2AnswerExtractionJob({
      session: h.session,
      service: h.service,
      actor,
      sessionId,
      answerClientMessageId,
      dependencies: {
        leaseToken,
        extractCandidates: async () => {
          throw new Error("must not run");
        },
        persistCandidates: async () => {
          throw new Error("must not run");
        },
      },
      flag,
    });
    assert.equal(result.outcome, outcome);
    assert.equal(h.calls.length, 1);
  }
});
