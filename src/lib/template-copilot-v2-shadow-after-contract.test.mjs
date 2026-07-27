import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TemplateCopilotProviderTimeoutConfigurationError, templateCopilotProviderTimeoutMs } from "./template-copilot-provider-timeout.ts";

const route = await readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts", import.meta.url), "utf8");
const ai = await readFile(new URL("./template-copilot-ai.ts", import.meta.url), "utf8");
const timeoutConfig = await readFile(new URL("./template-copilot-provider-timeout.ts", import.meta.url), "utf8");

test("shadow-only extraction is scheduled after only a successful fresh text answer", () => {
  assert.match(route, /!shadowEnabled \|\| parsed\.data\.answer\.kind !== "text" \|\| result\.outcome !== "applied"/);
  const shadowStart = route.indexOf("const shadowMessageId");
  const schedule = route.indexOf("after(async () =>", shadowStart);
  const response = route.indexOf("return templateAuthoringRpcResponse({ cookieSource, correlationId, result });", schedule);
  assert.ok(schedule >= 0 && response > schedule, "response is returned without awaiting the provider");
  for (const captured of ["shadowMessageId", "shadowMessage"]) assert.match(route, new RegExp(`const ${captured}`));
  assert.match(route, /const candidateCreationEnabled = textAnswer && isTemplateCopilotV2CandidateCreationEnabled\(\)/);
});

test("shadow-only provider failure never changes the manual answer and no candidate write exists in after", () => {
  const shadowStart = route.indexOf("const shadowMessageId");
  const scheduled = route.slice(route.indexOf("after(async () =>", shadowStart));
  const callback = scheduled.slice(0, scheduled.indexOf("\n    });") + "\n    });".length);
  assert.match(callback, /try \{[\s\S]*?extractTemplateCopilotV2Candidates[\s\S]*?\} catch \(extractionError\)/);
  assert.match(callback, /safeApprovalLog\("template_copilot_v2_extraction_failed"/);
  assert.match(route, /result\.outcome !== "applied"/);
  assert.match(route, /parsed\.data\.answer\.kind !== "text"/);
  assert.doesNotMatch(callback, /processTemplateCopilotV2AnswerExtractionJob/);
  assert.doesNotMatch(callback, /return templateAuthoringRpcResponse/);
  assert.doesNotMatch(route, /safeApprovalLog\([^\n]*shadowMessage/);
});

test("candidate creation atomically enqueues and resumes a durable job without blocking the manual answer", () => {
  const mutationStart = route.indexOf("const result = await applyTemplateCopilotV2AtomicAnswer");
  const candidateModeStart = route.indexOf("if (candidateCreationEnabled)");
  const shadowStart = route.indexOf("const shadowMessageId");
  const mutation = route.slice(mutationStart, candidateModeStart);
  const candidateMode = route.slice(candidateModeStart, shadowStart);
  assert.match(mutation, /enqueueExtractionJob: candidateCreationEnabled/);
  assert.match(candidateMode, /result\.outcome === "applied" \|\| result\.outcome === "replayed"/);
  assert.match(candidateMode, /after\(async \(\) =>/);
  assert.match(candidateMode, /await processTemplateCopilotV2AnswerExtractionJob/);
  assert.match(candidateMode, /answerClientMessageId/);
  assert.match(candidateMode, /return templateAuthoringRpcResponse\(\{ cookieSource, correlationId, result \}\)/);
  assert.doesNotMatch(candidateMode, /await extractTemplateCopilotV2Candidates/);
  assert.doesNotMatch(candidateMode, /applyTemplateCopilotV2CandidateExtraction/);
});

test("provider SDK requests are bounded with no retries and configuration is constrained below route duration", () => {
  assert.equal(templateCopilotProviderTimeoutMs({}), 12_000);
  assert.equal(templateCopilotProviderTimeoutMs({ TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS: "1500" }), 1500);
  assert.throws(() => templateCopilotProviderTimeoutMs({ TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS: "999" }), TemplateCopilotProviderTimeoutConfigurationError);
  assert.throws(() => templateCopilotProviderTimeoutMs({ TEMPLATE_COPILOT_PROVIDER_TIMEOUT_MS: "20001" }), TemplateCopilotProviderTimeoutConfigurationError);
  assert.match(ai, /maxRetries: 0/);
  assert.match(ai, /signal: AbortSignal\.timeout\(timeout\)/);
  assert.match(timeoutConfig, /maximumProviderTimeoutMs = 20_000/);
  assert.match(route, /export const maxDuration = 30/);
});
