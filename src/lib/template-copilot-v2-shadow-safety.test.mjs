import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTemplateCopilotV2CandidateCreationEnabled,
  isTemplateCopilotV2ExtractionShadowEnabled,
} from "./template-copilot-v2-feature.ts";

const answersRoute = await readFile(
  new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts", import.meta.url),
  "utf8",
);

test("extraction rollout is default-off and candidate creation requires the separate shadow gate", () => {
  assert.equal(isTemplateCopilotV2ExtractionShadowEnabled({}), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({}), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_CANDIDATE_CREATION: "true" }), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW: "true" }), false);
  assert.equal(isTemplateCopilotV2CandidateCreationEnabled({ TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW: "true", TEMPLATE_COPILOT_V2_CANDIDATE_CREATION: "true" }), true);
});

test("shadow-only extraction is after the authoritative answer and cannot write candidates, while explicitly enabled creation can", () => {
  const answerMutation = answersRoute.indexOf("await applyTemplateCopilotV2AtomicAnswer");
  const shadowGuard = answersRoute.indexOf("!shadowEnabled || parsed.data.answer.kind !== \"text\" || result.outcome !== \"applied\"");
  const candidateMode = answersRoute.indexOf("if (candidateCreationEnabled)");
  const shadowCallback = answersRoute.indexOf("after(async () =>", answersRoute.indexOf("const shadowMessageId"));
  const candidateModeSource = answersRoute.slice(candidateMode, shadowCallback);
  const shadowSource = answersRoute.slice(shadowCallback);
  assert.ok(candidateMode >= 0 && answerMutation >= 0 && answerMutation < candidateMode && candidateMode < shadowGuard && shadowGuard < shadowCallback);
  assert.match(candidateModeSource, /await processTemplateCopilotV2AnswerExtractionJob/);
  assert.match(answersRoute, /enqueueExtractionJob: candidateCreationEnabled/);
  assert.doesNotMatch(shadowSource, /processTemplateCopilotV2AnswerExtractionJob/);
  assert.match(answersRoute, /result\.outcome !== "applied"/);
});

test("shadow logs carry counts/model or error class only, never raw answer or evidence", () => {
  const logCalls = [...answersRoute.matchAll(/safeApprovalLog\([\s\S]{0,280}?\}\);/g)].map((match) => match[0]);
  assert.ok(logCalls.some((call) => call.includes("template_copilot_v2_extraction_shadow")));
  assert.ok(logCalls.some((call) => call.includes("template_copilot_v2_extraction_failed")));
  for (const call of logCalls.filter((value) => value.includes("extraction_"))) {
    assert.doesNotMatch(call, /parsed\.data\.answer\.text|originalWording|exactText|evidence|canonicalValue/i);
  }
  assert.match(answersRoute, /candidateCount: extracted\.candidates\.length, rejectedCount: extracted\.rejected\.length, model: extracted\.model/);
  assert.match(answersRoute, /errorName: extractionError instanceof Error \? extractionError\.name : "unknown"/);
  assert.match(answersRoute, /outcome: typeof processed\.outcome === "string" \? processed\.outcome : "unknown"/);
});
