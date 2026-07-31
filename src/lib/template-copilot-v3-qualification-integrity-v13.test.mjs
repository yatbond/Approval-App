import assert from "node:assert/strict";
import test from "node:test";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  runTemplateCopilotV3LiveSemanticQualification,
  templateCopilotV3QualificationBaselineModel,
  templateCopilotV3QualificationFactIds,
  templateCopilotV3QualificationObservedMetricKeys,
} from "../../scripts/template-copilot-v3-live-semantic-qualification-runner.mjs";
import { templateCopilotV3LiveSemanticScoringContract } from "../../scripts/template-copilot-v3-live-semantic-scoring.mjs";
import { templateCopilotV3ProviderQuoteContractVersion } from "./template-copilot-v3-provider-quotes.ts";

test("v3 qualification rejects a fabricated scorer pass over an empty assembled projection", async () => {
  const report = await runTemplateCopilotV3LiveSemanticQualification({
    corpus: templateCopilotQualificationScenarios,
    scenarios: templateCopilotQualificationScenarios,
    extractBatch: async (input) => {
      input.observeProviderRequest({ outcome: "success", latencyMs: 1 });
      return {
        model: templateCopilotV3QualificationBaselineModel,
        batch: {
          contractVersion: templateCopilotV3ProviderQuoteContractVersion,
          batchId: input.batchId,
          locale: input.locale,
          sourceSlots: input.sourceSlots.map((source) => source.slot),
        },
        accepted: [],
        rejected: [],
      };
    },
    assembleReview: () => ({
      envelope: { sourceSpans: [], fragments: [] },
      review: {
        items: [],
        scalarFacts: [],
        policyItems: [],
        conflicts: [],
        rejections: [],
      },
    }),
    scoreProjection: fabricatedPassingScore,
    metadata: qualificationMetadata(),
    now: monotonicClock(),
  });

  assert.ok(
    report.scenarios.every(
      (scenario) => scenario.projection.reviewItemCount === 0,
    ),
  );
  assert.ok(
    report.scenarios.every(
      (scenario) => scenario.semanticCapture.resultValid === false,
    ),
  );
  assert.equal(report.summary.scenarioPassCount, 0);
  assert.equal(report.summary.selectedGatePassed, false);
  assert.equal(report.summary.fullGatePassed, false);
});

function fabricatedPassingScore() {
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
      observed: Object.fromEntries(
        templateCopilotV3QualificationObservedMetricKeys.map((key) => [
          key,
          key === "factCount" ? 16 : key === "governedSemanticHoldCount" ? 0 : 1,
        ]),
      ),
    },
    manifestVersion: templateCopilotV3LiveSemanticScoringContract.manifestVersion,
    manifestCorpusFingerprint:
      templateCopilotV3LiveSemanticScoringContract.manifestCorpusFingerprint,
  };
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
