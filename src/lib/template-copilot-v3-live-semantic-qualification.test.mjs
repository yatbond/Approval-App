import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  assertTemplateCopilotV3QualificationSource,
  qualificationMonotonicRecoveryEvidencePasses,
  qualificationRecoveryCandidateImprovesMonotonically,
  runTemplateCopilotV3LiveSemanticQualification,
  selectTemplateCopilotV3QualificationScenarios,
  summarizeQualification,
  templateCopilotV3QualificationBaselineModel,
  templateCopilotV3QualificationFactIds,
  templateCopilotV3QualificationFixtureFingerprint,
  templateCopilotV3QualificationHardScenarioIds,
  templateCopilotV3QualificationObservedMetricKeys,
  templateCopilotV3QualificationProviderContractMetadata,
  templateCopilotV3QualificationShadowModel,
  templateCopilotV3QualificationSourceStateMatches,
  templateCopilotV3QualificationRunnerVersion,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-runner.mjs";
import { templateCopilotV3SemanticScenarioManifest } from "../../scripts/template-copilot-v3-semantic-scenario-manifests.mjs";
import {
  templateCopilotV3SemanticRoundPlanFingerprint,
  templateCopilotV3SemanticRoundPlanVersion,
} from "../../scripts/template-copilot-v3-semantic-round-plans.mjs";
import { templateCopilotV3ProviderQuoteContractVersion } from "./template-copilot-v3-provider-quotes.ts";
import { templateCopilotV3ProviderPromptVersion } from "./template-copilot-v3-provider-prompt.ts";
import {
  templateCopilotV3IterativeSemanticDiagnosticVersion,
  templateCopilotV3LiveSemanticScoringContract,
} from "../../scripts/template-copilot-v3-live-semantic-scoring.mjs";
import { templateCopilotOpenRouterQualificationRoutingProfile } from "./template-copilot-openrouter-routing.ts";
import { templateCopilotDocumentQuarantineReasons } from "./template-copilot-safety.ts";
import { templateCopilotProviderFailureReasons } from "./template-copilot-provider-request-tracker.ts";

const formalBatchIds = [
  ...templateCopilotV3LiveSemanticScoringContract.expectedBatchIds,
];

test("v3 qualification fingerprints the exact compact provider contract", () => {
  assert.deepEqual(templateCopilotV3QualificationProviderContractMetadata, {
    canonicalContractVersion: 1,
    wireVersion: 3,
    maximumQuoteCodePoints: 8_000,
    transportMaximumUtf8Bytes: 2 * 1024 * 1024,
    chatCompletionTokenParameter: "max_tokens",
    responsesCompletionTokenParameter: "max_output_tokens",
    batches: {
      intake_documents: {
        maximumItems: 22,
        maximumLeavesPerItem: 12,
        maximumCompletionTokens: 3_072,
        schemaUtf8Bytes: 6_362,
        schemaFingerprint:
          "sha256:086059828245771b91722043e32866f1329d0af6a3a27ca1a10d14ed6321b1d9",
      },
      routing_stages_participants: {
        maximumItems: 11,
        maximumLeavesPerItem: 8,
        maximumCompletionTokens: 3_072,
        schemaUtf8Bytes: 6_151,
        schemaFingerprint:
          "sha256:6278888b87472d9fcc1b756332a50de232d8ad1ef241c34b604e7e8e9f084764",
      },
      routing_conditions: {
        maximumItems: 4,
        maximumLeavesPerItem: 10,
        maximumCompletionTokens: 1_536,
        schemaUtf8Bytes: 3_584,
        schemaFingerprint:
          "sha256:5956ac2058d1d9aef783a822a2da66de5bf850c43b0e77284d4a3eb98669337d",
      },
      routing_rejection: {
        maximumItems: 2,
        maximumLeavesPerItem: 1,
        maximumCompletionTokens: 256,
        schemaUtf8Bytes: 539,
        schemaFingerprint:
          "sha256:ef4a9902c2c21946f3e6ac32a35426813ed151e0e3a3c3ca370b0c4f9a91d435",
      },
      policy_context: {
        maximumItems: 17,
        maximumLeavesPerItem: 8,
        maximumCompletionTokens: 4_096,
        schemaUtf8Bytes: 5_626,
        schemaFingerprint:
          "sha256:47f991b0d60f339b6b29a59419f02b5327f2b66fe3498886f97a7663891d5327",
      },
    },
  });
});

test("v3 qualification executes exactly five sequential batches for all 24 multilingual scenarios", async () => {
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
  assert.equal(calls.length, 120);
  for (let index = 0; index < calls.length; index += 5) {
    assert.deepEqual(
      calls.slice(index, index + 5).map((entry) => entry.batchId),
      formalBatchIds,
    );
    assert.equal(calls[index].scenarioId, calls[index + 1].scenarioId);
    assert.equal(calls[index].scenarioId, calls[index + 2].scenarioId);
    assert.equal(calls[index].scenarioId, calls[index + 3].scenarioId);
    assert.equal(calls[index].scenarioId, calls[index + 4].scenarioId);
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
  assert.equal(report.summary.successfulBatchCount, 120);
  assert.equal(report.summary.providerRequestCount, 120);
  assert.equal(
    report.metadata.runnerVersion,
    "template-copilot-v3-live-semantic-qualification.24",
  );
  assert.equal(report.summary.physicalAttemptCount, 120);
  assert.equal(report.summary.physicalProviderRequestCount, 120);
  assert.equal(report.summary.recoveryAttemptCount, 0);
  assert.equal(report.summary.iterativeQualificationGate.passed, false);
  assert.equal(
    report.summary.iterativeQualificationGate.fullCorpusPassed,
    false,
  );
  assert.equal(
    report.summary.iterativeQualificationGate.expectedQuestionCount,
    0,
  );
  assert.equal(
    report.summary.iterativeQualificationGate.askedQuestionCount,
    0,
  );
  assert.ok(
    report.scenarios.every(
      (scenario) =>
        scenario.attempts.length === 5 &&
        scenario.rounds.length === 3 &&
        scenario.iterativeQualification.passed === true,
    ),
  );
  assert.equal(report.summary.expandedAnchorItemCount, 0);
  assert.equal(report.summary.sameLocalClauseRecoveredLeafCount, 0);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.deepEqual(report.summary.languageSummaries[locale], {
      scenarioCount: 8,
      sourceCapturePassCount: 8,
      governedHoldCount: 0,
      executableDraftPassCount: 0,
      successfulBatchCount: 40,
      batchCount: 40,
    });
  }
});

test("v3 qualification reports 24/24 source capture and 64 holds without claiming executable or pilot readiness", () => {
  const scenarios = templateCopilotQualificationScenarios.map((item) => {
    const governedHolds = expectedGovernedHolds(item.id);
    const batches = formalBatchIds.map((batchId) => ({
      batchId,
      status: "applied",
      durationMs: 1,
      providerRequestCount: 1,
      providerRequestSuccessCount: 1,
      providerRequestFailureCount: 0,
      providerOutcome: "success",
      providerFailureReason: null,
      averageProviderRequestLatencyMs: 1,
      providerResponseTelemetry: qualificationProviderTelemetry(),
      acceptedItemCount: 0,
      rejectedItemCount: 0,
      expandedAnchorItemCount: 0,
      sameLocalClauseRecoveredLeafCount: 0,
      rejectionCodes: {},
      rejectionDetails: {},
      failureCount: 0,
    }));
    return {
      id: item.id,
      language: item.language,
      batchCount: 5,
      successfulBatchCount: 5,
      batches,
      projection: { acceptedProviderItemCount: 0 },
      attempts: batches.map((batch) => ({
        round: 1,
        purpose: "provisional",
        ...batch,
      })),
      batchSelections: formalBatchIds.map((batchId) => ({
        batchId,
        selectedRound: 1,
        reasonCode: "provisional_no_recovery",
      })),
      rounds: [
        {
          round: 1,
          kind: "provisional",
          batchIds: formalBatchIds,
          semanticPassed: true,
          capturedContractCount: 16,
          governedHoldCount: governedHolds.length,
        },
        {
          round: 2,
          kind: "audit_and_recovery",
          recoveryBatchIds: [],
          selectedRecoveryBatchIds: [],
          questionIds: [],
          answerDisclosureCount: 0,
        },
        {
          round: 3,
          kind: "final_strict_audit",
          batchIds: formalBatchIds,
          semanticPassed: true,
          capturedContractCount: 16,
          governedHoldCount: governedHolds.length,
        },
      ],
      sourceAuthority: {
        sourceSlotCount: 9,
        quarantine: item.id === "EN-01"
          ? {
              inspectedBlockCount: 2,
              retainedBlockCount: 1,
              quarantinedBlockCount: 1,
              reasonCounts: { instruction_override: 1 },
            }
          : {
              inspectedBlockCount: 0,
              retainedBlockCount: 0,
              quarantinedBlockCount: 0,
              reasonCounts: {},
            },
      },
      semanticCapture: {
        resultValid: true,
        passed: true,
        distinctFactCount: 16,
        governedHoldCount: governedHolds.length,
        governedHolds,
      },
      iterativeQualification: {
        version: "template-copilot-v3-iterative-qualification.3",
        diagnosticVersion:
          templateCopilotV3IterativeSemanticDiagnosticVersion,
        roundPlanVersion: templateCopilotV3SemanticRoundPlanVersion,
        roundPlanFingerprint: templateCopilotV3SemanticRoundPlanFingerprint,
        roundCount: 3,
        passed: true,
        finalStrictPassed: true,
        capturedContractCount: 16,
        governedHoldCount: governedHolds.length,
        gapCount: governedHolds.length,
        recoverFromSourceCount: 0,
        askUserGapCount: 0,
        governedGapCount: governedHolds.length,
        recoveryAttemptCount: 0,
        recoverySuccessCount: 0,
        selectedRecoveryCount: 0,
        recoveredGapCount: 0,
        unresolvedGapCount: 0,
        expectedQuestionCount: 0,
        askedQuestionCount: 0,
        correctQuestionCount: 0,
        knownFactQuestionCount: 0,
        repeatedQuestionCount: 0,
        invalidAskedQuestionCount: 0,
        invalidAnswerDisclosureCount: 0,
        irrelevantQuestionCount: 0,
        missedRequiredQuestionCount: 0,
        prematureAnswerDisclosureCount: 0,
        answerDisclosureCount: 0,
        unsafeAcceptedCount: 0,
        regressionCount: 0,
        recoveryBatchIds: [],
        selectedRecoveryBatchIds: [],
        expectedQuestionIds: [],
        askedQuestionIds: [],
        gapDecisions: [],
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
  assert.equal(summary.iterativeQualificationGate.passed, true);
  assert.equal(summary.iterativeQualificationGate.fullCorpusPassed, true);
  assert.equal(summary.iterativeQualificationGate.expectedQuestionCount, 0);
  assert.equal(summary.iterativeQualificationGate.askedQuestionCount, 0);

  const tamperedMetadata = structuredClone(report);
  tamperedMetadata.metadata.semanticRoundPlanFingerprint =
    `sha256:${"b".repeat(64)}`;
  const tamperedMetadataSummary = summarizeQualification(tamperedMetadata);
  assert.equal(
    tamperedMetadataSummary.semanticCaptureGate.fullCorpusPassed,
    true,
  );
  assert.equal(
    tamperedMetadataSummary.iterativeQualificationGate.fullCorpusPassed,
    false,
  );

  const tamperedScenario = structuredClone(report);
  tamperedScenario.scenarios[0].iterativeQualification.roundPlanFingerprint =
    `sha256:${"c".repeat(64)}`;
  const tamperedScenarioSummary = summarizeQualification(tamperedScenario);
  assert.equal(tamperedScenarioSummary.semanticCaptureGate.passed, true);
  assert.equal(tamperedScenarioSummary.iterativeQualificationGate.passed, false);

  const hiddenRetry = structuredClone(report);
  hiddenRetry.scenarios[0].attempts[0].providerRequestCount = 2;
  hiddenRetry.scenarios[0].attempts[0].providerRequestSuccessCount = 2;
  const hiddenRetrySummary = summarizeQualification(hiddenRetry);
  assert.equal(hiddenRetrySummary.semanticCaptureGate.passed, true);
  assert.equal(hiddenRetrySummary.iterativeQualificationGate.passed, false);

  const missingAuthority = structuredClone(report);
  missingAuthority.scenarios[0].sourceAuthority.sourceSlotCount = 8;
  const missingAuthoritySummary = summarizeQualification(missingAuthority);
  assert.equal(missingAuthoritySummary.semanticCaptureGate.passed, true);
  assert.equal(missingAuthoritySummary.iterativeQualificationGate.passed, false);

  const unaccountedQuarantine = structuredClone(report);
  unaccountedQuarantine.scenarios[0].sourceAuthority.quarantine.reasonCounts = {};
  const unaccountedQuarantineSummary = summarizeQualification(
    unaccountedQuarantine,
  );
  assert.equal(unaccountedQuarantineSummary.semanticCaptureGate.passed, true);
  assert.equal(
    unaccountedQuarantineSummary.iterativeQualificationGate.passed,
    false,
  );

  const forgedRound = structuredClone(report);
  forgedRound.scenarios[0].rounds[1].providerSecret = "must-not-be-accepted";
  const forgedRoundSummary = summarizeQualification(forgedRound);
  assert.equal(forgedRoundSummary.semanticCaptureGate.passed, true);
  assert.equal(forgedRoundSummary.iterativeQualificationGate.passed, false);

  for (const [label, mutate] of [
    [
      "forged selected round",
      (selection) => {
        selection.selectedRound = 2;
      },
    ],
    [
      "forged selection reason",
      (selection) => {
        selection.reasonCode = "recovery_selected_monotonic_improvement";
      },
    ],
    [
      "extra selection field",
      (selection) => {
        selection.providerSecret = "must-not-be-accepted";
      },
    ],
  ]) {
    const forgedSelection = structuredClone(report);
    mutate(forgedSelection.scenarios[0].batchSelections[0]);
    const forgedSelectionSummary = summarizeQualification(forgedSelection);
    assert.equal(
      forgedSelectionSummary.semanticCaptureGate.passed,
      true,
      label,
    );
    assert.equal(
      forgedSelectionSummary.iterativeQualificationGate.passed,
      false,
      label,
    );
  }
  const forgedSelectedAggregate = structuredClone(report);
  forgedSelectedAggregate.scenarios[0].batches[0].durationMs = 2;
  const forgedSelectedAggregateSummary = summarizeQualification(
    forgedSelectedAggregate,
  );
  assert.equal(
    forgedSelectedAggregateSummary.semanticCaptureGate.passed,
    true,
  );
  assert.equal(
    forgedSelectedAggregateSummary.iterativeQualificationGate.passed,
    false,
  );
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
  for (const [field, staleValue] of [
    ["runnerVersion", "template-copilot-v3-live-semantic-qualification.2"],
    ["providerQuoteContractVersion", -1],
    ["providerContract", { wireVersion: -1 }],
    ["providerPromptVersion", "stale-provider-prompt"],
    ["scoringBatchIds", ["structure"]],
    ["fixtureFingerprint", "sha256:stale-fixture"],
  ]) {
    const stale = structuredClone(report);
    stale.metadata[field] = staleValue;
    assert.equal(
      summarizeQualification(stale).semanticCaptureGate.fullCorpusPassed,
      false,
      field,
    );
  }
  for (const chatCompletionTokenParameter of [
    "max_completion_tokens",
    "max_token",
    "",
  ]) {
    const wrongChatTokenParameter = structuredClone(report);
    wrongChatTokenParameter.metadata.providerContract
      .chatCompletionTokenParameter = chatCompletionTokenParameter;
    assert.equal(
      summarizeQualification(wrongChatTokenParameter).semanticCaptureGate
        .fullCorpusPassed,
      false,
      `formal-chat-token-parameter:${chatCompletionTokenParameter}`,
    );
  }
  const staleRoute = structuredClone(report);
  staleRoute.metadata.providerRoute.routingProfile = null;
  assert.equal(
    summarizeQualification(staleRoute).semanticCaptureGate.fullCorpusPassed,
    false,
    "routingProfile",
  );
  for (const [label, mutate] of [
    ["missing telemetry", (batch) => { batch.providerResponseTelemetry = null; }],
    ["wrong returned model", (batch) => { batch.providerResponseTelemetry.returnedModel = "other/model"; }],
    ["excluded provider", (batch) => { batch.providerResponseTelemetry.upstreamProvider = "AkashML"; }],
    ["excluded provider variant", (batch) => { batch.providerResponseTelemetry.upstreamProvider = "Akash ML/fp8"; }],
    ["provider whitespace", (batch) => { batch.providerResponseTelemetry.upstreamProvider = " CoreWeave"; }],
    ["incomplete finish", (batch) => { batch.providerResponseTelemetry.finishState = "length"; }],
    ["missing output usage", (batch) => { batch.providerResponseTelemetry.outputTokens = null; }],
    ["inconsistent total", (batch) => { batch.providerResponseTelemetry.totalTokens += 1; }],
    ["router fallback", (batch) => { batch.providerResponseTelemetry.routerAttemptCount = 2; }],
    ["timeout boundary", (batch) => { batch.providerResponseTelemetry.providerLatencyMs = 18_000; batch.averageProviderRequestLatencyMs = 18_000; }],
    ["latency mismatch", (batch) => { batch.averageProviderRequestLatencyMs += 1; }],
  ]) {
    const invalidTelemetry = structuredClone(report);
    mutate(invalidTelemetry.scenarios[0].batches[0]);
    assert.equal(
      summarizeQualification(invalidTelemetry).semanticCaptureGate
        .fullCorpusPassed,
      false,
      label,
    );
  }
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
        accepted: acceptedFixtureBatch(input.batchId),
        rejected: [],
      };
    },
    assembleReview: passingAssembly,
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
      "EN-01:visibility_notifications",
      "EN-01:conditions_exceptions",
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

test("v3 qualification isolates a failed batch, continues later batches, and stores no provider error", async () => {
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
      if (input.batchId === formalBatchIds[0]) {
        input.observeProviderRequest({
          outcome: "timeout",
          latencyMs: 18_000,
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

  assert.deepEqual(calls, [...formalBatchIds, formalBatchIds[0]]);
  assert.equal(report.scenarios[0].attempts.length, 6);
  assert.deepEqual(
    report.scenarios[0].iterativeQualification.recoveryBatchIds,
    [formalBatchIds[0]],
  );
  assert.equal(
    report.scenarios[0].iterativeQualification.askedQuestionCount,
    0,
  );
  assert.equal(report.scenarios[0].successfulBatchCount, 4);
  assert.equal(report.scenarios[0].batches[0].providerOutcome, "timeout");
  assert.equal(
    report.scenarios[0].batches[0].providerFailureReason,
    null,
  );
  assert.equal(report.scenarios[0].batches[1].status, "applied");
  assert.equal(report.scenarios[0].batches[2].status, "applied");
  assert.equal(report.scenarios[0].batches[3].status, "applied");
  assert.equal(report.scenarios[0].batches[4].status, "applied");
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.providerRequestCount, 5);
  assert.equal(report.summary.providerRequestFailureCount, 1);
  assert.equal(report.summary.physicalProviderRequestCount, 6);
  assert.equal(report.summary.physicalProviderRequestFailureCount, 2);
  assert.equal(report.scenarios[0].batches[0].expandedAnchorItemCount, 0);
  assert.equal(
    report.scenarios[0].batches[0].sameLocalClauseRecoveredLeafCount,
    0,
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /TOP SECRET|raw output|user text/u,
  );
});

test("v3 qualification recovers one failed known-source batch without asking the user", async () => {
  const scenario = templateCopilotQualificationScenarios.find(
    (item) => item.id === "EN-07",
  );
  assert.ok(scenario);
  const calls = [];
  const scoredBatchSets = [];
  let intakeAttemptCount = 0;
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      calls.push(input.batchId);
      if (
        input.batchId === formalBatchIds[0] &&
        ++intakeAttemptCount === 1
      ) {
        input.observeProviderRequest({ outcome: "timeout", latencyMs: 18_000 });
        throw new Error("PRIVATE FIRST-ATTEMPT FAILURE");
      }
      input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: acceptedFixtureBatch(input.batchId),
        rejected: [],
      };
    },
    assembleReview: passingAssembly,
    scoreProjection: ({ batches }) => {
      scoredBatchSets.push(batches.map((batch) => batch.batchId));
      const score = passingScore();
      const failed = batches.filter((batch) => batch.status !== "applied");
      if (failed.length === 0) return score;
      const failures = ["A required provider batch failed."];
      return {
        ...score,
        passed: false,
        failures,
        sourceCapturePassed: false,
        captureFailures: failures,
        batchGate: {
          ...score.batchGate,
          passed: false,
          failures,
          passedBatchCount: batches.length - failed.length,
          batchFailureCount: failed.length,
          providerRequestFailureCount: failed.length,
          failureCount: failed.length,
        },
        scenarioSemantics: {
          ...score.scenarioSemantics,
          passed: false,
          failures,
          sourceCapturePassed: false,
          captureFailures: failures,
        },
      };
    },
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.deepEqual(calls, [...formalBatchIds, formalBatchIds[0]]);
  assert.deepEqual(scoredBatchSets, [formalBatchIds, formalBatchIds]);
  assert.equal(report.scenarios[0].attempts.length, 6);
  assert.equal(report.scenarios[0].batches.length, 5);
  assert.ok(
    report.scenarios[0].batches.every((batch) => batch.status === "applied"),
  );
  assert.deepEqual(
    report.scenarios[0].iterativeQualification.recoveryBatchIds,
    [formalBatchIds[0]],
  );
  assert.equal(report.scenarios[0].iterativeQualification.askedQuestionCount, 0);
  assert.equal(report.scenarios[0].iterativeQualification.unresolvedGapCount, 0);
  assert.equal(report.scenarios[0].iterativeQualification.passed, true);
  assert.deepEqual(
    report.scenarios[0].iterativeQualification.selectedRecoveryBatchIds,
    [formalBatchIds[0]],
  );
  assert.equal(
    report.scenarios[0].iterativeQualification.selectedRecoveryCount,
    1,
  );
  assert.deepEqual(report.scenarios[0].batchSelections[0], {
    batchId: formalBatchIds[0],
    selectedRound: 2,
    reasonCode: "recovery_selected_monotonic_improvement",
  });
  assert.equal(report.scenarios[0].semanticCapture.passed, true);
  assert.equal(
    qualificationMonotonicRecoveryEvidencePasses(report.scenarios[0]),
    true,
  );
  const coordinatedForgery = structuredClone(report.scenarios[0]);
  coordinatedForgery.batchSelections[0] = {
    batchId: formalBatchIds[0],
    selectedRound: 1,
    reasonCode: "provisional_retained_non_monotonic_recovery",
  };
  coordinatedForgery.iterativeQualification.selectedRecoveryBatchIds = [];
  coordinatedForgery.iterativeQualification.selectedRecoveryCount = 0;
  coordinatedForgery.rounds[1].selectedRecoveryBatchIds = [];
  const forgedProvisionalAggregate = Object.fromEntries(
    Object.entries(coordinatedForgery.attempts[0]).filter(
      ([key]) => !["round", "purpose"].includes(key),
    ),
  );
  coordinatedForgery.batches[0] = forgedProvisionalAggregate;
  assert.equal(
    qualificationMonotonicRecoveryEvidencePasses(coordinatedForgery),
    false,
  );
  assert.equal(report.summary.iterativeQualificationGate.passed, false);
  assert.equal(report.summary.physicalProviderRequestCount, 6);
  assert.equal(report.summary.physicalProviderRequestSuccessCount, 5);
  assert.equal(report.summary.physicalProviderRequestFailureCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE FIRST-ATTEMPT FAILURE/u);
});

test("v3 recovery selection rejects failed, regressive, hold-losing, and unsafe trials", () => {
  const evaluation = ({
    factIds = [...templateCopilotV3QualificationFactIds],
    governedHolds = [],
    batchStatus = "applied",
    failureCount = 1,
    evidenceFailureCount = 0,
    unsafeQuoteCount = 0,
    semanticCompleteItemCount = 5,
    completeItemCount = 5,
    evidenceLeafCount = 20,
    conflictCount = 0,
    quarantineHitCount = 0,
    quarantineReasonCounts = {},
  } = {}) => ({
    batches: formalBatchIds.map((batchId) => ({
      batchId,
      status: batchId === formalBatchIds[0] ? batchStatus : "applied",
    })),
    semanticCapture: {
      resultValid: true,
      passed: false,
      failureCount,
      failureFingerprints: Array.from({ length: failureCount }, (_, index) =>
        qualificationFailureFingerprint(`closed-failure-${index}`),
      ),
      evidenceFailureCount,
      forbiddenHitCount: 0,
      quarantineHitCount,
      unsafeQuoteCount,
      defaultOrUnknownExtraCount: 0,
      rejectedProjectionCount: 0,
      conflictCount,
      candidateCount: 16,
      acceptedProjectionCount: semanticCompleteItemCount + 11,
      governedHoldCount: governedHolds.length,
      blockedSemanticItemCount: governedHolds.length,
      semanticCompleteItemCount,
      completeItemCount,
      semanticFactCount: 11,
      rawItemCount: 5,
      rawScalarFactCount: 8,
      rawPolicyItemCount: 3,
      distinctFactCount: factIds.length,
      evidenceLeafCount,
      forbiddenHitFingerprints: [],
      factIds: [...factIds].sort(),
      governedHolds: [...governedHolds].sort((left, right) =>
        `${left.factId}:${left.blockingReason}`.localeCompare(
          `${right.factId}:${right.blockingReason}`,
          "en",
        ),
      ),
      blockerCodes: [
        ...new Set(governedHolds.map((entry) => entry.blockingReason)),
      ].sort(),
      quarantineReasonCounts,
      observed: Object.fromEntries(
        templateCopilotV3QualificationObservedMetricKeys.map((key) => [
          key,
          key === "factCount"
            ? factIds.length
            : key === "governedSemanticHoldCount"
              ? governedHolds.length
              : 1,
        ]),
      ),
    },
    projection: {
      status: "assembled",
      acceptedProviderItemCount: 16,
      reviewItemCount: 16,
      openFragmentCount: 1,
      conflictCount,
      rejectionCount: 0,
      rejectionCodes: {},
      rejectionDetails: {},
    },
  });
  const missingCondition = templateCopilotV3QualificationFactIds.filter(
    (factId) => factId !== "workflow.conditions",
  );
  const current = evaluation({ factIds: missingCondition, failureCount: 2 });

  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      current,
      evaluation({ factIds: missingCondition, batchStatus: "failed" }),
      formalBatchIds[0],
    ),
    false,
  );
  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      current,
      evaluation({
        factIds: templateCopilotV3QualificationFactIds.filter(
          (factId) => factId !== "attachments.requirements",
        ),
      }),
      formalBatchIds[0],
    ),
    false,
  );
  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      evaluation({
        factIds: missingCondition,
        governedHolds: [
          {
            factId: "workflow.conditions",
            blockingReason: "unsupported_semantics_not_executable",
          },
        ],
      }),
      evaluation(),
      formalBatchIds[0],
    ),
    false,
  );
  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      current,
      evaluation({ unsafeQuoteCount: 1 }),
      formalBatchIds[0],
    ),
    false,
  );
  for (const [label, candidate] of [
    ["complete item loss", evaluation({ completeItemCount: 4 })],
    ["evidence loss", evaluation({ evidenceLeafCount: 19 })],
    ["new conflict", evaluation({ conflictCount: 1 })],
    [
      "changed quarantine authority",
      evaluation({
        quarantineHitCount: 1,
        quarantineReasonCounts: {
          [templateCopilotDocumentQuarantineReasons[0]]: 1,
        },
      }),
    ],
  ]) {
    assert.equal(
      qualificationRecoveryCandidateImprovesMonotonically(
        current,
        candidate,
        formalBatchIds[0],
      ),
      false,
      label,
    );
  }
  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      current,
      evaluation({ factIds: missingCondition, failureCount: 2 }),
      formalBatchIds[0],
    ),
    false,
    "an equal candidate has no strict improvement witness",
  );
  assert.equal(
    qualificationRecoveryCandidateImprovesMonotonically(
      current,
      evaluation({ failureCount: 1 }),
      formalBatchIds[0],
    ),
    true,
  );
});

test("v3 qualification retains a successful provisional batch after failed or regressive recovery", async () => {
  const scenario = templateCopilotQualificationScenarios.find(
    (item) => item.id === "EN-03",
  );
  assert.ok(scenario);
  for (const recoveryMode of ["failed", "regressive"]) {
    let evaluationCount = 0;
    let conditionAttemptCount = 0;
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        if (
          input.batchId === "routing_conditions" &&
          ++conditionAttemptCount === 2 &&
          recoveryMode === "failed"
        ) {
          input.observeProviderRequest({ outcome: "timeout", latencyMs: 18_000 });
          throw new Error("PRIVATE RECOVERY FAILURE");
        }
        input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
        return {
          model: templateCopilotV3QualificationBaselineModel,
          batch: batchIdentity(input),
          accepted: acceptedFixtureBatch(input.batchId),
          rejected: [],
        };
      },
      assembleReview: () => {
        evaluationCount += 1;
        return assemblyWithoutItemFact(
          evaluationCount === 1 || recoveryMode === "failed"
            ? "workflow.conditions"
            : "attachments.requirements",
        );
      },
      scoreProjection: ({ projection, batches }) =>
        scoreForMissingItemFact(
          templateCopilotV3QualificationFactIds.find(
            (factId) =>
              templateCopilotV3LiveSemanticScoringContract.itemFactIds.includes(
                factId,
              ) &&
              !projection.items.some((entry) => entry.factId === factId),
          ),
          batches,
        ),
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });

    const result = report.scenarios[0];
    assert.deepEqual(result.iterativeQualification.recoveryBatchIds, [
      "routing_conditions",
    ]);
    assert.deepEqual(result.iterativeQualification.selectedRecoveryBatchIds, []);
    assert.equal(result.iterativeQualification.selectedRecoveryCount, 0);
    assert.equal(result.semanticCapture.factIds.includes("workflow.conditions"), false);
    assert.equal(
      result.semanticCapture.factIds.includes("attachments.requirements"),
      true,
    );
    assert.deepEqual(
      result.batchSelections.find(
        (selection) => selection.batchId === "routing_conditions",
      ),
      {
        batchId: "routing_conditions",
        selectedRound: 1,
        reasonCode:
          recoveryMode === "failed"
            ? "provisional_retained_failed_recovery"
            : "provisional_retained_non_monotonic_recovery",
      },
    );
    assert.equal(
      result.batches.find((batch) => batch.batchId === "routing_conditions")
        .status,
      "applied",
    );
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE RECOVERY FAILURE/u);
  }
});

test("v3 qualification reports each closed provider transport subtype without provider-private detail", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  for (const providerFailureReason of templateCopilotProviderFailureReasons) {
    const secret = `PRIVATE-${providerFailureReason}-MESSAGE`;
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        if (input.batchId === formalBatchIds[0]) {
          input.observeProviderRequest({
            outcome: "malformed_output",
            latencyMs: 9,
            providerFailureReason,
            rawOutput: secret,
          });
          throw Object.assign(new Error(secret), {
            reasonCode: providerFailureReason,
            content: secret,
            output: secret,
            issuePaths: [secret],
          });
        }
        input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
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

    assert.equal(
      report.scenarios[0].batches[0].providerFailureReason,
      providerFailureReason,
    );
    assert.equal(
      report.scenarios[0].batches[0].providerOutcome,
      "malformed_output",
    );
    assert.doesNotMatch(JSON.stringify(report), new RegExp(secret, "u"));
  }
  assert.doesNotMatch(
    JSON.stringify(
      await runTemplateCopilotV3LiveSemanticQualification({
        corpus: templateCopilotQualificationScenarios,
        scenarios: [scenario],
        extractBatch: async (input) => {
          input.observeProviderRequest({
            outcome: "malformed_output",
            latencyMs: 1,
            providerFailureReason: "FORGED-PRIVATE-FAILURE-DETAIL",
          });
          throw Object.assign(new Error("FORGED-PRIVATE-ERROR-MESSAGE"), {
            issuePaths: ["FORGED-PRIVATE-ISSUE-PATH"],
            rawOutput: "FORGED-PRIVATE-RAW-OUTPUT",
          });
        },
        assembleReview: emptyAssembly,
        scoreProjection: passingScore,
        metadata: qualificationMetadata(),
        now: monotonicClock(),
      }),
    ),
    /FORGED-PRIVATE/u,
  );
});

test("v3 qualification nulls provider transport subtypes for non-transport outcomes and forged historical reports", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  for (const outcome of [
    "timeout",
    "outage",
    "privacy_route_rejected",
    "success",
  ]) {
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        input.observeProviderRequest({
          outcome,
          latencyMs: 1,
          providerFailureReason: "invalid_json",
        });
        if (outcome !== "success") throw new Error(`failure-${outcome}`);
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
    assert.equal(
      report.scenarios[0].batches[0].providerFailureReason,
      null,
      outcome,
    );
  }

  const current = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: successfulExtractor,
    assembleReview: emptyAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.equal(summarizeQualification(current).strictBatchScenarioCount, 1);

  const historical = structuredClone(current);
  delete historical.scenarios[0].batches[0].providerFailureReason;
  assert.equal(summarizeQualification(historical).strictBatchScenarioCount, 0);

  const forged = structuredClone(current);
  forged.scenarios[0].batches[0].providerFailureReason =
    "FORGED-PRIVATE-HISTORICAL-REASON";
  const forgedSummary = summarizeQualification(forged);
  assert.equal(forgedSummary.strictBatchScenarioCount, 0);
  assert.doesNotMatch(
    JSON.stringify(forgedSummary),
    /FORGED-PRIVATE-HISTORICAL-REASON/u,
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
  assert.equal(report.summary.successfulBatchCount, 30);
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

  report.metadata.providerTimeoutMs = 18_000;
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
  assert.match(cliSource, /providerTimeoutMs !== 18_000/u);
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
          locale: input.batchId === formalBatchIds[0] ? "zh-Hant" : input.locale,
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
  assert.deepEqual(calls, [...formalBatchIds, formalBatchIds[0]]);
  assert.equal(report.scenarios[0].successfulBatchCount, 4);
  assert.equal(report.scenarios[0].batches[0].status, "failed");
  assert.equal(report.scenarios[0].batches[1].status, "applied");
  assert.equal(report.scenarios[0].batches[2].status, "applied");
  assert.equal(report.scenarios[0].batches[3].status, "applied");
  assert.equal(report.scenarios[0].batches[4].status, "applied");
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

test("v3 qualification stores only sanitized provider routing telemetry", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      input.observeProviderRequest({
        outcome: "success",
        latencyMs: 999,
        responseTelemetry: {
          requestedModel: templateCopilotV3QualificationBaselineModel,
          returnedModel: templateCopilotV3QualificationBaselineModel,
          upstreamProvider: "CoreWeave",
          finishState: "stop",
          inputTokens: 1_000,
          outputTokens: 200,
          totalTokens: 1_200,
          routerAttemptCount: 1,
          providerLatencyMs: 321,
          rawResponseId: "MUST_NOT_ENTER_REPORT",
        },
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
    report.scenarios[0].batches[0].providerResponseTelemetry,
    {
      requestedModel: templateCopilotV3QualificationBaselineModel,
      returnedModel: templateCopilotV3QualificationBaselineModel,
      upstreamProvider: "CoreWeave",
      finishState: "stop",
      inputTokens: 1_000,
      outputTokens: 200,
      totalTokens: 1_200,
      routerAttemptCount: 1,
      providerLatencyMs: 321,
    },
  );
  assert.doesNotMatch(JSON.stringify(report), /MUST_NOT_ENTER_REPORT/u);
});

test("v3 qualification reports only sanitized local-clause recovery counters", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [scenario],
    extractBatch: async (input) => {
      input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: batchIdentity(input),
        accepted: input.batchId === "intake_documents"
          ? [
              {
                anchorExpanded: true,
                sameLocalClauseRecoveredLeafCount: 1,
                leaves: [{ sameLocalClauseRecovered: true }],
                privateQuote: "RECOVERY SECRET ONE",
              },
              {
                anchorExpanded: true,
                sameLocalClauseRecoveredLeafCount: 2,
                leaves: [
                  { sameLocalClauseRecovered: true },
                  { sameLocalClauseRecovered: true },
                ],
                privateQuote: "RECOVERY SECRET TWO",
              },
              {
                anchorExpanded: false,
                sameLocalClauseRecoveredLeafCount: 0,
                leaves: [{ sameLocalClauseRecovered: false }],
              },
            ]
          : [],
        rejected: [],
      };
    },
    assembleReview: emptyAssembly,
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.equal(report.scenarios[0].batches[0].expandedAnchorItemCount, 2);
  assert.equal(
    report.scenarios[0].batches[0].sameLocalClauseRecoveredLeafCount,
    3,
  );
  assert.equal(report.summary.expandedAnchorItemCount, 2);
  assert.equal(report.summary.sameLocalClauseRecoveredLeafCount, 3);
  assert.doesNotMatch(JSON.stringify(report), /RECOVERY SECRET|privateQuote/u);

  const historical = structuredClone(report);
  for (const batch of historical.scenarios[0].batches) {
    delete batch.expandedAnchorItemCount;
    delete batch.sameLocalClauseRecoveredLeafCount;
  }
  const historicalSummary = summarizeQualification(historical);
  assert.equal(historicalSummary.expandedAnchorItemCount, 0);
  assert.equal(historicalSummary.sameLocalClauseRecoveredLeafCount, 0);
  assert.equal(historicalSummary.semanticCaptureGate.passed, false);

  const forgedAcceptedCount = structuredClone(report);
  forgedAcceptedCount.scenarios[0].batches[0].acceptedItemCount += 1;
  assert.equal(
    summarizeQualification(forgedAcceptedCount).semanticCaptureGate.passed,
    false,
  );
});

test("v3 qualification fails closed on malformed accepted-item recovery provenance", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  const invalidAcceptedItems = [
    {
      sameLocalClauseRecoveredLeafCount: 0,
      leaves: [],
    },
    {
      anchorExpanded: "false",
      sameLocalClauseRecoveredLeafCount: 0,
      leaves: [],
    },
    {
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [{}],
    },
    {
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 3,
      leaves: [
        { sameLocalClauseRecovered: true },
        { sameLocalClauseRecovered: true },
        { sameLocalClauseRecovered: true },
      ],
    },
    {
      anchorExpanded: true,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [{ sameLocalClauseRecovered: false }],
    },
    {
      anchorExpanded: false,
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [{ sameLocalClauseRecovered: true }],
    },
  ];
  for (const invalidAccepted of invalidAcceptedItems) {
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
        return {
          model: templateCopilotV3QualificationBaselineModel,
          batch: batchIdentity(input),
          accepted: input.batchId === "intake_documents"
            ? [{ ...invalidAccepted, privateQuote: "MALFORMED SECRET" }]
            : [],
          rejected: [],
        };
      },
      assembleReview: emptyAssembly,
      scoreProjection: passingScore,
      metadata: qualificationMetadata(),
      now: monotonicClock(),
    });

    assert.equal(report.scenarios[0].batches[0].status, "failed");
    assert.equal(report.scenarios[0].batches[1].status, "applied");
    assert.equal(report.scenarios[0].batches[2].status, "applied");
    assert.equal(report.scenarios[0].batches[3].status, "applied");
    assert.equal(report.scenarios[0].batches[4].status, "applied");
    assert.equal(report.scenarios[0].successfulBatchCount, 4);
    assert.equal(report.summary.selectedGatePassed, false);
    assert.doesNotMatch(JSON.stringify(report), /MALFORMED SECRET|privateQuote/u);
  }
});

test("v3 qualification rejects hidden retries, zero requests, swapped order, and 2/0 request splits", async () => {
  const scenario = templateCopilotQualificationScenarios[0];
  for (const invalidMode of ["hidden_retry", "zero_request"]) {
    const assembledItemCounts = [];
    const report = await runTemplateCopilotV3LiveSemanticQualification({
      corpus: templateCopilotQualificationScenarios,
      scenarios: [scenario],
      extractBatch: async (input) => {
        if (
          input.batchId !== "intake_documents" ||
          invalidMode !== "zero_request"
        ) {
          input.observeProviderRequest({
            outcome: "success",
            latencyMs: 1,
          });
        }
        if (
          input.batchId === "intake_documents" &&
          invalidMode === "hidden_retry"
        ) {
          input.observeProviderRequest({
            outcome: "success",
            latencyMs: 1,
          });
        }
        return {
          model: templateCopilotV3QualificationBaselineModel,
          batch: batchIdentity(input),
          accepted: [{
            privateProviderItem: true,
            anchorExpanded: false,
            sameLocalClauseRecoveredLeafCount: 0,
            leaves: [],
          }],
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
    assert.equal(report.scenarios[0].successfulBatchCount, 4);
    assert.deepEqual(assembledItemCounts, [4, 4]);
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

test("v3 qualification reports scorer capture failures without recounting scenario failures", async () => {
  const rootFailure = "root capture failure";
  const scenarioFailure = "scenario capture failure already included at root";
  const score = passingScore();
  score.passed = false;
  score.failures = [rootFailure, scenarioFailure];
  score.sourceCapturePassed = false;
  score.captureFailures = [rootFailure, scenarioFailure];
  score.scenarioSemantics.passed = false;
  score.scenarioSemantics.failures = [scenarioFailure];
  score.scenarioSemantics.sourceCapturePassed = false;
  score.scenarioSemantics.captureFailures = [scenarioFailure];

  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [templateCopilotQualificationScenarios[0]],
    extractBatch: successfulExtractor,
    assembleReview: passingAssembly,
    scoreProjection: () => score,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  const semantic = report.scenarios[0].semanticCapture;
  assert.equal(semantic.resultValid, true);
  assert.equal(semantic.passed, false);
  assert.equal(semantic.failureCount, 2);
  assert.deepEqual(
    semantic.failureFingerprints,
    [rootFailure, scenarioFailure]
      .map(qualificationFailureFingerprint)
      .sort(),
  );
});

test("v3 qualification fails closed when scenario failures are absent from scorer failures", async () => {
  const rootFailure = "root-only capture failure";
  const scenarioFailure = "uncontained scenario capture failure";
  const score = passingScore();
  score.passed = false;
  score.failures = [rootFailure];
  score.sourceCapturePassed = false;
  score.captureFailures = [rootFailure];
  score.scenarioSemantics.passed = false;
  score.scenarioSemantics.failures = [scenarioFailure];
  score.scenarioSemantics.sourceCapturePassed = false;
  score.scenarioSemantics.captureFailures = [scenarioFailure];

  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: [templateCopilotQualificationScenarios[0]],
    extractBatch: successfulExtractor,
    assembleReview: passingAssembly,
    scoreProjection: () => score,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  const semantic = report.scenarios[0].semanticCapture;
  assert.equal(semantic.resultValid, false);
  assert.equal(semantic.passed, false);
  assert.equal(semantic.failureCount, 2);
  assert.deepEqual(semantic.failureFingerprints, [
    qualificationFailureFingerprint(rootFailure),
  ]);
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
    "notificationEntityCount",
    "fyiEntityCount",
    "expectedEntityCount",
    "matchedEntityCount",
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
        rejected: [
          {
            code: "leaf_not_found",
            detail:
              "condition:operator:canonical_equality_symbol:equality_hint:absent_from_authorized_slot",
          },
          {
            code: "item_schema_invalid",
            detail: "workflow_name:whole_slot_quote",
          },
          {
            code: "provider_secret_code",
            detail: "provider_secret_detail",
          },
        ],
      };
    },
    assembleReview: () => ({
      ...emptyAssembly(),
      review: {
        ...emptyAssembly().review,
        rejections: [
          {
            code: "unverifiable_leaf",
            detail: "attachment:required",
          },
          {
            code: "assembler_secret_code",
            detail: "assembler_secret_detail",
          },
        ],
      },
    }),
    scoreProjection: passingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });
  assert.deepEqual(report.scenarios[0].batches[0].rejectionCodes, {
    leaf_not_found: 1,
    item_schema_invalid: 1,
    unknown: 1,
  });
  assert.deepEqual(report.scenarios[0].batches[0].rejectionDetails, {
    "condition:operator:canonical_equality_symbol:equality_hint:absent_from_authorized_slot": 1,
    "workflow_name:whole_slot_quote": 1,
    unknown: 1,
  });
  assert.deepEqual(report.scenarios[0].projection.rejectionCodes, {
    unverifiable_leaf: 1,
    unknown: 1,
  });
  assert.deepEqual(report.scenarios[0].projection.rejectionDetails, {
    "attachment:required": 1,
    unknown: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(report),
    /provider_secret_code|provider_secret_detail|assembler_secret_code|assembler_secret_detail/u,
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
  assert.match(cliSource, /QUALIFICATION_SHADOW_MODEL/u);
  assert.match(cliSource, /templateCopilotV3QualificationShadowModel/u);
  assert.match(
    cliSource,
    /shadowModelRequested && !requestedOutputDirectory/u,
  );
  assert.match(cliSource, /qualificationMode: shadowModelRequested/u);
  assert.match(cliSource, /"shadow_exploratory"/u);
  assert.match(cliSource, /modelMatchesBaseline: !shadowModelRequested/u);
  assert.match(
    cliSource,
    /templateCopilotV3OpenRouterChatCompletionTokenParameter\(model\)/u,
  );
  assert.match(cliSource, /providerContract,/u);
  assert.match(cliSource, /selectionMode: `\$\{shadowModelRequested/u);
  assert.match(
    cliSource,
    /shadowModelRequested &&[\s\S]*report\.summary\.fullGatePassed[\s\S]*report\.summary\.selectedGatePassed[\s\S]*report\.summary\.pilotGate\.passed/u,
  );
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

test("GPT-5.6 Sol shadow evidence remains excluded from formal and pilot gates", async () => {
  const shadowModel = templateCopilotV3QualificationShadowModel;
  const metadata = qualificationMetadata();
  metadata.model = shadowModel;
  metadata.providerRoute.model = shadowModel;
  metadata.modelMatchesBaseline = false;
  metadata.qualificationMode = "shadow_exploratory";
  metadata.selectionMode = "shadow_full";
  metadata.providerContract = {
    ...metadata.providerContract,
    chatCompletionTokenParameter: "max_completion_tokens",
  };
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: templateCopilotQualificationScenarios,
    extractBatch: async (input) => {
      input.observeProviderRequest({
        outcome: "success",
        latencyMs: 1,
        responseTelemetry: qualificationProviderTelemetry({
          requestedModel: shadowModel,
          returnedModel: shadowModel,
          upstreamProvider: "Azure",
        }),
      });
      return {
        model: shadowModel,
        batch: batchIdentity(input),
        accepted: acceptedFixtureBatch(input.batchId),
        rejected: [],
      };
    },
    assembleReview: passingAssembly,
    scoreProjection: passingScore,
    metadata,
    now: monotonicClock(),
  });

  assert.equal(report.metadata.model, shadowModel);
  assert.equal(
    report.metadata.baselineModel,
    templateCopilotV3QualificationBaselineModel,
  );
  assert.equal(report.metadata.modelMatchesBaseline, false);
  assert.equal(report.metadata.qualificationMode, "shadow_exploratory");
  assert.equal(report.metadata.selectionMode, "shadow_full");
  assert.equal(
    report.metadata.providerContract.chatCompletionTokenParameter,
    "max_completion_tokens",
  );
  assert.equal(report.summary.successfulBatchCount, 120);
  assert.equal(report.summary.strictBatchScenarioCount, 24);
  assert.equal(report.summary.passed, false);
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.fullGatePassed, false);
  assert.equal(report.summary.semanticCaptureGate.fullCorpusPassed, false);
  assert.equal(report.summary.pilotGate.passed, false);

  const crossModelTelemetry = structuredClone(report);
  crossModelTelemetry.scenarios[0].batches[0]
    .providerResponseTelemetry.returnedModel =
      templateCopilotV3QualificationBaselineModel;
  const crossModelSummary = summarizeQualification(crossModelTelemetry);
  assert.equal(crossModelSummary.strictBatchScenarioCount, 23);
  assert.equal(crossModelSummary.semanticCaptureGate.passed, false);
});

test("qualification CLI model policy fails closed before making a provider request", () => {
  const script = new URL(
    "../../scripts/test-template-copilot-v3-live-semantic-qualification.mjs",
    import.meta.url,
  );
  const cases = [
    {
      label: "Qwen cannot be mislabeled as shadow",
      model: templateCopilotV3QualificationBaselineModel,
      shadowFlag: "true",
      expected: /Qwen baseline cannot be labeled as shadow/u,
    },
    {
      label: "unknown baseline model",
      model: "unknown/model",
      shadowFlag: "false",
      expected: /requires the Qwen baseline model/u,
    },
    {
      label: "unknown shadow model",
      model: "openai/gpt-5.6-unknown",
      shadowFlag: "true",
      expected: /explicit GPT-5\.6 Sol shadow run requires model openai\/gpt-5\.6-sol/u,
    },
    {
      label: "unknown shadow flag",
      model: templateCopilotV3QualificationBaselineModel,
      shadowFlag: "TRUE",
      expected: /must be exactly true or false/u,
    },
  ];
  for (const modelCase of cases) {
    const child = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        fileURLToPath(script),
      ],
      {
        encoding: "utf8",
        timeout: 20_000,
        env: {
          ...process.env,
          QUALIFICATION_ALLOW_DIRTY_SOURCE: "true",
          QUALIFICATION_SHADOW_MODEL: modelCase.shadowFlag,
          TEMPLATE_COPILOT_PROVIDER: "openrouter",
          TEMPLATE_COPILOT_MODEL: modelCase.model,
          OPENROUTER_MODEL: modelCase.model,
        },
      },
    );
    assert.notEqual(child.status, 0, modelCase.label);
    assert.match(`${child.stdout}\n${child.stderr}`, modelCase.expected, modelCase.label);
  }

  const missingShadowOutput = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      fileURLToPath(script),
    ],
    {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        VERCEL_ENV: "",
        OPENROUTER_API_KEY: "qualification-policy-test-only",
        QUALIFICATION_ALLOW_DIRTY_SOURCE: "true",
        QUALIFICATION_OUTPUT_DIR: "",
        QUALIFICATION_SHADOW_MODEL: "true",
        TEMPLATE_COPILOT_PROVIDER: "openrouter",
        TEMPLATE_COPILOT_MODEL: "openai/gpt-5.6-sol",
        OPENROUTER_MODEL: "openai/gpt-5.6-sol",
        TEMPLATE_COPILOT_OPENROUTER_ZDR: "true",
        TEMPLATE_COPILOT_OPENROUTER_REASONING_EFFORT: "none",
        TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE:
          templateCopilotOpenRouterQualificationRoutingProfile,
        TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS: "18000",
      },
    },
  );
  assert.notEqual(missingShadowOutput.status, 0);
  assert.match(
    `${missingShadowOutput.stdout}\n${missingShadowOutput.stderr}`,
    /requires an explicit separate QUALIFICATION_OUTPUT_DIR/u,
  );

  const collidingShadowOutput = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      fileURLToPath(script),
    ],
    {
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        VERCEL_ENV: "",
        OPENROUTER_API_KEY: "qualification-policy-test-only",
        QUALIFICATION_ALLOW_DIRTY_SOURCE: "true",
        QUALIFICATION_OUTPUT_DIR:
          "output/template-copilot-v3-live-semantic",
        QUALIFICATION_SHADOW_MODEL: "true",
        TEMPLATE_COPILOT_PROVIDER: "openrouter",
        TEMPLATE_COPILOT_MODEL: templateCopilotV3QualificationShadowModel,
        OPENROUTER_MODEL: templateCopilotV3QualificationShadowModel,
        TEMPLATE_COPILOT_OPENROUTER_ZDR: "true",
        TEMPLATE_COPILOT_OPENROUTER_REASONING_EFFORT: "none",
        TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE:
          templateCopilotOpenRouterQualificationRoutingProfile,
        TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS: "18000",
      },
    },
  );
  assert.notEqual(collidingShadowOutput.status, 0);
  assert.match(
    `${collidingShadowOutput.stdout}\n${collidingShadowOutput.stderr}`,
    /shadow output must be a named run below/u,
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
  input.observeProviderRequest({
    outcome: "success",
    latencyMs: 1,
    responseTelemetry: qualificationProviderTelemetry(),
  });
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
  return Array.from({ length: 8 }, (_, itemIndex) => ({
    batchId,
    itemIndex,
    anchorExpanded: false,
    sameLocalClauseRecoveredLeafCount: 0,
    leaves: [],
  }));
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

function assemblyWithoutItemFact(factId) {
  const assembly = passingAssembly();
  assembly.review.items = assembly.review.items.filter(
    (entry) => entry.factId !== factId,
  );
  return assembly;
}

function scoreForMissingItemFact(factId, batches) {
  assert.ok(
    templateCopilotV3LiveSemanticScoringContract.itemFactIds.includes(factId),
  );
  const score = passingScore();
  const failures = ["Missing governed item fact: " + factId + "."];
  const failedBatches = batches.filter((batch) => batch.status !== "applied");
  score.passed = false;
  score.failures = failures;
  score.sourceCapturePassed = false;
  score.captureFailures = failures;
  score.candidateCount -= 1;
  score.acceptedProjectionCount -= 1;
  score.semanticCompleteItemCount -= 1;
  score.completeItemCount -= 1;
  score.rawItemCount -= 1;
  score.distinctFactCount -= 1;
  score.factIds = score.factIds.filter((entry) => entry !== factId);
  score.evidenceLeafCount -= 2;
  score.batchGate = {
    ...score.batchGate,
    passed: failedBatches.length === 0,
    failures:
      failedBatches.length === 0
        ? []
        : ["A required provider batch failed."],
    passedBatchCount: batches.length - failedBatches.length,
    batchFailureCount: failedBatches.length,
    providerRequestFailureCount: failedBatches.length,
    failureCount: failedBatches.length,
  };
  score.scenarioSemantics = {
    ...score.scenarioSemantics,
    passed: false,
    failures,
    sourceCapturePassed: false,
    captureFailures: failures,
    observed: {
      ...score.scenarioSemantics.observed,
      factCount: score.distinctFactCount,
    },
  };
  return score;
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
      passedBatchCount: 5,
      batchCount: 5,
      batchFailureCount: 0,
      providerRequestFailureCount: 0,
      failureCount: 0,
      expectedBatchIds: formalBatchIds,
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
        notificationEntityCount: 2,
        fyiEntityCount: 1,
        expectedEntityCount: 17,
        matchedEntityCount: 17,
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
    runnerVersion: templateCopilotV3QualificationRunnerVersion,
    model: templateCopilotV3QualificationBaselineModel,
    provider: "openrouter",
    zdrRequired: true,
    reasoningEffort: "none",
    providerRoute: {
      providerCode: "openrouter",
      model: templateCopilotV3QualificationBaselineModel,
      privacyMode: "zdr",
      routingProfile: templateCopilotOpenRouterQualificationRoutingProfile,
    },
    providerTimeoutMs: 18_000,
    providerQuoteContractVersion:
      templateCopilotV3ProviderQuoteContractVersion,
    providerContract: templateCopilotV3QualificationProviderContractMetadata,
    providerPromptVersion: templateCopilotV3ProviderPromptVersion,
    scoringBatchIds: formalBatchIds,
    fixtureFingerprint: templateCopilotV3QualificationFixtureFingerprint,
    baselineModel: templateCopilotV3QualificationBaselineModel,
    modelMatchesBaseline: true,
    selectionMode: "full",
    sourceRevision: "a".repeat(40),
    sourceWorktreeClean: true,
    comparableCleanSource: true,
    sourceEndCheckPassed: true,
    qualificationMode: "clean_source",
    semanticRoundCount: 3,
    semanticRoundPlanVersion: templateCopilotV3SemanticRoundPlanVersion,
    semanticRoundPlanFingerprint:
      templateCopilotV3SemanticRoundPlanFingerprint,
    iterativeSemanticDiagnosticVersion:
      templateCopilotV3IterativeSemanticDiagnosticVersion,
    maximumRecoveryAttemptsPerBatch: 1,
  };
}

function qualificationProviderTelemetry(overrides = {}) {
  return {
    requestedModel: templateCopilotV3QualificationBaselineModel,
    returnedModel: templateCopilotV3QualificationBaselineModel,
    upstreamProvider: "CoreWeave",
    finishState: "stop",
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
    routerAttemptCount: 1,
    providerLatencyMs: 1,
    ...overrides,
  };
}

function qualificationFailureFingerprint(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function monotonicClock() {
  let milliseconds = 0;
  return () => new Date(milliseconds++);
}
