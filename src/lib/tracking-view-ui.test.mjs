import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const taskViewsSource = await readFile(
  new URL("../app/task-views.tsx", import.meta.url),
  "utf8",
);

test("tracking detail control expands and collapses path history", () => {
  assert.match(taskViewsSource, /expandedHistoryTaskId/);
  assert.match(taskViewsSource, /aria-expanded=\{historyExpanded\}/);
  assert.match(taskViewsSource, /"View history"/);
  assert.match(taskViewsSource, /"Hide history"/);
  assert.match(taskViewsSource, /id="tracking-path-history"/);
  assert.doesNotMatch(taskViewsSource, />\s*Open detail\s*</);
});
