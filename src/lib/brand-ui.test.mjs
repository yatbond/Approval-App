import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globalsSource = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const shellSource = await readFile(
  new URL("../app/workspace-shell.tsx", import.meta.url),
  "utf8",
);
const loginSource = await readFile(
  new URL("../app/login/page.tsx", import.meta.url),
  "utf8",
);
const canvasSource = await readFile(
  new URL("../app/workflow-canvas.tsx", import.meta.url),
  "utf8",
);
const layoutSource = await readFile(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const themeToggleSource = await readFile(
  new URL("../app/theme-toggle.tsx", import.meta.url),
  "utf8",
);

test("uses the official Chun Wo palette and typography", () => {
  for (const token of ["#f7941d", "#7b791c", "#231f20", "#e6e6e6", "#8a8a8a"]) {
    assert.match(globalsSource.toLowerCase(), new RegExp(token));
  }
  assert.match(globalsSource, /Noto Sans CJK TC/);
  assert.match(globalsSource, /html\[data-theme="dark"\]/);
});

test("uses the official logo and labeled mobile navigation", () => {
  assert.match(shellSource, /src="\/chunwo-logo\.svg"/);
  assert.match(loginSource, /src="\/chunwo-logo\.svg"/);
  assert.match(shellSource, /grid-cols-5/);
  assert.doesNotMatch(shellSource, /Approval App/);
});

test("supports a persistent dark theme across login, workspace, and canvas", () => {
  assert.match(layoutSource, /appThemeStorageKey/);
  assert.match(layoutSource, /prefers-color-scheme: dark/);
  assert.match(themeToggleSource, /Switch to \$\{switchingTo\} mode/);
  assert.match(shellSource, /<ThemeToggle/);
  assert.match(loginSource, /<ThemeToggle/);
  assert.match(canvasSource, /colorMode=\{theme\}/);
  assert.match(canvasSource, /theme === "dark" \? "#4b4647" : "#d9d9d9"/);
  assert.doesNotMatch(canvasSource, /background:\s*"#0f172a"/);
});

test("keeps sign out as the rightmost header action", () => {
  const newRequestIndex = shellSource.indexOf('title="Create a new approval request"');
  const signOutIndex = shellSource.indexOf('title="Sign out"');

  assert.ok(newRequestIndex >= 0);
  assert.ok(signOutIndex > newRequestIndex);
});

test("keeps intermediate-width panels readable", async () => {
  const taskViewsSource = await readFile(
    new URL("../app/task-views.tsx", import.meta.url),
    "utf8",
  );
  const uploadViewSource = await readFile(
    new URL("../app/upload-view.tsx", import.meta.url),
    "utf8",
  );
  const runtimePanelSource = await readFile(
    new URL("../app/workflow-runtime-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(taskViewsSource, /minmax\(min\(100%,24rem\),1fr\)/);
  assert.match(taskViewsSource, /2xl:grid-cols-\[360px_minmax\(0,1fr\)_320px\]/);
  assert.match(taskViewsSource, /\[overflow-wrap:anywhere\]/);
  assert.match(uploadViewSource, /minmax\(min\(100%,10rem\),1fr\)/);
  assert.match(runtimePanelSource, /validation-warning/);
  assert.match(runtimePanelSource, /validation-error/);
  assert.match(runtimePanelSource, /validation-ready/);
});
