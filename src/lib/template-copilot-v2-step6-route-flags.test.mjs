import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Guided subflag gates new v2 interviews, answers, and special decisions", async () => {
  const [sessions, answers, special] = await Promise.all([
    source("../app/api/template-authoring/copilot/sessions/route.ts"),
    source("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts"),
    source("../app/api/template-authoring/copilot/sessions/[sessionId]/special/route.ts"),
  ]);
  const createGate = sessions.indexOf('isTemplateCopilotV2ModeEnabled("guided")');
  const createMutation = sessions.indexOf("createTemplateCopilotV2Session({");
  assert.ok(createGate >= 0 && createMutation > createGate);
  const answerGate = answers.indexOf('isTemplateCopilotV2ModeEnabled("guided")');
  const answerMutation = answers.indexOf("applyTemplateCopilotV2AtomicAnswer({");
  assert.ok(answerGate >= 0 && answerMutation > answerGate);
  assert.match(sessions.slice(createGate, createMutation), /code: "mode_unavailable"/u);
  assert.match(answers.slice(answerGate, answerMutation), /code: "mode_unavailable"/u);
  const specialGate = special.indexOf('isTemplateCopilotV2ModeEnabled("guided")');
  const specialMutation = special.indexOf("applyTemplateCopilotV2SpecialDecision({");
  assert.ok(specialGate >= 0 && specialMutation > specialGate);
  assert.match(special.slice(specialGate, specialMutation), /code: "mode_unavailable"/u);
});

test("all Step 6 mutations expose one parent-v2 rollback signal", async () => {
  const [modes, describe, documents, client] = await Promise.all([
    source("../app/api/template-authoring/copilot/sessions/[sessionId]/modes/route.ts"),
    source("../app/api/template-authoring/copilot/sessions/[sessionId]/describe/route.ts"),
    source("../app/api/template-authoring/copilot/sessions/[sessionId]/documents/route.ts"),
    source("../app/template-copilot.tsx"),
  ]);
  assert.match(modes, /!isTemplateCopilotV2Enabled\(\)[\s\S]{0,240}code: "v2_unavailable"/u);
  assert.match(describe, /!isTemplateCopilotV2Enabled\(\)[\s\S]{0,240}code: "v2_unavailable"/u);
  assert.match(documents, /schemaVersion === 2 && !isTemplateCopilotV2Enabled\(\)[\s\S]{0,260}code: "v2_unavailable"/u);
  const rollbackBranches = client.match(/errorCode === "v2_unavailable"/gu) || [];
  assert.ok(rollbackBranches.length >= 2, "JSON mode commands and FormData document commands both release v2 state");
});

test("any disabled active mode remains visible but renders its action controls read-only", async () => {
  const [client, copy] = await Promise.all([
    source("../app/template-copilot.tsx"),
    source("./template-copilot-v2-mode-ui.ts"),
  ]);
  assert.match(client, /const activeModeDisabled = Boolean\(activeV2Mode && !v2ModeContract\?\.availableModes\.includes\(activeV2Mode\)\)/u);
  assert.match(client, /activeModeDisabled \? null : !broadMode/u);
  assert.match(client, /submitV2\([\s\S]{0,600}activeModeDisabled/u);
  assert.match(client, /submitV2Special\([\s\S]{0,400}activeModeDisabled/u);
  assert.match(client, /submitDescribeEverything[\s\S]{0,260}activeModeDisabled/u);
  assert.match(client, /pendingModeCommand && isV2State\(state\) && !activeModeDisabled/u);
  assert.match(copy, /modeReadOnly/u);
});
