import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const trackingViewSource = await readFile(
  new URL("../app/tracking-view.tsx", import.meta.url),
  "utf8",
);
const taskDetailSource = await readFile(
  new URL("../app/task-detail-panels.tsx", import.meta.url),
  "utf8",
);

test("tracking detail control expands and collapses path history", () => {
  assert.match(trackingViewSource, /expandedHistoryTaskId/);
  assert.match(trackingViewSource, /aria-expanded=\{historyExpanded\}/);
  assert.match(trackingViewSource, /"View history"/);
  assert.match(trackingViewSource, /"Hide history"/);
  assert.match(taskDetailSource, /id="tracking-path-history"/);
  assert.doesNotMatch(trackingViewSource, />\s*Open detail\s*</);
});
