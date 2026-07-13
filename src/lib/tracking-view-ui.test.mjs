import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const taskViewsSource = await readFile(
  new URL("../app/task-views.tsx", import.meta.url),
  "utf8",
);

test("tracking detail control jumps to path and history", () => {
  assert.match(taskViewsSource, /#tracking-path-history/);
  assert.match(taskViewsSource, /View path &amp; history/);
  assert.match(taskViewsSource, /id="tracking-path-history"/);
  assert.doesNotMatch(taskViewsSource, />\s*Open detail\s*</);
});
