import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/template-copilot.tsx", import.meta.url), "utf8");
const interactionSource = await readFile(new URL("./template-copilot-v2-step4.ts", import.meta.url), "utf8");
const browserSource = await readFile(new URL("../../scripts/test-template-copilot-v2-step4-browser.mjs", import.meta.url), "utf8");

test("Step 4 UI keeps examples and suggestions outside the answer mutation path", () => {
  assert.match(interactionSource, /Example only — not a recommendation/);
  assert.match(interactionSource, /Show another example/);
  assert.match(interactionSource, /Why are you asking\?/);
  assert.match(interactionSource, /Something else/);
  assert.match(source, /setDraft\(suggestion\.text\)/);
  assert.doesNotMatch(source, /submitV2\(\{ kind: "text", text: suggestion\.text \}/);
});

test("Step 4 choice selection is accessible and requires a separate Continue before mutation", () => {
  assert.match(source, /aria-pressed=\{v2Interaction\?\.requiresExplicitContinue/);
  assert.match(source, /v2Interaction\?\.requiresExplicitContinue && <button/);
  assert.match(source, /\{v2Interaction\.labels\.continue\}/);
  assert.match(source, /min-h-11/);
  assert.match(source, /aria-expanded=\{questionHelpVisible\}/);
  assert.match(source, /maxLength=\{answerLimit\}/);
});

test("Step 4 stacks its full-width blocks and keeps browser coverage for keyboard, mobile, and themes", () => {
  assert.match(source, /className="mt-3 space-y-3"/);
  assert.match(source, /className="flex w-full flex-wrap items-end gap-2"/);
  for (const marker of ["keyboard.press(\"Tab\")", "keyboard.press(\"Enter\")", "keyboard.press(\"Space\")", "assertMobileTouchAndLayout", "fullAxeScan", "dataset.theme = nextTheme", "new AxeBuilder({ page }).analyze()", "observeReadOnly", "networkQuiet", "assertVerticalStep4Layout"]) {
    assert.ok(browserSource.includes(marker), `browser contract is missing ${marker}`);
  }
  assert.doesNotMatch(browserSource, /withRules\(/, "theme accessibility uses a complete axe scan rather than a single-rule scan");
  assert.match(browserSource, /"opening help"/);
  assert.match(browserSource, /"rotating an example"/);
});
