import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/workflow-template-library.tsx", import.meta.url),
  "utf8",
);

test("workflow library uses a single-open full-width accordion", () => {
  assert.match(source, /expandedFamilyKey/);
  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(source, /className="space-y-2"/);
  assert.doesNotMatch(source, /lg:grid-cols-2/);
});

test("collapsed workflows disclose drafts and expanded workflows separate version roles", () => {
  assert.match(source, /Draft available/);
  assert.match(source, /heading="Active version"/);
  assert.match(source, /heading="Current draft"/);
  assert.match(source, /Version history/);
  assert.match(source, /<details/);
});

test("version notes stay concise until the user chooses to edit", () => {
  assert.match(source, /Edit note/);
  assert.match(source, /editingNoteId/);
  assert.match(source, /No version note\./);
  assert.match(source, /Save note/);
});
