import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  extractTemplateCopilotV3QuoteBatch,
  getTemplateCopilotAiRoutingMetadata,
  templateCopilotProviderTimeoutMs,
} from "../src/lib/template-copilot-ai.ts";
import { templateCopilotV3ProviderPromptVersion } from "../src/lib/template-copilot-v3-provider-prompt.ts";
import { templateCopilotV3ProviderQuoteContractVersion } from "../src/lib/template-copilot-v3-provider-quotes.ts";
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
if (model !== templateCopilotV3QualificationBaselineModel) {
  throw new Error(
    `V3 live semantic qualification requires the Qwen baseline model ${templateCopilotV3QualificationBaselineModel}.`,
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
if (providerTimeoutMs !== 12_000) {
  throw new Error(
    "V3 live semantic qualification requires the governed 12-second provider timeout.",
  );
}
const providerRoute = getTemplateCopilotAiRoutingMetadata();
if (
  providerRoute.providerCode !== "openrouter" ||
  providerRoute.model !== model ||
  providerRoute.privacyMode !== "zdr"
) {
  throw new Error(
    "The configured provider route does not match the required OpenRouter ZDR baseline.",
  );
}

const fixtureFingerprint = createHash("sha256")
  .update(JSON.stringify(templateCopilotQualificationScenarios))
  .digest("hex");
const output = await resolveTemplateCopilotV3QualificationOutput({
  repositoryRoot,
  requestedOutputDirectory: process.env.QUALIFICATION_OUTPUT_DIR?.trim(),
  defaultRelativeOutputDirectory: `output/template-copilot-v3-live-semantic/${safePathPart(model)}`,
});
const reportPath = join(
  output.outputDirectory,
  "semantic-qualification-results.json",
);

const metadata = {
  sourceRevision: sourceIdentity.sourceRevision,
  sourceWorktreeClean: sourceIdentity.sourceWorktreeClean,
  comparableCleanSource: sourceIdentity.comparableCleanSource,
  sourceEndCheckPassed: false,
  qualificationMode: sourceIdentity.qualificationMode,
  provider,
  model,
  baselineModel: templateCopilotV3QualificationBaselineModel,
  modelMatchesBaseline: true,
  zdrRequired,
  reasoningEffort: "none",
  providerRoute: {
    providerCode: providerRoute.providerCode,
    model: providerRoute.model,
    privacyMode: providerRoute.privacyMode,
  },
  providerTimeoutMs,
  providerQuoteContractVersion: templateCopilotV3ProviderQuoteContractVersion,
  providerPromptVersion: templateCopilotV3ProviderPromptVersion,
  scoringBatchIds: [
    ...templateCopilotV3LiveSemanticScoringContract.expectedBatchIds,
  ],
  fixtureFingerprint: `sha256:${fixtureFingerprint}`,
  selectionMode: hardSubset
    ? "hard_subset"
    : scenarioIds.length > 0 || scenarioLimit > 0
      ? "focused_subset"
      : "full",
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
        `batches=${latest.successfulBatchCount}/2`,
        `semantic=${latest.semanticFidelity.passed ? "PASS" : "FAIL"}`,
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
await persistReport(report);

console.log(
  `template_copilot_v3_full_semantic_qualification=${report.summary.fullGatePassed ? "PASS" : "FAIL"}`,
);
console.log(
  `selected_qualification=${report.summary.selectedGatePassed ? "PASS" : "FAIL"}`,
);
console.log(
  `scenario_passes=${report.summary.scenarioPassCount}/${report.summary.scenarioCount}`,
);
console.log(
  `batch_passes=${report.summary.successfulBatchCount}/${report.summary.batchCount}`,
);
console.log(`report=${reportPath}`);

if (
  metadata.selectionMode === "full"
    ? !report.summary.fullGatePassed
    : !report.summary.selectedGatePassed
) {
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
