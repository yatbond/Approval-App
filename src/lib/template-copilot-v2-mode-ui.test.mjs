import assert from "node:assert/strict";
import test from "node:test";
import {
  getTemplateCopilotTranscriptPresentation,
  getTemplateCopilotV2ModeUiContract,
  shouldSubmitTemplateCopilotComposerKey,
  templateCopilotV2ModeUiCopy,
} from "./template-copilot-v2-mode-ui.ts";

const allModes = Object.freeze({
  guided: true,
  describeEverything: true,
  similarTemplate: true,
});
test("mode subflags are independent and default to no newly exposed controls", () => {
  assert.deepEqual(getTemplateCopilotV2ModeUiContract({
    mode: "guided",
    flags: undefined,
    hasSourceSnapshot: false,
  }).availableModes, []);
  assert.deepEqual(getTemplateCopilotV2ModeUiContract({
    mode: "guided",
    flags: { guided: true, describeEverything: false, similarTemplate: false },
    hasSourceSnapshot: false,
  }).availableModes, ["guided"]);
  assert.deepEqual(getTemplateCopilotV2ModeUiContract({
    mode: "guided",
    flags: { guided: false, describeEverything: true, similarTemplate: false },
    hasSourceSnapshot: false,
  }).availableModes, ["describe_everything"]);
});

test("Describe and Similar share the broad candidate composer but documents stay Describe-only", () => {
  const describe = getTemplateCopilotV2ModeUiContract({
    mode: "describe_everything",
    flags: allModes,
    hasSourceSnapshot: false,
  });
  const similar = getTemplateCopilotV2ModeUiContract({
    mode: "similar_template",
    flags: allModes,
    hasSourceSnapshot: true,
  });
  assert.equal(describe.broadMode, true);
  assert.equal(similar.broadMode, true);
  assert.equal(describe.composerLimit, 80_000);
  assert.equal(similar.composerLimit, 80_000);
  assert.equal(describe.allowRequirementsDocument, true);
  assert.equal(similar.allowRequirementsDocument, false);
});

test("switching back to Guided retains an authoritative source-version disclosure", () => {
  const guidedAfterImport = getTemplateCopilotV2ModeUiContract({
    mode: "guided",
    flags: allModes,
    hasSourceSnapshot: true,
  });
  assert.equal(guidedAfterImport.broadMode, false);
  assert.equal(guidedAfterImport.showSourceSnapshot, true);
  assert.equal(guidedAfterImport.composerLimit, 8_000);
});

test("Enter submits except during Shift+Enter or an active Chinese IME composition", () => {
  assert.equal(shouldSubmitTemplateCopilotComposerKey({ key: "Enter", shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSubmitTemplateCopilotComposerKey({ key: "Enter", shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitTemplateCopilotComposerKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitTemplateCopilotComposerKey({ key: "a", shiftKey: false, isComposing: false }), false);
});

test("long persisted CJK messages render a bounded preview without changing the source", () => {
  const content = `${"審批".repeat(1_100)}😀`;
  const presentation = getTemplateCopilotTranscriptPresentation(content);
  assert.equal(presentation.count, 2_201);
  assert.equal(presentation.collapsed, true);
  assert.equal([...presentation.preview].length, 601);
  assert.equal(presentation.preview.endsWith("…"), true);
  assert.equal(content.endsWith("😀"), true);
});

test("all three locales provide plain-language broad and difference prompts", () => {
  const english = templateCopilotV2ModeUiCopy("en");
  const traditional = templateCopilotV2ModeUiCopy("zh-Hant");
  const simplified = templateCopilotV2ModeUiCopy("zh-Hans");
  assert.match(english.describePlaceholder, /who submits.*documents.*each step/iu);
  assert.match(english.similarPlaceholder, /keep, remove, or change/iu);
  assert.match(traditional.describePlaceholder, /誰提出申請.*文件.*每一步/u);
  assert.match(traditional.similarPlaceholder, /保留、移除或更改/u);
  assert.match(simplified.describePlaceholder, /谁提出申请.*文件.*每一步/u);
  assert.match(simplified.similarPlaceholder, /保留、删除或更改/u);
  assert.match(english.documentTooLarge, /80,000.*split/iu);
  assert.match(traditional.documentTooLarge, /80,000.*分拆/u);
  assert.match(simplified.documentTooLarge, /80,000.*拆分/u);
});
