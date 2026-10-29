// Exploratory v3 live-semantic qualification against a self-hosted
// OpenAI-compatible model (for example llama.cpp / Strata on a LAN box), plus a
// replay mode that re-scores recorded answers without calling any model.
//
// It reuses the real prompt, request, quote locator, review assembly and scorer
// unchanged; only the provider client is swapped. It is never a formal gate
// run: reports are labelled "local_exploratory" and written under the
// gitignored output/ directory together with readable scorer failures.
//
//   npm run qualify:template-copilot-v3-local
//
// Env:
//   LOCAL_MODEL_BASE_URL   e.g. http://192.168.1.207:8080/v1 (required unless replaying)
//   LOCAL_MODEL_API_KEY    bearer key, if the server needs one (default "none")
//   LOCAL_MODEL_NAME       model id (default qwen3.8-flash-next-iq3_s)
//   LOCAL_MODEL_THINKING   off | on (default off, matching the reasoning-none baseline)
//   LOCAL_MODEL_TIMEOUT_MS per-request timeout (default 120000; production is 18000)
//   REPLAY_RUN_DIR         a previous run directory: answer from its recorded
//                          provider-calls.ndjson instead of calling the model
//   QUALIFICATION_SCENARIOS comma list of scenario ids (optional)
//   QUALIFICATION_LIMIT     first N scenarios (optional)
//   RUN_LABEL               output subfolder name (default: timestamp)
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { buildTemplateCopilotV3ProviderQuoteDeveloperPrompt, templateCopilotV3ProviderPromptVersion } from "../src/lib/template-copilot-v3-provider-prompt.ts";
import {
  formatTemplateCopilotV3ProviderQuoteBatch,
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
  templateCopilotV3ProviderQuoteContractVersion,
} from "../src/lib/template-copilot-v3-provider-quotes.ts";
import { requestTemplateCopilotV3ProviderQuoteOutput } from "../src/lib/template-copilot-v3-provider-request.ts";
import {
  classifyTemplateCopilotProviderRequestOutcome,
  classifyTemplateCopilotProviderTransportFailureReason,
} from "../src/lib/template-copilot-provider-request-tracker.ts";
import { assembleTemplateCopilotV3Review } from "../src/lib/template-copilot-v3-review-assembly.ts";
import { templateCopilotQualificationScenarios } from "./template-copilot-qualification-scenarios.mjs";
import {
  runTemplateCopilotV3LiveSemanticQualification,
  selectTemplateCopilotV3QualificationScenarios,
  summarizeQualification,
  templateCopilotV3QualificationBaselineModel,
  templateCopilotV3QualificationFixtureFingerprint,
  templateCopilotV3QualificationProviderContractMetadata,
} from "./template-copilot-v3-live-semantic-qualification-runner.mjs";
import {
  scoreTemplateCopilotV3LiveSemantic,
  templateCopilotV3LiveSemanticScoringContract,
} from "./template-copilot-v3-live-semantic-scoring.mjs";

const replayDir = process.env.REPLAY_RUN_DIR || "";
const baseURL = process.env.LOCAL_MODEL_BASE_URL || "";
if (!replayDir && !baseURL) {
  throw new Error("Set LOCAL_MODEL_BASE_URL, or REPLAY_RUN_DIR to re-score a recorded run.");
}
const model = process.env.LOCAL_MODEL_NAME || "qwen3.8-flash-next-iq3_s";
const thinking = (process.env.LOCAL_MODEL_THINKING || "off") === "on";
const timeoutMs = Number(process.env.LOCAL_MODEL_TIMEOUT_MS || 120000);
const label = process.env.RUN_LABEL || new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(process.cwd(), "output", "template-copilot-v3-local-model", label);
mkdirSync(outDir, { recursive: true });
const providerLog = join(outDir, "provider-calls.ndjson");
const locatorLog = join(outDir, "locator.ndjson");
const scorerLog = join(outDir, "scorer-detail.ndjson");

let currentScenario = "";

// Recorded answers keyed by scenario and schema, consumed in call order.
const recorded = new Map();
if (replayDir) {
  for (const line of readFileSync(join(replayDir, "provider-calls.ndjson"), "utf8").trim().split("\n")) {
    const call = JSON.parse(line);
    if (!call.schema || call.content == null) continue;
    const key = `${call.scenario}|${call.schema}`;
    recorded.set(key, [...(recorded.get(key) ?? []), call]);
  }
}
const replayCursor = new Map();
function replayResponse(body) {
  const key = `${currentScenario}|${body.response_format?.json_schema?.name}`;
  const calls = recorded.get(key);
  if (!calls) {
    return new Response(JSON.stringify({ error: { message: `no recorded answer for ${key}` } }), { status: 500 });
  }
  const index = replayCursor.get(key) ?? 0;
  replayCursor.set(key, index + 1);
  const call = calls[Math.min(index, calls.length - 1)];
  appendFileSync(providerLog, JSON.stringify({ ...call, scenario: currentScenario, replayed: true }) + "\n");
  return new Response(JSON.stringify({
    id: "replay",
    object: "chat.completion",
    model,
    choices: [{ index: 0, message: { role: "assistant", content: call.content }, finish_reason: call.finish }],
    usage: call.usage,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

// Local-server compatibility shim: mirror max_completion_tokens to max_tokens,
// control Qwen thinking, leave thinking room to finish, and record each call.
async function localModelFetch(url, init) {
  const isChat = typeof init?.body === "string" && String(url).endsWith("/chat/completions");
  if (isChat && replayDir) return replayResponse(JSON.parse(init.body));
  let body = init?.body;
  let meta = {};
  if (isChat) {
    const json = JSON.parse(body);
    const cap = json.max_completion_tokens ?? json.max_tokens;
    const budget = thinking ? cap + 16000 : cap;
    json.max_tokens = budget;
    json.max_completion_tokens = budget;
    json.chat_template_kwargs = { enable_thinking: thinking };
    json.temperature = json.temperature ?? 0;
    body = JSON.stringify(json);
    meta = { schema: json.response_format?.json_schema?.name, cap, budget };
  }
  const started = Date.now();
  const response = await fetch(url, { ...init, body });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* recorded below as raw error text */ }
  const choice = parsed?.choices?.[0];
  appendFileSync(providerLog, JSON.stringify({
    scenario: currentScenario,
    ...meta,
    httpStatus: response.status,
    ms: Date.now() - started,
    finish: choice?.finish_reason,
    usage: parsed?.usage,
    reasoningChars: (choice?.message?.reasoning_content || "").length,
    content: choice?.message?.content ?? null,
    error: parsed ? undefined : text.slice(0, 2000),
  }) + "\n");
  return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
}

const configured = {
  client: new OpenAI({
    apiKey: process.env.LOCAL_MODEL_API_KEY || "none",
    baseURL: baseURL || "http://replay.invalid/v1",
    fetch: localModelFetch,
    timeout: timeoutMs,
    maxRetries: 0,
  }),
  model,
  providerCode: "openai",
  privacyMode: "standard",
  protocol: "chat_completions",
  structuredOutput: "json_schema",
};

// Same contract as extractTemplateCopilotV3QuoteBatch, with the local client.
async function extractBatch({ batchId, sourceSlots, locale, observeProviderRequest }) {
  const startedAt = Date.now();
  try {
    const output = await requestTemplateCopilotV3ProviderQuoteOutput({
      configured,
      batchId,
      schemaName: `template_copilot_v3_provider_quotes_${batchId}`,
      developerText: buildTemplateCopilotV3ProviderQuoteDeveloperPrompt({ batchId, locale }),
      userText: formatTemplateCopilotV3ProviderQuoteBatch({ batchId, sourceSlots }),
      requestOptions: { timeout: timeoutMs, maxRetries: 0, signal: AbortSignal.timeout(timeoutMs) },
    });
    const located = locateTemplateCopilotV3ProviderQuotes({ batchId, sourceSlots, output });
    appendFileSync(locatorLog, JSON.stringify({
      scenario: currentScenario,
      batchId,
      acceptedCount: located.accepted.length,
      rejected: located.rejected,
    }) + "\n");
    observeProviderRequest?.({ outcome: "success", latencyMs: Date.now() - startedAt });
    return Object.freeze({
      model,
      batch: Object.freeze({
        contractVersion: templateCopilotV3ProviderQuoteContractVersion,
        batchId,
        locale,
        sourceSlots: Object.freeze([...templateCopilotV3ProviderQuoteBatches[batchId].slots]),
      }),
      accepted: located.accepted,
      rejected: located.rejected,
    });
  } catch (error) {
    appendFileSync(providerLog, JSON.stringify({
      scenario: currentScenario,
      batchId,
      thrown: String(error?.message || error).slice(0, 500),
      reasonCode: error?.reasonCode,
    }) + "\n");
    observeProviderRequest?.({
      outcome: classifyTemplateCopilotProviderRequestOutcome(error),
      latencyMs: Date.now() - startedAt,
      providerFailureReason: classifyTemplateCopilotProviderTransportFailureReason(error),
    });
    throw error;
  }
}

// Keep the scorer's readable failures; the governed report only keeps hashes.
function scoreProjection(input) {
  const result = scoreTemplateCopilotV3LiveSemantic(input);
  appendFileSync(scorerLog, JSON.stringify({
    scenario: currentScenario,
    passed: result.passed,
    failures: result.failures,
  }) + "\n");
  return result;
}

const scenarioIds = (process.env.QUALIFICATION_SCENARIOS || "").split(",").map((id) => id.trim()).filter(Boolean);
const scenarios = selectTemplateCopilotV3QualificationScenarios({
  corpus: templateCopilotQualificationScenarios,
  scenarioIds,
  limit: Math.max(0, Number.parseInt(process.env.QUALIFICATION_LIMIT || "0", 10) || 0),
  hardSubset: false,
});

const metadata = {
  sourceRevision: "local-exploratory",
  qualificationMode: "local_exploratory",
  provider: replayDir ? "replay" : "local-openai-compatible",
  model,
  baselineModel: templateCopilotV3QualificationBaselineModel,
  modelMatchesBaseline: false,
  zdrRequired: false,
  reasoningEffort: thinking ? "thinking" : "none",
  providerRoute: { providerCode: "openai", model, privacyMode: "standard", routingProfile: null },
  providerTimeoutMs: timeoutMs,
  providerQuoteContractVersion: templateCopilotV3ProviderQuoteContractVersion,
  providerContract: templateCopilotV3QualificationProviderContractMetadata,
  providerPromptVersion: templateCopilotV3ProviderPromptVersion,
  scoringBatchIds: [...templateCopilotV3LiveSemanticScoringContract.expectedBatchIds],
  fixtureFingerprint: templateCopilotV3QualificationFixtureFingerprint,
  selectionMode: scenarioIds.length ? "focused_subset" : "full",
};

const reportPath = join(outDir, "semantic-qualification-results.json");
const save = (report) => writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`run=${label} model=${model} replay=${Boolean(replayDir)} thinking=${thinking} scenarios=${scenarios.length}`);

// The runner processes scenarios in order; tag provider calls with the active id.
let nextIndex = 0;
const coverage = { matched: 0, expected: 0 };
currentScenario = scenarios[0]?.id || "";
const report = await runTemplateCopilotV3LiveSemanticQualification({
  corpus: templateCopilotQualificationScenarios,
  scenarios,
  extractBatch,
  assembleReview: assembleTemplateCopilotV3Review,
  scoreProjection,
  metadata,
  onRunStart: save,
  onScenarioComplete: async (partial) => {
    save(partial);
    const scenario = partial.scenarios[partial.scenarios.length - 1];
    const observed = scenario.semanticCapture.observed ?? {};
    coverage.matched += observed.matchedEntityCount ?? 0;
    coverage.expected += observed.expectedEntityCount ?? 0;
    nextIndex += 1;
    currentScenario = scenarios[nextIndex]?.id || "";
    console.log([
      `scenario=${scenario.id}`,
      `batches=${scenario.successfulBatchCount}/${scenario.batchCount}`,
      `capture=${scenario.semanticCapture.passed ? "PASS" : "FAIL"}`,
      `failures=${scenario.semanticCapture.failureCount}`,
      `coverage=${observed.matchedEntityCount}/${observed.expectedEntityCount}`,
      `sec=${Math.round(scenario.durationMs / 1000)}`,
    ].join(" "));
  },
});
report.summary = summarizeQualification(report);
save(report);
const gate = report.summary;
console.log(`capture=${gate.semanticCaptureGate.scenarioPassCount}/${gate.semanticCaptureGate.scenarioCount} batches=${gate.successfulBatchCount}/${gate.batchCount} coverage=${coverage.matched}/${coverage.expected} (${(100 * coverage.matched / Math.max(1, coverage.expected)).toFixed(1)}%)`);
console.log(`report=${reportPath}`);
