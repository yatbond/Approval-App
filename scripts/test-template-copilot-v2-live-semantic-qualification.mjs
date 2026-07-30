import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  answersForScenario,
  templateCopilotQualificationScenarios,
} from "./template-copilot-qualification-scenarios.mjs";
import { scoreLiveSemanticExtraction } from "./template-copilot-live-semantic-scoring.mjs";
import {
  extractTemplateCopilotV2Candidates,
  getTemplateCopilotAiRoutingMetadata,
} from "../src/lib/template-copilot-ai.ts";

const expectedScenarioCount = 24;
const scenarioFilter = new Set(
  (process.env.QUALIFICATION_SCENARIOS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const scenarioLimit = Math.max(
  0,
  Number.parseInt(process.env.QUALIFICATION_LIMIT || "0", 10) || 0,
);
const requestedConcurrency =
  Number.parseInt(process.env.QUALIFICATION_CONCURRENCY || "1", 10) || 1;
if (requestedConcurrency !== 1) {
  throw new Error(
    "Live semantic qualification requires QUALIFICATION_CONCURRENCY=1 so focused recovery cannot exceed three concurrent provider requests.",
  );
}
const concurrency = 1;
const model =
  process.env.TEMPLATE_COPILOT_MODEL?.trim() ||
  process.env.OPENROUTER_MODEL?.trim() ||
  "";
const outputDirectory = resolve(
  process.env.QUALIFICATION_OUTPUT_DIR?.trim() ||
    `output/template-copilot-live-semantic/${safePathPart(model || "unknown-model")}`,
);
const scenarios = templateCopilotQualificationScenarios
  .filter((item) => !scenarioFilter.size || scenarioFilter.has(item.id))
  .slice(0, scenarioLimit || undefined);
const fullScenarioSetSelected =
  scenarios.length === expectedScenarioCount &&
  templateCopilotQualificationScenarios.length === expectedScenarioCount &&
  new Set(scenarios.map((item) => item.id)).size === expectedScenarioCount;
const startedAt = new Date();
const providerRoute = getTemplateCopilotAiRoutingMetadata();
const report = {
  metadata: {
    startedAt: startedAt.toISOString(),
    provider: process.env.TEMPLATE_COPILOT_PROVIDER?.trim() || "",
    model,
    zdrRequired:
      process.env.TEMPLATE_COPILOT_OPENROUTER_ZDR?.trim() === "true",
    syntheticDataOnly: true,
    sourceTextStored: false,
    providerOutputStored: false,
    expectedScenarioCount,
    scenarioCount: scenarios.length,
    fullScenarioSetSelected,
    sectionCountPerScenario: 9,
    expectedExtractionInvocationCount: scenarios.length * 9,
    extractionWorkerConcurrency: concurrency,
    maximumInternalProviderConcurrency: 3,
    providerRequestCountAvailable: false,
    providerRoute,
  },
  scenarios: [],
};

if (report.metadata.provider !== "openrouter") {
  throw new Error("Live semantic qualification requires TEMPLATE_COPILOT_PROVIDER=openrouter.");
}
if (!model) {
  throw new Error("Live semantic qualification requires TEMPLATE_COPILOT_MODEL.");
}
if (!report.metadata.zdrRequired) {
  throw new Error(
    "Live semantic qualification requires TEMPLATE_COPILOT_OPENROUTER_ZDR=true.",
  );
}
if (
  providerRoute.providerCode !== "openrouter" ||
  providerRoute.model !== model ||
  providerRoute.privacyMode !== "zdr"
) {
  throw new Error(
    `Live semantic qualification route mismatch: ${JSON.stringify(providerRoute)}.`,
  );
}
await mkdir(outputDirectory, { recursive: true });

const queue = [...scenarios];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const result = await runScenario(item);
      report.scenarios.push(result);
      report.scenarios.sort((left, right) => left.id.localeCompare(right.id));
      await persistReport();
      console.log(
        [
          `scenario=${item.id}`,
          `language=${item.language}`,
          `extractions=${result.successfulExtractionInvocationCount}/9`,
          `semantic=${result.semanticFidelity.passed ? "PASS" : "FAIL"}`,
          `facts=${result.semanticFidelity.distinctFactCount}`,
        ].join(" "),
      );
    }
  }),
);

const languageSummaries = Object.fromEntries(
  ["en", "zh-Hant", "zh-Hans"].map((language) => {
    const matching = report.scenarios.filter(
      (item) => item.language === language,
    );
    return [
      language,
      {
        scenarioCount: matching.length,
        semanticPasses: matching.filter(
          (item) => item.semanticFidelity.passed,
        ).length,
        extractionPasses: matching.reduce(
          (total, item) =>
            total + item.successfulExtractionInvocationCount,
          0,
        ),
        extractionInvocationCount: matching.reduce(
          (total, item) => total + item.extractionInvocationCount,
          0,
        ),
      },
    ];
  }),
);
const extractionInvocationCount = report.scenarios.reduce(
  (total, item) => total + item.extractionInvocationCount,
  0,
);
const successfulExtractionInvocationCount = report.scenarios.reduce(
  (total, item) => total + item.successfulExtractionInvocationCount,
  0,
);
const semanticPassCount = report.scenarios.filter(
  (item) => item.semanticFidelity.passed,
).length;
report.metadata.finishedAt = new Date().toISOString();
report.metadata.durationMs = Date.now() - startedAt.getTime();
report.summary = {
  passed:
    fullScenarioSetSelected &&
    extractionInvocationCount === expectedScenarioCount * 9 &&
    successfulExtractionInvocationCount === extractionInvocationCount &&
    semanticPassCount === expectedScenarioCount,
  scenarioPassCount: semanticPassCount,
  scenarioCount: report.scenarios.length,
  successfulExtractionInvocationCount,
  extractionInvocationCount,
  guidedFallbackCount:
    extractionInvocationCount - successfulExtractionInvocationCount,
  languageSummaries,
  failedScenarioIds: report.scenarios
    .filter((item) => !item.semanticFidelity.passed)
    .map((item) => item.id),
};
await persistReport();

console.log(
  `template_copilot_live_semantic_qualification=${report.summary.passed ? "PASS" : "FAIL"}`,
);
console.log(`scenario_passes=${semanticPassCount}/${report.scenarios.length}`);
console.log(
  `extraction_invocation_passes=${successfulExtractionInvocationCount}/${extractionInvocationCount}`,
);
console.log(
  `report=${resolve(outputDirectory, "semantic-qualification-results.json")}`,
);
if (!report.summary.passed) process.exitCode = 1;

async function runScenario(item) {
  const scenarioStartedAt = Date.now();
  const candidates = [];
  const extractions = [];
  const sourceMessages = {};
  for (const [section, message] of Object.entries(answersForScenario(item))) {
    const messageId = `${item.id}:${section}`;
    sourceMessages[messageId] = message;
    const callStartedAt = Date.now();
    try {
      const extracted = await extractTemplateCopilotV2Candidates({
        message,
        messageId,
        locale: item.language,
        section,
      });
      candidates.push(...extracted.candidates);
      extractions.push({
        section,
        status: "applied",
        durationMs: Date.now() - callStartedAt,
        candidateCount: extracted.candidates.length,
        rejectedCount: extracted.rejected.length,
        rejectionCodes: countBy(extracted.rejected, (entry) => entry.code),
        recovery: extracted.recovery,
        documentBlocks: extracted.documentBlocks,
      });
    } catch (error) {
      extractions.push({
        section,
        status: "guided_fallback",
        durationMs: Date.now() - callStartedAt,
        candidateCount: 0,
        rejectedCount: 0,
        errorName: error instanceof Error ? error.name : "UnknownError",
        reasonCode:
          typeof error === "object" &&
          error !== null &&
          "reasonCode" in error &&
          typeof error.reasonCode === "string"
            ? error.reasonCode
            : "unknown",
      });
    }
  }
  const semanticFidelity = scoreLiveSemanticExtraction({
    item,
    sourceMessages,
    candidates,
  });
  return {
    id: item.id,
    language: item.language,
    archetype: item.archetype,
    extractionInvocationCount: extractions.length,
    successfulExtractionInvocationCount: extractions.filter(
      (extraction) => extraction.status === "applied",
    ).length,
    extractions,
    semanticFidelity,
    durationMs: Date.now() - scenarioStartedAt,
  };
}

function countBy(items, keyFor) {
  return Object.fromEntries(
    [...Map.groupBy(items, keyFor)].map(([key, values]) => [
      key,
      values.length,
    ]),
  );
}

function safePathPart(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
}

async function persistReport() {
  await writeFile(
    resolve(outputDirectory, "semantic-qualification-results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}
