import assert from "node:assert/strict";
import test from "node:test";
import { getTemplateCopilotAnswerLimit, getTemplateCopilotComposerRenderContract, getTemplateCopilotV2ComposerContract, getTemplateCopilotV2InputMode } from "./template-copilot-v2-ui-contract.ts";

const question = { state: "question", nextQuestion: { questionId: "v2.workflow.name.name", primaryDecisionId: "decision.workflow.name.name" } };

test("v2 UI only exposes answer controls for a valid question and hides them for terminal states", () => {
  assert.equal(getTemplateCopilotV2InputMode(question), "answerable");
  assert.equal(getTemplateCopilotV2InputMode({ state: "question" }), "blocked");
  assert.equal(getTemplateCopilotV2InputMode({ state: "complete" }), "complete");
  assert.equal(getTemplateCopilotV2InputMode({ state: "blocked" }), "blocked");
});

test("v2 composer renders free text for short and long answers, choices for choices, and none for terminal states", () => {
  assert.deepEqual(getTemplateCopilotV2ComposerContract({ ...question, nextQuestion: { ...question.nextQuestion, answerType: "short_text" } }), { mode: "answerable", showTextComposer: true, showChoiceButtons: false });
  assert.deepEqual(getTemplateCopilotV2ComposerContract({ ...question, nextQuestion: { ...question.nextQuestion, answerType: "long_text" } }), { mode: "answerable", showTextComposer: true, showChoiceButtons: false });
  assert.deepEqual(getTemplateCopilotV2ComposerContract({ ...question, nextQuestion: { ...question.nextQuestion, answerType: "choice", options: [{ optionId: "yes", label: "Yes" }] } }), { mode: "answerable", showTextComposer: false, showChoiceButtons: true });
  assert.deepEqual(getTemplateCopilotV2ComposerContract({ state: "complete" }), { mode: "complete", showTextComposer: false, showChoiceButtons: false });
  assert.deepEqual(getTemplateCopilotV2ComposerContract({ state: "blocked" }), { mode: "blocked", showTextComposer: false, showChoiceButtons: false });
});

test("legacy v1 keeps its text composer until its draft has been created", () => {
  assert.deepEqual(getTemplateCopilotComposerRenderContract({ schemaVersion: 1, status: "interviewing" }), { mode: "answerable", showTextComposer: true, showChoiceButtons: false });
  assert.deepEqual(getTemplateCopilotComposerRenderContract({ schemaVersion: 1, status: "draft_created" }), { mode: "complete", showTextComposer: false, showChoiceButtons: false });
});

test("answer length limits preserve the v1 16000 contract and constrain v2 to 8000", () => {
  assert.equal(getTemplateCopilotAnswerLimit(1), 16000);
  assert.equal(getTemplateCopilotAnswerLimit(2), 8000);
});
