import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTemplateCopilotV3ReleaseGate } from "./template-copilot-v3-release-gate.mjs";

function scenario({ matched = 19, expected = 20, batches = 5, safe = {} } = {}) {
  return {
    successfulBatchCount: batches,
    batchCount: 5,
    semanticCapture: {
      forbiddenHitCount: 0,
      quarantineHitCount: 0,
      unsafeQuoteCount: 0,
      defaultOrUnknownExtraCount: 0,
      conflictCount: 1,
      ...safe,
      observed: { matchedEntityCount: matched, expectedEntityCount: expected },
    },
  };
}

const fast = Array.from({ length: 100 }, (_, index) => 2_000 + index * 100);

test("a run passes at 95% coverage with every batch, no unsafe entry and calls in time", () => {
  const gate = evaluateTemplateCopilotV3ReleaseGate({
    report: { scenarios: [scenario(), scenario()] },
    latenciesMs: fast,
  });
  assert.equal(gate.passed, true, JSON.stringify(gate.checks));
  assert.equal(gate.coverage, 0.95);
});

test("each release check fails on its own", () => {
  const failing = (report, latenciesMs = fast) =>
    evaluateTemplateCopilotV3ReleaseGate({ report, latenciesMs }).checks
      .filter((check) => !check.passed)
      .map((check) => check.name);
  assert.deepEqual(failing({ scenarios: [scenario({ matched: 18 })] }), ["coverage"]);
  assert.deepEqual(failing({ scenarios: [scenario({ batches: 4 })] }), ["reliability"]);
  assert.deepEqual(
    failing({ scenarios: [scenario({ safe: { unsafeQuoteCount: 1 } })] }),
    ["safety"],
  );
  // A missing safety count is not evidence of safety.
  assert.deepEqual(
    failing({ scenarios: [scenario({ safe: { quarantineHitCount: undefined } })] }),
    ["safety"],
  );
  assert.deepEqual(
    failing({ scenarios: [scenario()] }, [...fast.slice(0, 90), ...Array(10).fill(19_000)]),
    ["speed"],
  );
  assert.deepEqual(
    failing({ scenarios: [] }, []),
    ["coverage", "reliability", "safety", "speed"],
  );
});
