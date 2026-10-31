import assert from "node:assert/strict";
import test from "node:test";
import { drainTemplateCopilotV2ExtractionJobs } from "./template-copilot-v2-extraction-drain.ts";

const enabledEnv = {
  TEMPLATE_COPILOT_V2: "true",
  TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW: "true",
  TEMPLATE_COPILOT_V2_CANDIDATE_CREATION: "true",
};

function uuid(value) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function binding(value) {
  return {
    job_id: uuid(value),
    owner_id: uuid(value + 100),
    session_id: uuid(value + 200),
    lease_token: uuid(value + 300),
  };
}

test("autonomous extraction drain is default-off and does not touch the service database", async () => {
  let rpcCalls = 0;
  const result = await drainTemplateCopilotV2ExtractionJobs({
    env: {},
    service: {
      rpc: async () => {
        rpcCalls += 1;
        throw new Error("disabled drain must not access the database");
      },
    },
  });
  assert.equal(result.outcome, "disabled");
  assert.equal(result.dequeued, 0);
  assert.equal(rpcCalls, 0);
});

test("a pending answer job recovers autonomously after the answer after-callback is interrupted", async () => {
  const due = binding(1);
  const calls = [];
  const service = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      assert.equal(name, "dequeue_template_copilot_v2_answer_extraction_jobs");
      return { data: [due], error: null };
    },
  };
  const result = await drainTemplateCopilotV2ExtractionJobs({
    env: enabledEnv,
    service,
    processJob: async (input) => {
      assert.equal(input.jobId, due.job_id);
      assert.equal(input.sessionId, due.session_id);
      assert.deepEqual(input.actor, { id: due.owner_id });
      assert.equal(input.answerClientMessageId, undefined);
      assert.equal(input.dependencies.leaseToken, due.lease_token);
      return { outcome: "completed", candidateCount: 1 };
    },
    extractCandidates: async () => {
      throw new Error("the processor stub owns this test");
    },
  });
  assert.equal(result.outcome, "completed");
  assert.equal(result.dequeued, 1);
  assert.equal(result.attempted, 1);
  assert.equal(result.completed, 1);
  assert.equal(calls[0].args.p_limit, 4);
  assert.equal(calls[0].args.p_lease_seconds, 60);
});

test("drain clamps database batch size and processor concurrency", async () => {
  const rows = Array.from({ length: 8 }, (_, index) => binding(index + 1));
  let active = 0;
  let maximumActive = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const service = {
    rpc: async (_name, args) => {
      assert.equal(args.p_limit, 8);
      return { data: rows, error: null };
    },
  };
  const draining = drainTemplateCopilotV2ExtractionJobs({
    env: enabledEnv,
    service,
    batchSize: 999,
    concurrency: 999,
    processJob: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gate;
      active -= 1;
      return { outcome: "completed" };
    },
    extractCandidates: async () => {
      throw new Error("unused");
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 4);
  release();
  const result = await draining;
  assert.equal(maximumActive, 4);
  assert.equal(result.dequeued, 8);
  assert.equal(result.completed, 8);
});

test("overlapping scheduled consumers process one leased binding exactly once", async () => {
  const due = binding(1);
  let dequeueCalls = 0;
  let processCalls = 0;
  const service = {
    rpc: async () => {
      dequeueCalls += 1;
      return { data: dequeueCalls === 1 ? [due] : [], error: null };
    },
  };
  const run = () => drainTemplateCopilotV2ExtractionJobs({
    env: enabledEnv,
    service,
    processJob: async () => {
      processCalls += 1;
      return { outcome: "completed" };
    },
    extractCandidates: async () => {
      throw new Error("unused");
    },
  });
  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first.dequeued + second.dequeued, 1);
  assert.equal(first.completed + second.completed, 1);
  assert.equal(processCalls, 1);
});

test("drain stops starting new work after its bounded time budget", async () => {
  const rows = [binding(1), binding(2)];
  const ticks = [0, 0, 1_001];
  let processed = 0;
  const result = await drainTemplateCopilotV2ExtractionJobs({
    env: enabledEnv,
    service: { rpc: async () => ({ data: rows, error: null }) },
    concurrency: 1,
    timeBudgetMs: 1_000,
    clock: () => ticks.shift() ?? 1_001,
    processJob: async () => {
      processed += 1;
      return { outcome: "completed" };
    },
    extractCandidates: async () => {
      throw new Error("unused");
    },
  });
  assert.equal(result.outcome, "time_budget_exhausted");
  assert.equal(processed, 1);
  assert.equal(result.skipped, 1);
});

test("dequeue fails closed for malformed, duplicate, or oversized service bindings", async () => {
  for (const data of [
    [{ ...binding(1), owner_id: "not-a-uuid" }],
    [binding(1), binding(1)],
    Array.from({ length: 5 }, (_, index) => binding(index + 1)),
  ]) {
    await assert.rejects(
      drainTemplateCopilotV2ExtractionJobs({
        env: enabledEnv,
        service: { rpc: async () => ({ data, error: null }) },
        batchSize: 4,
        processJob: async () => ({ outcome: "completed" }),
        extractCandidates: async () => {
          throw new Error("unused");
        },
      }),
      /invalid (batch|binding)/,
    );
  }
});

test("processor failures leave only aggregate recovery counters", async () => {
  const result = await drainTemplateCopilotV2ExtractionJobs({
    env: enabledEnv,
    service: { rpc: async () => ({ data: [binding(1)], error: null }) },
    processJob: async () => {
      throw new Error("raw answer must never escape");
    },
    extractCandidates: async () => {
      throw new Error("unused");
    },
  });
  assert.deepEqual(result, {
    outcome: "partial",
    dequeued: 1,
    attempted: 1,
    completed: 0,
    superseded: 0,
    retry: 0,
    failed: 0,
    busy: 0,
    deferred: 0,
    errors: 1,
    skipped: 0,
  });
});
