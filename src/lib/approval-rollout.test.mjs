import assert from "node:assert/strict";
import test from "node:test";
import { getApprovalRolloutDecision } from "./approval-rollout.ts";

test("rollout decisions accept server-owned authoritative state", async () => {
  const decision = await getApprovalRolloutDecision({
    async rpc(name, args) {
      assert.equal(name, "get_approval_rollout_decision");
      assert.equal(args.p_actor_id, "actor-1");
      return { data: {
        mode: "cohort", commandEnabled: true, cohortBucket: 12,
        cohortPercentage: 25, legacyReadFallbackAllowed: true,
        legacyReadFallbackUntil: "2026-07-21T00:00:00.000Z",
        legacyWritesFrozen: true,
      }, error: null };
    },
  }, "actor-1");
  assert.equal(decision.commandEnabled, true);
  assert.equal(decision.cohortPercentage, 25);
});

test("rollout decisions fail closed on missing, invalid, or unfrozen state", async () => {
  for (const result of [
    { data: null, error: { message: "offline" } },
    { data: { mode: "authoritative", commandEnabled: true, legacyWritesFrozen: false }, error: null },
  ]) {
    const decision = await getApprovalRolloutDecision({ async rpc() { return result; } }, "actor-1");
    assert.deepEqual(decision, {
      mode: "rollback_read_only", commandEnabled: false, cohortBucket: null,
      cohortPercentage: 0, legacyReadFallbackAllowed: false,
      legacyReadFallbackUntil: null, legacyWritesFrozen: true,
    });
  }
});
