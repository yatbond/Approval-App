import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTemplateCopilotV2TelemetryMinimized,
  buildTemplateCopilotV2Step10CoreMatrix,
  evaluateTemplateCopilotV2Pilot,
  parseTemplateCopilotV2PilotCsv,
  templateCopilotV2AmbiguityFixtures,
  templateCopilotV2AnswerProfiles,
  templateCopilotV2PilotReviewTags,
  templateCopilotV2ProviderOutcomes,
  templateCopilotV2QualificationModes,
  templateCopilotV2Step10FailClosedFeatureFixtures,
  templateCopilotV2Step10WorkflowFixtures,
} from "./template-copilot-v2-step10-qualification.ts";
import { runTemplateCopilotV2Step10Qualification } from "../../scripts/template-copilot-v2-step10-runner.mjs";

test("Step 10 core matrix is exactly 24 workflows by three locales by three repetitions", () => {
  const matrix = buildTemplateCopilotV2Step10CoreMatrix();
  assert.equal(templateCopilotV2Step10WorkflowFixtures.length, 24);
  assert.equal(matrix.length, 216);
  assert.equal(new Set(matrix.map((item) => item.caseId)).size, 216);
  for (const workflow of templateCopilotV2Step10WorkflowFixtures) {
    const cases = matrix.filter(
      (item) => item.workflowId === workflow.workflowId,
    );
    assert.equal(cases.length, 9, workflow.workflowId);
    for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
      assert.deepEqual(
        cases
          .filter((item) => item.locale === locale)
          .map((item) => item.repetition),
        [1, 2, 3],
        `${workflow.workflowId}:${locale}`,
      );
    }
  }
});

test("Step 10 matrix covers every required authoring, answer, ambiguity, provider, and workflow feature class", () => {
  const matrix = buildTemplateCopilotV2Step10CoreMatrix();
  for (const value of templateCopilotV2QualificationModes) {
    assert.ok(matrix.some((item) => item.mode === value), value);
  }
  for (const value of templateCopilotV2AnswerProfiles) {
    assert.ok(matrix.some((item) => item.answerProfile === value), value);
  }
  for (const value of templateCopilotV2AmbiguityFixtures) {
    assert.ok(matrix.some((item) => item.ambiguityFixture === value), value);
  }
  for (const value of templateCopilotV2ProviderOutcomes) {
    assert.ok(matrix.some((item) => item.providerOutcome === value), value);
  }
  for (const feature of [
    "conditional_route",
    "parallel_approval",
    "dual_path",
    "attachment",
    "information_handoff",
    "document_handoff",
    "fyi",
    "correction_loop",
    "shared_submission",
  ]) {
    assert.ok(
      templateCopilotV2Step10WorkflowFixtures.some((item) =>
        item.featureCodes.includes(feature),
      ),
      feature,
    );
  }
  assert.ok(
    templateCopilotV2Step10FailClosedFeatureFixtures.includes(
      "native_form_without_field_definitions",
    ),
  );
});

test("all 216 pinned conversations replay through the compiler, validator, and route simulator deterministically", () => {
  const first = runTemplateCopilotV2Step10Qualification();
  const second = runTemplateCopilotV2Step10Qualification();
  assert.equal(first.status, "passed");
  assert.equal(first.summary.conversationCount, 216);
  assert.equal(first.summary.criticalHallucinations, 0);
  assert.equal(first.summary.silentOverwrites, 0);
  assert.equal(first.summary.falseCompleteResults, 0);
  assert.equal(first.summary.invalidActorSchemaRejectionFailures, 0);
  assert.deepEqual(first.summary.routeEquivalenceFailures, []);
  assert.equal(
    first.summary.failClosedFeatureFixtures.native_form_without_field_definitions.blocked,
    true,
  );
  assert.equal(
    first.summary.failClosedFeatureFixtures.conditional_parallel_route_not_representable.blocked,
    true,
  );
  assert.deepEqual(first, second);
  for (const trace of first.traces) {
    assert.equal(trace.compiler.draftBlockerCount, 0, trace.caseId);
    assert.equal(trace.compiler.publicationBlockerCount, 0, trace.caseId);
    assert.equal(trace.validation.valid, true, trace.caseId);
    assert.equal(trace.readiness.intermediate.draft, "not_ready", trace.caseId);
    assert.equal(trace.readiness.intermediate.publication, "not_ready", trace.caseId);
    assert.equal(trace.readiness.final.draft, "ready", trace.caseId);
    assert.equal(trace.readiness.final.publication, "ready", trace.caseId);
    assert.equal(trace.readiness.final.activation, "not_ready", trace.caseId);
    assert.equal(trace.telemetry.provider.privacyMode, "zdr", trace.caseId);
    assert.ok(trace.selectedQuestionIds.length > 0, trace.caseId);
    assert.ok(
      trace.selectedQuestionIds.every((questionId) => questionId.startsWith("v2.")),
      trace.caseId,
    );
    assert.ok(
      trace.accessibilityContracts.every(
        (contract) =>
          contract.promptPresent &&
          contract.helpControlPresent &&
          contract.interactionLabelsPresent &&
          contract.modeSwitchLabelPresent,
      ),
      trace.caseId,
    );
    assert.equal(trace.factMismatches.length, 0, trace.caseId);
    assert.equal(trace.silentOverwriteFactIds.length, 0, trace.caseId);
    assert.equal(trace.missingDeclaredFeatures.length, 0, trace.caseId);
    assert.equal(trace.routes.oraclePassed, true, trace.caseId);
    assert.equal(trace.routes.terminalOraclePassed, true, trace.caseId);
    assert.equal(trace.invalidActorSchemaCheck.rejected, true, trace.caseId);
    assert.equal(
      trace.invalidActorSchemaCheck.authoritativeLedgerUnchanged,
      true,
      trace.caseId,
    );
  }
  for (const workflow of templateCopilotV2Step10WorkflowFixtures) {
    const traces = first.traces.filter(
      (trace) => trace.workflowId === workflow.workflowId,
    );
    assert.equal(
      new Set(traces.map((trace) => trace.localizedInputHash)).size,
      3,
      `${workflow.workflowId}:localized inputs`,
    );
    assert.equal(
      new Set(traces.map((trace) => trace.behaviorHash)).size,
      1,
      `${workflow.workflowId}:behavior equivalence`,
    );
  }
});

test("provider failures leave the authoritative ledger unchanged and Describe uses actual Guided fallback", () => {
  const result = runTemplateCopilotV2Step10Qualification();
  for (const outcome of templateCopilotV2ProviderOutcomes.filter(
    (value) => value !== "success",
  )) {
    const traces = result.traces.filter(
      (trace) => trace.provider.outcome === outcome,
    );
    assert.ok(traces.length > 0, outcome);
    assert.ok(
      traces.every((trace) => trace.provider.authoritativeLedgerUnchanged),
      outcome,
    );
    for (const trace of traces.filter(
      (item) => item.modeEvidence.selectedMode === "describe_everything",
    )) {
      assert.equal(trace.modeEvidence.guidedFallbackUsed, true, trace.caseId);
      assert.equal(trace.provider.recoveredThroughGuidedFallback, true, trace.caseId);
      assert.equal(trace.telemetry.counts.retries, 1, trace.caseId);
    }
  }
});

test("modes, answer profiles, and ambiguity fixtures produce real durable evidence", () => {
  const result = runTemplateCopilotV2Step10Qualification();
  assert.ok(
    result.traces
      .filter((trace) => trace.modeEvidence.selectedMode === "similar_template")
      .every((trace) => trace.modeEvidence.sourceCandidateCount > 0),
  );
  assert.ok(
    result.traces
      .filter(
        (trace) =>
          trace.modeEvidence.selectedMode === "describe_everything" &&
          trace.provider.outcome === "success",
      )
      .every((trace) => trace.modeEvidence.candidateConfirmations > 0),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "conflicting")
      .every((trace) => trace.conflictOutcome === "human_kept_existing"),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "uncertain")
      .every(
        (trace) =>
          trace.answerProfileEvidence.unknownTransitionObserved,
      ),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "fragmented")
      .every(
        (trace) =>
          trace.answerProfileEvidence.candidateConfirmed &&
          trace.answerProfileEvidence.fragmentedMessageCount === 2,
      ),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "typo_heavy")
      .every(
        (trace) =>
          trace.answerProfileEvidence.candidateConfirmed &&
          trace.answerProfileEvidence.typoValueCommitted &&
          trace.answerProfileEvidence.finalOwnerStaleHistoryCount >= 1 &&
          trace.answerProfileEvidence.finalOwnerOperation === "human_replace",
      ),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "mixed_language")
      .every(
        (trace) =>
          trace.answerProfileEvidence.candidateConfirmed &&
          trace.answerProfileEvidence.mixedLanguageSourceUsed,
      ),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.answerProfile === "correction_heavy")
      .every(
        (trace) =>
          trace.answerProfileEvidence.preCompletionOwnerStaleHistoryCount >= 1 &&
          trace.answerProfileEvidence.finalOwnerStaleHistoryCount >= 2 &&
          trace.answerProfileEvidence.finalOwnerOperation === "human_replace",
      ),
  );
  assert.ok(
    result.traces
      .filter((trace) => trace.ambiguity.fixture !== "none")
      .every(
        (trace) =>
          trace.ambiguity.candidateAttempted &&
          trace.ambiguity.unsafeConfirmationRejected,
      ),
  );
});

test("structured telemetry rejects raw corporate text and direct identifiers", () => {
  const event =
    runTemplateCopilotV2Step10Qualification().traces[0].telemetry;
  assert.deepEqual(assertTemplateCopilotV2TelemetryMinimized(event), event);
  assert.throws(
    () =>
      assertTemplateCopilotV2TelemetryMinimized({
        ...event,
        rawAnswer: "Confidential acquisition plan",
      }),
    /unrecognized_keys|forbidden raw-text key/i,
  );
  assert.throws(
    () =>
      assertTemplateCopilotV2TelemetryMinimized({
        ...event,
        outcomeCode: "person@example.com",
      }),
    /invalid_format|email-like/i,
  );
});

function passingPilotObservations() {
  const observations = [];
  const locales = ["en", "zh-Hant", "zh-Hans"];
  for (let index = 0; index < 9; index += 1) {
    const participantPseudonym = `pilot-${index.toString(16).padStart(12, "0")}`;
    const experience = index % 3 === 0 ? "experienced_author" : "new_author";
    for (const task of ["standardized", "departmental"]) {
      observations.push({
        participantPseudonym,
        locale: locales[Math.floor(index / 3)],
        experience,
        task,
        mode:
          task === "standardized"
            ? "guided"
            : index % 3 === 0
              ? "describe_everything"
              : index % 3 === 1
                ? "similar_template"
                : "guided",
        completedUnaided: true,
        dossierComplete: true,
        inventedCriticalFactCount: 0,
        unauthorizedMutationCount: 0,
        crossUserExposureCount: 0,
        silentCommittedFactLossCount: 0,
        automaticPublicationOrActivationCount: 0,
        traceabilityPercent: 100,
        initialBriefFactRecallPercent: 100,
        durationSeconds: experience === "new_author" ? 720 : 600,
        ...(experience === "experienced_author"
          ? { visualBuilderBaselineSeconds: 1_000 }
          : {}),
        criticalAccessibilityFailureCount: 0,
        reviewTags: [],
      });
    }
  }
  return observations;
}

test("nine-person pilot gate requires three people per language and both tasks per person", () => {
  const observations = passingPilotObservations();
  const result = evaluateTemplateCopilotV2Pilot(observations);
  assert.equal(result.status, "passed");
  assert.equal(result.participantCount, 9);
  assert.equal(result.observationCount, 18);
  assert.deepEqual(result.languageCounts, {
    en: 3,
    "zh-Hant": 3,
    "zh-Hans": 3,
  });
  assert.deepEqual(result.failures, []);
  assert.equal(templateCopilotV2PilotReviewTags.length, 9);
});

test("pilot stop criteria fail on any critical mutation, fact loss, invention, automatic activation, or accessibility blocker", () => {
  for (const field of [
    "inventedCriticalFactCount",
    "unauthorizedMutationCount",
    "crossUserExposureCount",
    "silentCommittedFactLossCount",
    "automaticPublicationOrActivationCount",
    "criticalAccessibilityFailureCount",
  ]) {
    const observations = passingPilotObservations();
    observations[0][field] = 1;
    const result = evaluateTemplateCopilotV2Pilot(observations);
    assert.equal(result.status, "not_ready", field);
    assert.ok(result.failures.includes("critical_stop_criterion_triggered"));
  }
});

test("pilot cannot pass experienced authors without a visual-builder baseline", () => {
  const observations = passingPilotObservations();
  for (const observation of observations) {
    if (observation.experience === "experienced_author") {
      delete observation.visualBuilderBaselineSeconds;
    }
  }
  const result = evaluateTemplateCopilotV2Pilot(observations);
  assert.equal(result.status, "not_ready");
  assert.ok(
    result.failures.includes(
      "experienced_author_speed_improvement_below_30_percent",
    ),
  );
});

test("pilot pins standardized work to Guided and requires every departmental mode in every language", () => {
  const wrongStandardizedMode = passingPilotObservations();
  wrongStandardizedMode[0].mode = "describe_everything";
  assert.ok(
    evaluateTemplateCopilotV2Pilot(wrongStandardizedMode).failures.includes(
      "standardized_pilot_task_requires_guided_mode",
    ),
  );
  const noDescribe = passingPilotObservations();
  for (const observation of noDescribe) {
    if (observation.task === "departmental") observation.mode = "guided";
  }
  assert.ok(
    evaluateTemplateCopilotV2Pilot(noDescribe).failures.includes(
      "pilot_requires_describe_initial_brief_per_language",
    ),
  );
  assert.ok(
    evaluateTemplateCopilotV2Pilot(noDescribe).failures.includes(
      "pilot_requires_all_departmental_modes_per_language",
    ),
  );
  const duplicateDescribe = passingPilotObservations();
  for (const observation of duplicateDescribe) {
    if (observation.task === "departmental") {
      observation.mode = "describe_everything";
    }
  }
  const duplicateDescribeResult =
    evaluateTemplateCopilotV2Pilot(duplicateDescribe);
  assert.equal(duplicateDescribeResult.status, "not_ready");
  assert.ok(
    duplicateDescribeResult.failures.includes(
      "pilot_requires_all_departmental_modes_per_language",
    ),
  );
});

test("pilot CSV import is strict and operationally feeds the evaluator", () => {
  const observations = passingPilotObservations();
  const headers = Object.keys(observations[0]);
  const quote = (value) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    headers.join(","),
    ...observations.map((observation) =>
      headers
        .map((header) =>
          quote(
            header === "reviewTags"
              ? observation[header].join("|")
              : observation[header],
          ),
        )
        .join(","),
    ),
  ].join("\n");
  const parsed = parseTemplateCopilotV2PilotCsv(csv);
  assert.equal(parsed.length, 18);
  assert.equal(evaluateTemplateCopilotV2Pilot(parsed).status, "passed");
  assert.throws(
    () => parseTemplateCopilotV2PilotCsv(csv.replace('"true"', '""')),
    /invalid/i,
  );
});

test("pilot rejects a participant whose language or experience changes between tasks", () => {
  const observations = passingPilotObservations();
  observations[1].locale = "zh-Hant";
  observations[1].experience = "experienced_author";
  const result = evaluateTemplateCopilotV2Pilot(observations);
  assert.equal(result.status, "not_ready");
  assert.ok(
    result.failures.includes("pilot_participant_profile_must_be_consistent"),
  );
});
