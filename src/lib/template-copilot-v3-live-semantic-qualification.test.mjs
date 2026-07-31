import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  assertTemplateCopilotV3QualificationSource,
  runTemplateCopilotV3LiveSemanticQualification,
  selectTemplateCopilotV3QualificationScenarios,
  summarizeQualification,
  templateCopilotV3QualificationBaselineModel,
  templateCopilotV3QualificationFactIds,
  templateCopilotV3QualificationHardScenarioIds,
  templateCopilotV3QualificationObservedMetricKeys,
  templateCopilotV3QualificationSourceStateMatches,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-runner.mjs";
import { templateCopilotV3SemanticScenarioManifest } from "../../scripts/template-copilot-v3-semantic-scenario-manifests.mjs";
import { templateCopilotV3ProviderQuoteContractVersion } from "./template-copilot-v3-provider-quotes.ts";
import { templateCopilotV3LiveSemanticScoringContract } from "../../scripts/template-copilot-v3-live-semantic-scoring.mjs";

test("v3 qualification executes exactly two sequential batches for all 24 multilingual scenarios", async () => {
  const calls = [];
  let active = 0;
  let maximumActive = 0;
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: templateCopilotQualificationScenarios,
    extractBatch: async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      calls.push({
        scenarioId: input.sourceSlots[0].messageId.split(":")[0],
        batchId: input.batchId,
        sourceSlots: input.sourceSlots,
      });
      input.observeProviderRequest({
        outcome: "success",
        latencyMs: 5,
      });
      await Promise.resolve();
      active -= 1;
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: acceptedFixtureBatch(input.batchId),
        rejected: [],
      };
    },
    assembleReview: passingAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.equal(maximumActive, 1);
  assert.equal(calls.length, 48);
  for (let index = 0; index < calls.length; index += 2) {
    assert.equal(calls[index].batchId, "structure");
    assert.equal(calls[index + 1].batchId, "policy_context");
    assert.equal(calls[index].scenarioId, calls[index + 1].scenarioId);
  }
  assert.equal(report.summary.fullGatePassed, false);
  assert.equal(report.summary.passed, false);
  assert.equal(report.metadata.expectedLocaleCount, 3);
  assert.equal(report.metadata.expectedScenariosPerLocale, 8);
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.semanticCaptureGate.passed, false);
  assert.equal(report.summary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(report.summary.scenarioPassCount, 24);
  assert.equal(report.summary.governedHoldCount, 0);
  assert.equal(report.summary.executableDraftGate.passed, false);
  assert.equal(report.summary.executableDraftGate.evaluated, false);
  assert.equal(report.summary.activationGate.passed, false);
  assert.equal(report.summary.pilotGate.passed, false);
  assert.equal(report.summary.successfulBatchCount, 48);
  assert.equal(report.summary.providerRequestCount, 48);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.deepEqual(report.summary.languageSummaries[locale], {
      scenarioCount: 8,
      sourceCapturePassCount: 8,
      governedHoldCount: 0,
      executableDraftPassCount: 0,
      successfulBatchCount: 16,
      batchCount: 16,
    });
  }
});

test("v3 qualification reports 24/24 source capture and 64 holds without claiming executable or pilot readiness", () => {
  const scenarios = templateCopilotQualificationScenarios.map((item) => {
    const governedHolds = expectedGovernedHolds(item.id);
    return {
      id: item.id,
      language: item.language,
      batchCount: 2,
      successfulBatchCount: 2,
      batches: ["structure", "policy_context"].map((batchId) => ({
        batchId,
        status: "applied",
        providerRequestCount: 1,
        providerRequestSuccessCount: 1,
        providerRequestFailureCount: 0,
        providerOutcome: "success",
        failureCount: 0,
      })),
      semanticCapture: {
        resultValid: true,
        passed: true,
        governedHoldCount: governedHolds.length,
        governedHolds,
      },
      executableDraft: { evaluated: false, passed: false },
    };
  });
  const report = {
    metadata: {
      ...qualificationMetadata(),
      fullScenarioSetSelected: true,
    },
    scenarios,
  };
  const summary = summarizeQualification(report);

  assert.equal(summary.passed, false);
  assert.equal(summary.fullGatePassed, false);
  assert.equal(summary.selectedGatePassed, false);
  assert.equal(summary.semanticCaptureGate.passed, true);
  assert.equal(summary.semanticCaptureGate.fullCorpusPassed, true);
  assert.equal(summary.semanticCaptureGate.scenarioPassCount, 24);
  assert.equal(summary.semanticCaptureGate.identityAndLocalePassed, true);
  assert.equal(summary.semanticCaptureGate.inventoryMatchedScenarioCount, 24);
  assert.equal(summary.semanticCaptureGate.governedHoldCount, 64);
  assert.equal(summary.executableDraftGate.evaluated, false);
  assert.equal(summary.executableDraftGate.passed, false);
  assert.equal(summary.executableDraftGate.scenarioPassCount, 0);
  assert.equal(summary.executableDraftGate.scenarioCount, 24);
  assert.ok(
    summary.executableDraftGate.blockerCodes.includes(
      "governed_semantics_not_executable",
    ),
  );
  assert.equal(summary.activationGate.evaluated, false);
  assert.equal(summary.activationGate.passed, false);
  assert.equal(summary.pilotGate.evaluated, false);
  assert.equal(summary.pilotGate.passed, false);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.equal(summary.languageSummaries[locale].scenarioCount, 8);
    assert.equal(summary.languageSummaries[locale].sourceCapturePassCount, 8);
    assert.equal(summary.languageSummaries[locale].executableDraftPassCount, 0);
  }

  const wrongScenario = structuredClone(report);
  const allHolds = wrongScenario.scenarios.flatMap(
    (scenario) => scenario.semanticCapture.governedHolds,
  );
  for (const scenario of wrongScenario.scenarios) {
    scenario.semanticCapture.governedHolds = [];
    scenario.semanticCapture.governedHoldCount = 0;
  }
  wrongScenario.scenarios[0].semanticCapture.governedHolds = allHolds;
  wrongScenario.scenarios[0].semanticCapture.governedHoldCount = allHolds.length;
  const wrongScenarioSummary = summarizeQualification(wrongScenario);
  assert.equal(wrongScenarioSummary.governedHoldCount, 64);
  assert.equal(wrongScenarioSummary.semanticCaptureGate.passed, false);
  assert.equal(wrongScenarioSummary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(
    wrongScenarioSummary.semanticCaptureGate.inventoryMatchedScenarioCount,
    0,
  );

  const wrongReason = structuredClone(report);
  const conditionHold = wrongReason.scenarios
    .flatMap((scenario) => scenario.semanticCapture.governedHolds)
    .find(
      (hold) =>
        hold.factId === "workflow.conditions" &&
        hold.blockingReason === "unsupported_semantics_not_executable",
    );
  assert.ok(conditionHold);
  conditionHold.blockingReason = "compound_predicate_not_executable";
  const wrongReasonSummary = summarizeQualification(wrongReason);
  assert.equal(wrongReasonSummary.governedHoldCount, 64);
  assert.equal(wrongReasonSummary.semanticCaptureGate.passed, false);
  assert.equal(wrongReasonSummary.semanticCaptureGate.fullCorpusPassed, false);

  const wrongLocale = structuredClone(report);
  wrongLocale.scenarios[0].language = "zh-Hant";
  const wrongLocaleSummary = summarizeQualification(wrongLocale);
  assert.equal(wrongLocaleSummary.governedHoldCount, 64);
  assert.equal(wrongLocaleSummary.semanticCaptureGate.identityAndLocalePassed, false);
  assert.equal(wrongLocaleSummary.semanticCaptureGate.passed, false);
  assert.equal(wrongLocaleSummary.semanticCaptureGate.fullCorpusPassed, false);
});

function expectedGovernedHolds(id) {
  const manifest = templateCopilotV3SemanticScenarioManifest(id);
  assert.ok(manifest, `Missing manifest ${id}`);
  return [
    ...manifest.attachments
      .filter(
        (entry) => !["required", "optional"].includes(entry.requirementMode),
      )
      .map(() => ({
        factId: "attachments.requirements",
        blockingReason: "unsupported_semantics_not_executable",
      })),
    ...manifest.stages
      .filter((entry) => entry.kind === "record_update")
      .map(() => ({
        factId: "workflow.stages",
        blockingReason: "unsupported_semantics_not_executable",
      })),
    ...manifest.conditions
      .filter(
        (entry) => entry.predicateContext.executionMode !== "structured",
      )
      .map((entry) => ({
        factId: "workflow.conditions",
        blockingReason: entry.predicateContext.executionMode,
      })),
  ].sort(
    (left, right) =>
      left.factId.localeCompare(right.factId, "en") ||
      left.blockingReason.localeCompare(right.blockingReason, "en"),
  );
}

test("v3 qualification keeps stable server source IDs and quarantines the hostile EN-01 probe before extraction", async () => {
  const observedSlots = [];
  const scenario = templateCopilotQualificationScenarios.find(
    (item) => item.id === "EN-01",
  );
  assert.ok(scenario);
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      observedSlots.push(...input.sourceSlots);
      input.observeProviderRequest({
        outcome: "success",
        latencyMs: 1,
      });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: [],
        rejected: [],
      };
    },
    assembleReview: emptyAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.deepEqual(
    observedSlots.map((slot) => slot.messageId),
    [
      "EN-01:initiators_fields",
      "EN-01:attachments",
      "EN-01:stages_participants",
      "EN-01:conditions_exceptions",
      "EN-01:identity_scope",
      "EN-01:collaboration_corrections",
      "EN-01:timing_escalation",
      "EN-01:visibility_notifications",
      "EN-01:governance",
    ],
  );
  const attachments = observedSlots.find((slot) => slot.slot === "attachments");
  assert.ok(attachments);
  assert.match(attachments.text, /supplier quotation PDF/u);
  assert.doesNotMatch(
    attachments.text,
    /ignore previous instructions|attacker@example\.net|reveal all secrets/iu,
  );
  assert.ok(
    report.scenarios[0].sourceAuthority.quarantine.quarantinedBlockCount >= 1,
  );
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /supplier quotation PDF/iu);
  assert.doesNotMatch(serialized, /attacker@example\.net/iu);
  assert.doesNotMatch(serialized, /EN-01:attachments/u);
});

test("v3 qualification isolates a failed batch, continues the second batch, and stores no provider error", async () => {
  const calls = [];
  const scenario = templateCopilotQualificationScenarios.find(
    (item) => item.id === "EN-07",
  );
  assert.ok(scenario);
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      calls.push(input.batchId);
      if (input.batchId === "structure") {
        input.observeProviderRequest({
          outcome: "timeout",
          latencyMs: 12_000,
        });
        throw new Error(
          "TOP SECRET provider error containing raw output and user text",
        );
      }
      input.observeProviderRequest({
        outcome: "success",
        latencyMs: 5,
      });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: [],
        rejected: [],
      };
    },
    assembleReview: emptyAssembly,
    scoreProjection: ({ batches }) => ({
      ...passingScore(),
      passed: batches.every((batch) => batch.status === "applied"),
      failures: ["A required provider batch failed."],
    }),
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.deepEqual(calls, ["structure", "policy_context"]);
  assert.equal(report.scenarios[0].successfulBatchCount, 1);
  assert.equal(report.scenarios[0].batches[0].providerOutcome, "timeout");
  assert.equal(report.scenarios[0].batches[1].status, "applied");
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.providerRequestCount, 2);
  assert.equal(report.summary.providerRequestFailureCount, 1);
  assert.doesNotMatch(
    JSON.stringify(report),
    /TOP SECRET|raw output|user text/u,
  );
});

test("v3 qualification source guard fails closed unless dirty source is explicitly exploratory", () => {
  const revision = "a".repeat(40);
  assert.throws(
    () =>
      assertTemplateCopilotV3QualificationSource({
        sourceRevision: revision,
        worktreeStatus: " M source.ts",
        allowDirtySource: false,
      }),
    /clean source worktree/u,
  );
  assert.deepEqual(
    assertTemplateCopilotV3QualificationSource({
      sourceRevision: revision,
      worktreeStatus: " M source.ts",
      allowDirtySource: true,
    }),
    {
      sourceRevision: revision,
      sourceWorktreeClean: false,
      comparableCleanSource: false,
      qualificationMode: "exploratory",
    },
  );
});

test("v3 qualification hard subset is fixed and never masquerades as the full gate", async () => {
  const selected = selectTemplateCopilotV3QualificationScenarios({
    corpus: templateCopilotQualificationScenarios,
    hardSubset: true,
  });
  assert.deepEqual(
    selected.map((item) => item.id),
    templateCopilotV3QualificationHardScenarioIds,
  );
  assert.throws(
    () =>
      selectTemplateCopilotV3QualificationScenarios({
        corpus: templateCopilotQualificationScenarios,
        hardSubset: true,
        limit: 1,
      }),
    /cannot be combined/u,
  );

  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: selected,
    extractBatch: successfulExtractor,
    assembleReview: passingAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.semanticCaptureGate.passed, false);
  assert.equal(report.summary.semanticCaptureGate.inventoryMatchedScenarioCount, 0);
  assert.equal(report.summary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(report.summary.fullGatePassed, false);
  assert.equal(report.summary.passed, false);
  assert.equal(report.summary.pilotGate.passed, false);
  assert.equal(report.summary.scenarioPassCount, 6);
  assert.equal(report.summary.successfulBatchCount, 12);
});

test("v3 formal full gate requires clean comparable source, baseline route, timeout, and reasoning", async () => {
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: templateCopilotQualificationScenarios,
    extractBatch: successfulExtractor,
    assembleReview: passingAssembly,
    scoreProjection: passingScore,
    metadata: {
      ...qualificationMetadata(),
      providerTimeoutMs: 20_000,
    },
    now: monotonicClock(),
  });
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(report.summary.fullGatePassed, false);

  report.metadata.providerTimeoutMs = 12_000;
  report.metadata.comparableCleanSource = false;
  report.metadata.sourceWorktreeClean = false;
  report.metadata.qualificationMode = "exploratory";
  assert.equal(summarizeQualification(report).fullGatePassed, false);

  report.metadata.comparableCleanSource = true;
  report.metadata.sourceWorktreeClean = true;
  report.metadata.qualificationMode = "clean_source";
  report.metadata.reasoningEffort = "high";
  assert.equal(summarizeQualification(report).fullGatePassed, false);

  const cliSource = await readFile(
    new URL(
      "../../scripts/test-template-copilot-v3-live-semantic-qualification.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(cliSource, /providerTimeoutMs !== 12_000/u);
  assert.match(cliSource, /configuredReasoningEffort !== "none"/u);
});

test("v3 qualification rejects a mismatched returned batch envelope and continues", async () => {
  const calls = [];
  const scenario = templateCopilotQualificationScenarios.find(
    (item) => item.id === "EN-07",
  );
  assert.ok(scenario);
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      calls.push(input.batchId);
      input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: {
          ...batchIdentity(input),
          locale: input.batchId === "structure" ? "zh-Hant" : input.locale,
        },
        accepted: [],
        rejected: [],
      };
    },
    assembleReview: emptyAssembly,
    scoreProjection: ({ batches }) => ({
      ...passingScore(),
      passed: batches.every((batch) => batch.status === "applied"),
      failures: ["A returned batch envelope was rejected."],
    }),
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.deepEqual(calls, ["structure", "policy_context"]);
  assert.equal(report.scenarios[0].successfulBatchCount, 1);
  assert.equal(report.scenarios[0].batches[0].status, "failed");
  assert.equal(report.scenarios[0].batches[1].status, "applied");
  assert.equal(report.summary.selectedGatePassed, false);
});

test("v3 qualification report allowlists fact IDs and run metadata", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: () => ({
      ...passingScore(),
      factIds: ["workflow.name", "provider.secret_fact"],
    }),
    metadata: {
      ...qualificationMetadata(),
      providerSecret: "must-not-enter-report",
    },
    now: monotonicClock(),
  });
  assert.deepEqual(report.scenarios[0].semanticCapture.factIds, []);
  assert.equal(report.scenarios[0].semanticCapture.resultValid, false);
  assert.doesNotMatch(
    JSON.stringify(report),
    /must-not-enter-report|providerSecret/u,
  );
});

test("v3 qualification rejects hidden retries, zero requests, swapped order, and 2/0 request splits", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  for (const invalidMode of ["hidden_retry", "zero_request"]) {
    const assembledItemCounts = [];
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        if (input.batchId !== "structure" || invalidMode !== "zero_request") {
          input.observeProviderRequest({
            outcome: "success",
            latencyMs: 1,
          });
        }
        if (input.batchId === "structure" && invalidMode === "hidden_retry") {
          input.observeProviderRequest({
            outcome: "success",
            latencyMs: 1,
          });
        }
        return {
          model: templateCopilotV3QualificationBaselineModel,
          batch: batchIdentity(input),
          accepted: [{ privateProviderItem: true }],
          rejected: [],
        };
      },
      assembleReview: ({ items }) => {
        assembledItemCounts.push(items.length);
        return emptyAssembly();
      },
      scoreProjection: ({ batches }) => ({
        ...passingScore(),
        passed: batches.every((batch) => batch.status === "applied"),
        failures: batches.every((batch) => batch.status === "applied")
          ? []
          : ["A provider request-count gate failed."],
      }),
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });
    assert.equal(report.summary.selectedGatePassed, false);
    assert.equal(report.scenarios[0].successfulBatchCount, 1);
    assert.deepEqual(assembledItemCounts, [1]);
  }

  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  report.scenarios[0].batches.reverse();
  assert.equal(summarizeQualification(report).selectedGatePassed, false);
  report.scenarios[0].batches.reverse();
  report.scenarios[0].batches[0].providerRequestCount = 2;
  report.scenarios[0].batches[0].providerRequestSuccessCount = 2;
  report.scenarios[0].batches[1].providerRequestCount = 0;
  report.scenarios[0].batches[1].providerRequestSuccessCount = 0;
  assert.equal(summarizeQualification(report).selectedGatePassed, false);
});

test("v3 qualification accepts semantic completeness without executable completeness", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const semanticOnly = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: () => passingAssembly({ completeItemCount: 0 }),
    scoreProjection: () => ({
      ...passingScore(),
      semanticCompleteItemCount: 5,
      completeItemCount: 0,
    }),
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(semanticOnly.scenarios[0].semanticCapture.resultValid, true);
  assert.equal(semanticOnly.scenarios[0].semanticCapture.passed, true);

  const inverted = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: () => passingAssembly({ completeItemCount: 0 }),
    scoreProjection: () => ({
      ...passingScore(),
      semanticCompleteItemCount: 5,
      completeItemCount: 6,
    }),
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(inverted.scenarios[0].semanticCapture.resultValid, false);
  assert.equal(inverted.scenarios[0].semanticCapture.passed, false);
});

test("v3 qualification rejects malformed and contradictory scorer results", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  for (const scoreProjection of [
    () => ({ passed: true }),
    () => ({
      ...passingScore(),
      passed: true,
      failures: ["Contradictory scorer failure."],
    }),
  ]) {
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: successfulExtractor,
      assembleReview: emptyAssembly,
      scoreProjection,
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });
    assert.equal(report.scenarios[0].semanticCapture.resultValid, false);
    assert.equal(report.scenarios[0].semanticCapture.passed, false);
    assert.equal(report.summary.selectedGatePassed, false);
  }
});

test("v3 qualification safely persists partial scenarios for malformed scorer fields", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const fieldPaths = [
    ["passed"],
    ["failures"],
    ["candidateCount"],
    ["sourceCapturePassed"],
    ["captureFailures"],
    ["governedHolds"],
    ["acceptedProjectionCount"],
    ["blockedSemanticItemCount"],
    ["semanticCompleteItemCount"],
    ["completeItemCount"],
    ["semanticFactCount"],
    ["rawItemCount"],
    ["rawScalarFactCount"],
    ["rawPolicyItemCount"],
    ["distinctFactCount"],
    ["factIds"],
    ["evidenceLeafCount"],
    ["evidenceFailureCount"],
    ["forbiddenHits"],
    ["quarantineHitCount"],
    ["quarantineReasonCounts"],
    ["unsafeQuoteCount"],
    ["defaultOrUnknownExtraCount"],
    ["rejectedProjectionCount"],
    ["conflictCount"],
    ["batchGate"],
    ["batchGate", "passed"],
    ["batchGate", "failures"],
    ["batchGate", "passedBatchCount"],
    ["batchGate", "batchCount"],
    ["batchGate", "batchFailureCount"],
    ["batchGate", "providerRequestFailureCount"],
    ["batchGate", "failureCount"],
    ["batchGate", "expectedBatchIds"],
    ["scenarioSemantics"],
    ["scenarioSemantics", "passed"],
    ["scenarioSemantics", "failures"],
    ["scenarioSemantics", "observed"],
    ["scenarioSemantics", "sourceCapturePassed"],
    ["scenarioSemantics", "captureFailures"],
    ["scenarioSemantics", "governedHolds"],
    ["manifestVersion"],
    ["manifestCorpusFingerprint"],
  ];
  const malformedCases = [
    { label: "undefined result", score: undefined },
    { label: "null result", score: null },
    { label: "array result", score: [] },
    { label: "string result", score: "invalid" },
  ];
  for (const path of fieldPaths) {
    for (const mode of ["missing", "null", "wrong_type"]) {
      malformedCases.push({
        label: `${path.join(".")} ${mode}`,
        score: malformedScorerField(path, mode),
      });
    }
  }

  for (const malformedCase of malformedCases) {
    if (
      malformedCase.score &&
      typeof malformedCase.score === "object" &&
      !Array.isArray(malformedCase.score) &&
      malformedCase.score.batchGate &&
      typeof malformedCase.score.batchGate === "object" &&
      !Array.isArray(malformedCase.score.batchGate) &&
      !malformedCase.label.startsWith("batchGate")
    ) {
      assert.equal(
        malformedCase.score.batchGate.passed,
        true,
        malformedCase.label,
      );
    }
    const persisted = [];
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: successfulExtractor,
      assembleReview: emptyAssembly,
      scoreProjection: () => malformedCase.score,
      metadata: qualificationMetadata(),
      onScenarioComplete: (partialReport) => {
        persisted.push(structuredClone(partialReport));
      },
      now: monotonicClock(),
    });

    assert.equal(persisted.length, 1, malformedCase.label);
    assert.equal(persisted[0].metadata.status, "running", malformedCase.label);
    assert.equal(persisted[0].scenarios.length, 1, malformedCase.label);
    assert.equal(
      persisted[0].scenarios[0].semanticCapture.resultValid,
      false,
      malformedCase.label,
    );
    assert.equal(
      report.scenarios[0].semanticCapture.resultValid,
      false,
      malformedCase.label,
    );
    assert.equal(report.summary.selectedGatePassed, false, malformedCase.label);
  }
});

test("v3 qualification persists an honest running report before the first provider request", async () => {
  const snapshots = [];
  let providerStarted = false;
  await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [templateCopilotQualificationScenarios[0]],
    extractBatch: async (input) => {
      providerStarted = true;
      return successfulExtractor(input);
    },
    assembleReview: emptyAssembly,
    scoreProjection: passingScore,
    metadata: {
      ...qualificationMetadata(),
      sourceEndCheckPassed: false,
    },
    onRunStart: (initialReport) => {
      assert.equal(providerStarted, false);
      snapshots.push(structuredClone(initialReport));
    },
    onScenarioComplete: (partialReport) => {
      snapshots.push(structuredClone(partialReport));
    },
    now: monotonicClock(),
  });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].metadata.status, "running");
  assert.equal(snapshots[0].metadata.sourceEndCheckPassed, false);
  assert.deepEqual(snapshots[0].scenarios, []);
  assert.equal(Object.hasOwn(snapshots[0], "summary"), false);
  assert.equal(snapshots[1].scenarios.length, 1);
});

test("v3 qualification rejects unknown scorer fields and mismatched manifest identity", async () => {
  const mutations = [
    (score) => {
      score.providerSecret = "must-not-enter-report";
    },
    (score) => {
      score.batchGate.providerSecret = "must-not-enter-report";
    },
    (score) => {
      score.scenarioSemantics.providerSecret = "must-not-enter-report";
    },
    (score) => {
      score.quarantineReasonCounts.provider_secret_code = 1;
    },
    (score) => {
      score.manifestVersion = "drifted-manifest";
    },
    (score) => {
      score.manifestCorpusFingerprint = "sha256:drifted-corpus";
    },
  ];
  for (const mutate of mutations) {
    const score = passingScore();
    mutate(score);
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [templateCopilotQualificationScenarios[0]],
      extractBatch: successfulExtractor,
      assembleReview: emptyAssembly,
      scoreProjection: () => score,
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });
    assert.equal(report.scenarios[0].semanticCapture.resultValid, false);
    assert.equal(report.scenarios[0].semanticCapture.passed, false);
    assert.equal(report.summary.selectedGatePassed, false);
    assert.doesNotMatch(
      JSON.stringify(report),
      /must-not-enter-report|providerSecret|provider_secret_code/u,
    );
  }
});

test("v3 formal full gate rejects a vacuous zero-fact scorer pass", async () => {
  const score = passingScore();
  for (const field of [
    "candidateCount",
    "acceptedProjectionCount",
    "blockedSemanticItemCount",
    "semanticCompleteItemCount",
    "completeItemCount",
    "semanticFactCount",
    "rawItemCount",
    "rawScalarFactCount",
    "rawPolicyItemCount",
    "distinctFactCount",
    "evidenceLeafCount",
  ]) {
    score[field] = 0;
  }
  score.factIds = [];
  score.scenarioSemantics.observed = Object.fromEntries(
    templateCopilotV3QualificationObservedMetricKeys.map((key) => [key, 0]),
  );
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: templateCopilotQualificationScenarios,
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: () => score,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(report.summary.scenarioPassCount, 0);
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.fullGatePassed, false);
  assert.ok(
    report.scenarios.every(
      (scenario) =>
        scenario.semanticCapture.resultValid === false &&
        scenario.semanticCapture.passed === false,
    ),
  );
});

test("v3 qualification rejects a silent negative semantic result", async () => {
  const score = passingScore();
  score.passed = false;
  score.scenarioSemantics.passed = false;
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [templateCopilotQualificationScenarios[0]],
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: () => score,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  const semantic = report.scenarios[0].semanticCapture;
  assert.equal(semantic.resultValid, false);
  assert.equal(semantic.passed, false);
  assert.equal(semantic.failureCount, 1);
  assert.deepEqual(semantic.failureFingerprints, []);
  assert.equal(report.summary.selectedGatePassed, false);
});

test("v3 qualification accepts only the synchronized observed-metric allowlist", async () => {
  assert.deepEqual(templateCopilotV3QualificationObservedMetricKeys, [
    "documents",
    "requestFields",
    "approvalNodes",
    "conditionNodes",
    "notificationRules",
    "fyiRecipients",
    "parallelStageCount",
    "factCount",
    "fieldEntityCount",
    "attachmentEntityCount",
    "stageEntityCount",
    "conditionEntityCount",
    "governedSemanticHoldCount",
  ]);
  const scenario = templateCopilotQualificationScenarios[0];
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: () => {
      const score = passingScore();
      score.scenarioSemantics.observed.apiKeyABC123 = "must-not-enter-report";
      return score;
    },
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  const semantic = report.scenarios[0].semanticCapture;
  assert.equal(semantic.resultValid, false);
  assert.equal(semantic.passed, false);
  assert.deepEqual(
    Object.keys(semantic.observed),
    templateCopilotV3QualificationObservedMetricKeys,
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /apiKeyABC123|must-not-enter-report/u,
  );
});

test("v3 qualification detects ending HEAD or status drift", () => {
  const sourceRevision = "a".repeat(40);
  assert.equal(
    templateCopilotV3QualificationSourceStateMatches({
      sourceRevision,
      worktreeStatus: "",
      endingSourceRevision: sourceRevision,
      endingWorktreeStatus: "",
    }),
    true,
  );
  assert.equal(
    templateCopilotV3QualificationSourceStateMatches({
      sourceRevision,
      worktreeStatus: "",
      endingSourceRevision: "b".repeat(40),
      endingWorktreeStatus: "",
    }),
    false,
  );
  assert.equal(
    templateCopilotV3QualificationSourceStateMatches({
      sourceRevision,
      worktreeStatus: "",
      endingSourceRevision: sourceRevision,
      endingWorktreeStatus: " M changed.ts",
    }),
    false,
  );
});

test("v3 qualification allowlists provider and assembler rejection codes", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: [],
        rejected: [{ code: "provider_secret_code" }],
      };
    },
    assembleReview: () => ({
      ...emptyAssembly(),
      review: {
        ...emptyAssembly().review,
        rejections: [{ code: "assembler_secret_code" }],
      },
    }),
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.deepEqual(report.scenarios[0].batches[0].rejectionCodes, {
    unknown: 1,
  });
  assert.deepEqual(report.scenarios[0].projection.rejectionCodes, {
    unknown: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(report),
    /provider_secret_code|assembler_secret_code/u,
  );
});

test("v3 qualification CLI fixes canonical cwd, governed atomic output, and ending Git checks", async () => {
  const cliSource = await readFile(
    new URL(
      "../../scripts/test-template-copilot-v3-live-semantic-qualification.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    cliSource,
    /templateCopilotV3QualificationRepositoryRoot\(import\.meta\.url\)/u,
  );
  assert.match(cliSource, /resolveTemplateCopilotV3QualificationOutput/u);
  assert.match(cliSource, /writeTemplateCopilotV3QualificationReportAtomic/u);
  assert.match(cliSource, /onRunStart: persistReport/u);
  assert.match(
    cliSource,
    /const initialSourceState =\s*readTemplateCopilotV3QualificationGitState/u,
  );
  assert.match(
    cliSource,
    /const endingSourceState =\s*readTemplateCopilotV3QualificationGitState/u,
  );
  assert.match(
    cliSource,
    /template-copilot-v3-live-semantic-qualification-source\.mjs/u,
  );
  assert.match(cliSource, /source_capture=.*CAPTURE_PASS/u);
  assert.match(cliSource, /governed_holds=/u);
  assert.match(cliSource, /executable_draft=BLOCKED/u);
  assert.match(cliSource, /activation=BLOCKED/u);
  assert.match(cliSource, /pilot=BLOCKED/u);
  assert.match(cliSource, /overall=BLOCKED/u);
  assert.match(
    cliSource,
    /if \(!report\.summary\.pilotGate\.passed\)\s*\{\s*process\.exitCode = 1;/u,
  );
  assert.doesNotMatch(cliSource, /semantic(?:_fidelity)?=.*PASS/u);
  assert.doesNotMatch(
    cliSource,
    /function readGit|execFileSync|cwd: process\.cwd\(\)/u,
  );
});

test("v3 full gate requires 24 distinct selected scenario IDs", async () => {
  const duplicateSelection = [
    ...templateCopilotQualificationScenarios.slice(0, 23),
    templateCopilotQualificationScenarios[0],
  ];
  assert.equal(duplicateSelection.length, 24);
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: duplicateSelection,
    extractBatch: successfulExtractor,
    assembleReview: passingAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.semanticCaptureGate.passed, false);
  assert.equal(report.summary.semanticCaptureGate.identityAndLocalePassed, false);
  assert.equal(report.summary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(report.metadata.fullScenarioSetSelected, false);
  assert.equal(report.summary.fullGatePassed, false);
  assert.equal(report.summary.pilotGate.passed, false);
});

async function successfulExtractor(input) {
  input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
  return {
    model: templateCopilotV3QualificationBaselineModel,
    batch: batchIdentity(input),
    accepted: acceptedFixtureBatch(input.batchId),
    rejected: [],
  };
}

function batchIdentity(input) {
  return {
    contractVersion: templateCopilotV3ProviderQuoteContractVersion,
    batchId: input.batchId,
    locale: input.locale,
    sourceSlots: input.sourceSlots.map((source) => source.slot),
  };
}

function emptyAssembly() {
  return {
    envelope: { sourceSpans: [], fragments: [] },
    review: {
      items: [],
      scalarFacts: [],
      policyItems: [],
      conflicts: [],
      rejections: [],
    },
  };
}

function acceptedFixtureBatch(batchId) {
  return Array.from({ length: 8 }, (_, itemIndex) => ({ batchId, itemIndex }));
}

function passingAssembly({
  completeItemCount = 5,
  heldFactId = null,
  heldBlockingReason = null,
} = {}) {
  const itemFactIds = [
    ...templateCopilotV3LiveSemanticScoringContract.itemFactIds,
  ];
  const semanticFactIds = templateCopilotV3QualificationFactIds.filter(
    (factId) => !itemFactIds.includes(factId),
  );
  const items = itemFactIds.map((factId, index) => {
    const held = factId === heldFactId;
    return {
      factId,
      semanticComplete: !held,
      complete: !held && index < completeItemCount,
      fragmentId: null,
      persisted: false,
      executable: false,
      bindings: [{}],
      semanticLeaves:
        held && factId === "workflow.stages"
          ? [{ role: "kind", advisoryHint: "record_update" }]
          : [{}],
      relationships: [],
      ...(held ? { blockingReason: heldBlockingReason } : {}),
    };
  });
  const semanticFacts = semanticFactIds.map((factId, index) => ({
    factId,
    leaves: index < 3 ? [{}] : [],
  }));
  return {
    envelope: { sourceSpans: [], fragments: [] },
    review: {
      items,
      scalarFacts: semanticFacts.slice(0, 8),
      policyItems: semanticFacts.slice(8),
      conflicts: [],
      rejections: [],
    },
  };
}

function safeHoldAssembly({
  factId = "workflow.conditions",
  blockingReason = "compound_predicate_not_executable",
} = {}) {
  return passingAssembly({
    heldFactId: factId,
    heldBlockingReason: blockingReason,
  });
}

test("v3 qualification preserves both governed safe-hold categories", async () => {
  const cases = [
    {
      factId: "workflow.conditions",
      blockingReason: "compound_predicate_not_executable",
    },
    {
      factId: "attachments.requirements",
      blockingReason: "unsupported_semantics_not_executable",
    },
  ];
  for (const entry of cases) {
    const scenario = templateCopilotQualificationScenarios[0];
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: successfulExtractor,
      assembleReview: () => safeHoldAssembly(entry),
      scoreProjection: () => safeHoldScore(entry),
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });
    const semantic = report.scenarios[0].semanticCapture;
    const label = `${entry.factId}:${entry.blockingReason}`;
    assert.equal(semantic.resultValid, true, label);
    assert.equal(semantic.passed, true, label);
    assert.equal(semantic.governedHoldCount, 1, label);
    assert.deepEqual(semantic.governedHolds, [entry], label);
    assert.equal(report.scenarios[0].executableDraft.evaluated, false, label);
    assert.equal(report.scenarios[0].executableDraft.passed, false, label);
    assert.equal(report.summary.semanticCaptureGate.passed, false, label);
    assert.equal(report.summary.selectedGatePassed, false, label);
  }
});

test("v3 qualification rejects missing, forged, and mutated governed-hold inventories", async () => {
  const mutations = [
    {
      label: "missing",
      apply(score) {
        score.governedHolds = [];
        score.scenarioSemantics.governedHolds = [];
      },
    },
    {
      label: "forged",
      apply(score) {
        const forged = {
          factId: "workflow.stages",
          blockingReason: "unsupported_semantics_not_executable",
        };
        score.governedHolds = [forged];
        score.scenarioSemantics.governedHolds = [forged];
      },
    },
    {
      label: "mutated",
      apply(score) {
        score.scenarioSemantics.governedHolds = [{
          factId: "workflow.conditions",
          blockingReason: "unsupported_semantics_not_executable",
        }];
      },
    },
  ];
  for (const mutation of mutations) {
    const score = safeHoldScore();
    mutation.apply(score);
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [templateCopilotQualificationScenarios[0]],
      extractBatch: successfulExtractor,
      assembleReview: safeHoldAssembly,
      scoreProjection: () => score,
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });
    assert.equal(report.scenarios[0].semanticCapture.resultValid, false, mutation.label);
    assert.equal(report.scenarios[0].semanticCapture.passed, false, mutation.label);
    assert.equal(report.summary.semanticCaptureGate.passed, false, mutation.label);
    assert.equal(report.summary.pilotGate.passed, false, mutation.label);
  }
});

test("v3 qualification rejects mismatched blocked-item metrics", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const score = safeHoldScore();
  score.scenarioSemantics.observed.governedSemanticHoldCount = 0;
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: safeHoldAssembly,
    scoreProjection: () => score,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  const semantic = report.scenarios[0].semanticCapture;
  assert.equal(semantic.resultValid, false);
  assert.equal(semantic.passed, false);
  assert.equal(semantic.blockedSemanticItemCount, 1);
  assert.equal(report.summary.selectedGatePassed, false);
});

function passingScore() {
  return {
    passed: true,
    failures: [],
    sourceCapturePassed: true,
    captureFailures: [],
    governedHolds: [],
    candidateCount: 16,
    acceptedProjectionCount: 16,
    blockedSemanticItemCount: 0,
    semanticCompleteItemCount: 5,
    completeItemCount: 5,
    semanticFactCount: 11,
    rawItemCount: 5,
    rawScalarFactCount: 8,
    rawPolicyItemCount: 3,
    distinctFactCount: 16,
    factIds: [...templateCopilotV3QualificationFactIds],
    evidenceLeafCount: 24,
    evidenceFailureCount: 0,
    forbiddenHits: [],
    quarantineHitCount: 0,
    quarantineReasonCounts: {},
    unsafeQuoteCount: 0,
    defaultOrUnknownExtraCount: 0,
    rejectedProjectionCount: 0,
    conflictCount: 0,
    batchGate: {
      passed: true,
      failures: [],
      passedBatchCount: 2,
      batchCount: 2,
      batchFailureCount: 0,
      providerRequestFailureCount: 0,
      failureCount: 0,
      expectedBatchIds: ["structure", "policy_context"],
    },
    scenarioSemantics: {
      passed: true,
      failures: [],
      sourceCapturePassed: true,
      captureFailures: [],
      governedHolds: [],
      observed: {
        documents: 2,
        requestFields: 7,
        approvalNodes: 4,
        conditionNodes: 1,
        notificationRules: 2,
        fyiRecipients: 1,
        parallelStageCount: 1,
        factCount: 16,
        fieldEntityCount: 7,
        attachmentEntityCount: 2,
        stageEntityCount: 4,
        conditionEntityCount: 1,
        governedSemanticHoldCount: 0,
      },
    },
    manifestVersion: templateCopilotV3LiveSemanticScoringContract.manifestVersion,
    manifestCorpusFingerprint:
      templateCopilotV3LiveSemanticScoringContract.manifestCorpusFingerprint,
  };
}

function safeHoldScore({
  factId = "workflow.conditions",
  blockingReason = "compound_predicate_not_executable",
} = {}) {
  const score = passingScore();
  const hold = { factId, blockingReason };
  score.governedHolds = [hold];
  score.acceptedProjectionCount -= 1;
  score.semanticCompleteItemCount -= 1;
  score.completeItemCount -= 1;
  score.evidenceLeafCount -= 2;
  score.blockedSemanticItemCount = 1;
  score.scenarioSemantics.governedHolds = [hold];
  score.scenarioSemantics.observed.governedSemanticHoldCount = 1;
  return score;
}

function malformedScorerField(path, mode) {
  const score = passingScore();
  let target = score;
  for (const segment of path.slice(0, -1)) {
    target = target[segment];
  }
  const field = path[path.length - 1];
  if (mode === "missing") {
    delete target[field];
  } else if (mode === "null") {
    target[field] = null;
  } else {
    target[field] = wrongScorerType(target[field]);
  }
  return score;
}

function wrongScorerType(value) {
  if (Array.isArray(value)) {
    return {};
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (value && typeof value === "object") {
    return [];
  }
  return {};
}

function qualificationMetadata() {
  return {
    model: templateCopilotV3QualificationBaselineModel,
    provider: "openrouter",
    zdrRequired: true,
    reasoningEffort: "none",
    providerRoute: {
      providerCode: "openrouter",
      model: templateCopilotV3QualificationBaselineModel,
      privacyMode: "zdr",
    },
    providerTimeoutMs: 12_000,
    baselineModel: templateCopilotV3QualificationBaselineModel,
    modelMatchesBaseline: true,
    selectionMode: "full",
    sourceRevision: "a".repeat(40),
    sourceWorktreeClean: true,
    comparableCleanSource: true,
    sourceEndCheckPassed: true,
    qualificationMode: "clean_source",
  };
}

function monotonicClock() {
  let milliseconds = 0;
  return () => new Date(milliseconds++);
}
