import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  extractTemplateCopilotV3QuoteBatch,
  getTemplateCopilotAiRoutingMetadata,
  templateCopilotProviderTimeoutMs,
} from "../src/lib/template-copilot-ai.ts";
import { templateCopilotV3ProviderPromptVersion } from "../src/lib/template-copilot-v3-provider-prompt.ts";
import { templateCopilotV3ProviderQuoteContractVersion } from "../src/lib/template-copilot-v3-provider-quotes.ts";
import { templateCopilotV3OpenRouterChatCompletionTokenParameter } from "../src/lib/template-copilot-v3-provider-request.ts";
import { templateCopilotOpenRouterQualificationRoutingProfile } from "../src/lib/template-copilot-openrouter-routing.ts";
import { assembleTemplateCopilotV3Review } from "../src/lib/template-copilot-v3-review-assembly.ts";
import {
  scoreTemplateCopilotV3LiveSemantic,
  templateCopilotV3LiveSemanticScoringContract,
} from "./template-copilot-v3-live-semantic-scoring.mjs";
import { templateCopilotQualificationScenarios } from "./template-copilot-qualification-scenarios.mjs";
import {
  assertTemplateCopilotV3QualificationSource,
  runTemplateCopilotV3LiveSemanticQualification,
  selectTemplateCopilotV3QualificationScenarios,
  summarizeQualification,
  templateCopilotV3QualificationBaselineModel,
  templateCopilotV3QualificationFixtureFingerprint,
  templateCopilotV3QualificationProviderContractMetadata,
  templateCopilotV3QualificationShadowModel,
  templateCopilotV3QualificationSourceStateMatches,
} from "./template-copilot-v3-live-semantic-qualification-runner.mjs";
import {
  resolveTemplateCopilotV3QualificationOutput,
  templateCopilotV3QualificationRepositoryRoot,
  writeTemplateCopilotV3QualificationReportAtomic,
} from "./template-copilot-v3-live-semantic-qualification-io.mjs";
import { readTemplateCopilotV3QualificationGitState } from "./template-copilot-v3-live-semantic-qualification-source.mjs";

const repositoryRoot = await realpath(
  templateCopilotV3QualificationRepositoryRoot(import.meta.url),
);
const scenarioIds = (process.env.QUALIFICATION_SCENARIOS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const scenarioLimit = Math.max(
  0,
  Number.parseInt(process.env.QUALIFICATION_LIMIT || "0", 10) || 0,
);
const hardSubset = process.env.QUALIFICATION_HARD_SUBSET?.trim() === "true";
const allowDirtySource =
  process.env.QUALIFICATION_ALLOW_DIRTY_SOURCE?.trim() === "true";
const shadowFlag =
  process.env.QUALIFICATION_SHADOW_MODEL?.trim() || "false";
if (shadowFlag !== "true" && shadowFlag !== "false") {
  throw new Error(
    "QUALIFICATION_SHADOW_MODEL must be exactly true or false when supplied.",
  );
}
const shadowModelRequested = shadowFlag === "true";
const scenarios = selectTemplateCopilotV3QualificationScenarios({
  corpus: templateCopilotQualificationScenarios,
  scenarioIds,
  limit: scenarioLimit,
  hardSubset,
});
const initialSourceState =
  readTemplateCopilotV3QualificationGitState(repositoryRoot);
const sourceRevision = initialSourceState.sourceRevision;
const worktreeStatus = initialSourceState.worktreeStatus;
const sourceIdentity = assertTemplateCopilotV3QualificationSource({
  sourceRevision,
  worktreeStatus,
  allowDirtySource,
});
const provider = process.env.TEMPLATE_COPILOT_PROVIDER?.trim() || "";
const model =
  process.env.TEMPLATE_COPILOT_MODEL?.trim() ||
  process.env.OPENROUTER_MODEL?.trim() ||
  "";
const zdrRequired =
  process.env.TEMPLATE_COPILOT_OPENROUTER_ZDR?.trim() === "true";
const configuredReasoningEffort =
  process.env.TEMPLATE_COPILOT_OPENROUTER_REASONING_EFFORT?.trim() || "none";
if (provider !== "openrouter") {
  throw new Error(
    "V3 live semantic qualification requires TEMPLATE_COPILOT_PROVIDER=openrouter.",
  );
}
if (
  shadowModelRequested
    ? model !== templateCopilotV3QualificationShadowModel
    : model !== templateCopilotV3QualificationBaselineModel
) {
  throw new Error(
    shadowModelRequested
      ? `The explicit GPT-5.6 Sol shadow run requires model ${templateCopilotV3QualificationShadowModel}; the Qwen baseline cannot be labeled as shadow.`
      : `V3 live semantic qualification requires the Qwen baseline model ${templateCopilotV3QualificationBaselineModel}. Set QUALIFICATION_SHADOW_MODEL=true only for the separately labeled ${templateCopilotV3QualificationShadowModel} shadow.`,
  );
}
if (!zdrRequired) {
  throw new Error(
    "V3 live semantic qualification requires TEMPLATE_COPILOT_OPENROUTER_ZDR=true.",
  );
}
if (configuredReasoningEffort !== "none") {
  throw new Error(
    "V3 live semantic qualification requires OpenRouter reasoning effort none.",
  );
}
const providerTimeoutMs = templateCopilotProviderTimeoutMs();
if (providerTimeoutMs !== 15_000) {
  throw new Error(
    "V3 live semantic qualification requires the governed 15-second provider timeout.",
  );
}
const providerRoute = getTemplateCopilotAiRoutingMetadata();
if (
  providerRoute.providerCode !== "openrouter" ||
  providerRoute.model !== model ||
  providerRoute.privacyMode !== "zdr"
) {
  throw new Error(
    "The configured provider route does not match the required OpenRouter ZDR run model.",
  );
}
if (
  providerRoute.routingProfile !==
  templateCopilotOpenRouterQualificationRoutingProfile
) {
  throw new Error(
    `V3 live semantic qualification requires TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE=${templateCopilotOpenRouterQualificationRoutingProfile}.`,
  );
}

const requestedOutputDirectory = process.env.QUALIFICATION_OUTPUT_DIR?.trim();
if (shadowModelRequested && !requestedOutputDirectory) {
  throw new Error(
    "GPT-5.6 Sol shadow qualification requires an explicit separate QUALIFICATION_OUTPUT_DIR.",
  );
}
const output = await resolveTemplateCopilotV3QualificationOutput({
  repositoryRoot,
  requestedOutputDirectory,
  defaultRelativeOutputDirectory: `output/template-copilot-v3-live-semantic/${safePathPart(model)}`,
});
if (shadowModelRequested) {
  const shadowNamespace = join(
    output.governedOutputRoot,
    "template-copilot-v3-live-semantic",
    "shadow-gpt-5.6-sol",
  );
  const shadowRelativePath = relative(
    shadowNamespace,
    output.outputDirectory,
  );
  if (
    shadowRelativePath === "" ||
    shadowRelativePath.startsWith("..") ||
    isAbsolute(shadowRelativePath)
  ) {
    throw new Error(
      "GPT-5.6 Sol shadow output must be a named run below output/template-copilot-v3-live-semantic/shadow-gpt-5.6-sol/.",
    );
  }
}
const reportPath = join(
  output.outputDirectory,
  "semantic-qualification-results.json",
);
const providerContract = Object.freeze({
  ...templateCopilotV3QualificationProviderContractMetadata,
  chatCompletionTokenParameter:
    templateCopilotV3OpenRouterChatCompletionTokenParameter(model),
});

const metadata = {
  sourceRevision: sourceIdentity.sourceRevision,
  sourceWorktreeClean: sourceIdentity.sourceWorktreeClean,
  comparableCleanSource: sourceIdentity.comparableCleanSource,
  sourceEndCheckPassed: false,
  qualificationMode: shadowModelRequested
    ? "shadow_exploratory"
    : sourceIdentity.qualificationMode,
  provider,
  model,
  baselineModel: templateCopilotV3QualificationBaselineModel,
  modelMatchesBaseline: !shadowModelRequested,
  zdrRequired,
  reasoningEffort: "none",
  providerRoute: {
    providerCode: providerRoute.providerCode,
    model: providerRoute.model,
    privacyMode: providerRoute.privacyMode,
    routingProfile: providerRoute.routingProfile,
  },
  providerTimeoutMs,
  providerQuoteContractVersion: templateCopilotV3ProviderQuoteContractVersion,
  providerContract,
  providerPromptVersion: templateCopilotV3ProviderPromptVersion,
  scoringBatchIds: [
    ...templateCopilotV3LiveSemanticScoringContract.expectedBatchIds,
  ],
  fixtureFingerprint: templateCopilotV3QualificationFixtureFingerprint,
  selectionMode: `${shadowModelRequested ? "shadow_" : ""}${hardSubset
    ? "hard_subset"
    : scenarioIds.length > 0 || scenarioLimit > 0
      ? "focused_subset"
      : "full"}`,
};

const report = await runTemplateCopilotV3LiveSemanticQualification({
  corpus: templateCopilotQualificationScenarios,
  scenarios,
  extractBatch: extractTemplateCopilotV3QuoteBatch,
  assembleReview: assembleTemplateCopilotV3Review,
  scoreProjection: scoreTemplateCopilotV3LiveSemantic,
  metadata,
  onRunStart: persistReport,
  onScenarioComplete: async (partialReport) => {
    await persistReport(partialReport);
    const latest = partialReport.scenarios[partialReport.scenarios.length - 1];
    console.log(
      [
        `scenario=${latest.id}`,
        `locale=${latest.language}`,
        `batches=${latest.successfulBatchCount}/${templateCopilotV3LiveSemanticScoringContract.expectedBatchIds.length}`,
        `capture=${latest.semanticCapture.passed ? "CAPTURE_PASS" : "CAPTURE_FAIL"}`,
        `holds=${latest.semanticCapture.governedHoldCount}`,
        "executable=BLOCKED",
      ].join(" "),
    );
  },
});
const endingSourceState =
  readTemplateCopilotV3QualificationGitState(repositoryRoot);
report.metadata.endingSourceRevision = endingSourceState.sourceRevision;
report.metadata.endingSourceWorktreeClean =
  endingSourceState.worktreeStatus === "";
report.metadata.sourceEndCheckPassed =
  templateCopilotV3QualificationSourceStateMatches({
    sourceRevision,
    worktreeStatus,
    endingSourceRevision: endingSourceState.sourceRevision,
    endingWorktreeStatus: endingSourceState.worktreeStatus,
  });
report.summary = summarizeQualification(report);
if (
  shadowModelRequested &&
  (
    report.summary.passed ||
    report.summary.fullGatePassed ||
    report.summary.selectedGatePassed ||
    report.summary.pilotGate.passed ||
    report.summary.semanticCaptureGate.fullCorpusPassed
  )
) {
  throw new Error(
    "A GPT-5.6 Sol shadow run must remain excluded from formal and pilot gates.",
  );
}
await persistReport(report);

console.log(
  `qualification_run=${shadowModelRequested ? "GPT_5_6_SOL_SHADOW_EXPLORATORY" : "QWEN_BASELINE"}`,
);
console.log(
  `template_copilot_v3_source_capture=${report.summary.semanticCaptureGate.fullCorpusPassed ? "CAPTURE_PASS" : "CAPTURE_FAIL"}`,
);
console.log(
  `capture_scenarios=${report.summary.semanticCaptureGate.scenarioPassCount}/${report.summary.semanticCaptureGate.scenarioCount}`,
);
console.log(
  `governed_holds=${report.summary.semanticCaptureGate.governedHoldCount}`,
);
console.log("executable_draft=BLOCKED");
console.log("activation=BLOCKED");
console.log("pilot=BLOCKED");
console.log("overall=BLOCKED");
console.log(
  `batch_passes=${report.summary.successfulBatchCount}/${report.summary.batchCount}`,
);
console.log(`report=${reportPath}`);

if (!report.summary.pilotGate.passed) {
  process.exitCode = 1;
}

async function persistReport(value) {
  await writeTemplateCopilotV3QualificationReportAtomic({
    governedOutputRoot: output.governedOutputRoot,
    reportPath,
    value,
  });
}

function safePathPart(value) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 80);
}
