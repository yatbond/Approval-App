import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  answersForScenario,
  templateCopilotQualificationScenarios,
} from "../../scripts/template-copilot-qualification-scenarios.mjs";
import { scoreLiveSemanticExtraction } from "../../scripts/template-copilot-live-semantic-scoring.mjs";

test("live semantic qualification covers 24 scenarios and nine focused sections", () => {
  assert.equal(templateCopilotQualificationScenarios.length, 24);
  for (const scenario of templateCopilotQualificationScenarios) {
    assert.deepEqual(Object.keys(answersForScenario(scenario)), [
      "identity_scope",
      "initiators_fields",
      "attachments",
      "stages_participants",
      "conditions_exceptions",
      "collaboration_corrections",
      "timing_escalation",
      "visibility_notifications",
      "governance",
    ]);
  }
});

test("live semantic scoring fails closed for missing facts and invalid evidence", () => {
  const item = templateCopilotQualificationScenarios[0];
  const result = scoreLiveSemanticExtraction({
    item,
    sourceMessages: { source: "Purchase approval" },
    candidates: [{
      factId: "workflow.name",
      value: "Purchase approval",
      evidence: [{
        messageId: "source",
        path: "/",
        startCodePoint: 0,
        endCodePoint: 8,
        exactText: "Purchase approval",
      }],
    }],
  });
  assert.equal(result.passed, false);
  assert.equal(result.evidenceFailureCount, 1);
  assert.ok(
    result.failures.some((failure) =>
      failure.includes("No source-backed candidate"),
    ),
  );
});

test("live semantic scoring rejects an exact suffix with an out-of-range end", () => {
  const item = templateCopilotQualificationScenarios[0];
  const result = scoreLiveSemanticExtraction({
    item,
    sourceMessages: { source: "abc" },
    candidates: [{
      factId: "workflow.name",
      value: "bc",
      evidence: [{
        messageId: "source",
        path: "/",
        startCodePoint: 1,
        endCodePoint: 999,
        exactText: "bc",
      }],
    }],
  });
  assert.equal(result.evidenceFailureCount, 1);
});

test("live provider harness is ZDR-required and stores neither source nor raw output", async () => {
  const [script, packageJson] = await Promise.all([
    readFile(
      new URL(
        "../../scripts/test-template-copilot-v2-live-semantic-qualification.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(script, /TEMPLATE_COPILOT_OPENROUTER_ZDR=true/);
  assert.match(script, /sourceTextStored:\s*false/);
  assert.match(script, /providerOutputStored:\s*false/);
  assert.match(script, /QUALIFICATION_CONCURRENCY=1/);
  assert.match(script, /maximumInternalProviderConcurrency:\s*3/);
  assert.match(script, /providerRequestCountAvailable:\s*true/);
  assert.match(script, /observeProviderRequest:\s*providerRequests\.observe/);
  assert.match(script, /sourceRevision,\s*\n\s*sourceWorktreeClean:/);
  assert.match(script, /sourceWorktreeClean:\s*worktreeStatus === ""/);
  assert.match(script, /QUALIFICATION_ALLOW_DIRTY_SOURCE/);
  assert.match(script, /requires a clean source worktree/);
  assert.match(script, /fixtureFingerprint:\s*`sha256:/);
  assert.match(script, /extractionPromptVersion:/);
  assert.match(script, /providerTimeoutMs:/);
  assert.doesNotMatch(script, /sourceMessages,\s*candidates,\s*calls/);
  assert.match(
    packageJson,
    /node --conditions=react-server --import tsx scripts\/test-template-copilot-v2-live-semantic-qualification\.mjs/,
  );
});
