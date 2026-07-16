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
const formLibrarySource = await readFile(
  new URL("../app/form-library.tsx", import.meta.url),
  "utf8",
);
const adminViewSource = await readFile(
  new URL("../app/admin-view.tsx", import.meta.url),
  "utf8",
);
const uploadDraftControlsSource = await readFile(
  new URL("../app/upload-draft-controls.tsx", import.meta.url),
  "utf8",
);
const workflowViewSource = await readFile(
  new URL("../app/workflow-view.tsx", import.meta.url),
  "utf8",
);
const darkLogoSource = await readFile(
  new URL("../../public/chunwo-logo-dark.svg", import.meta.url),
  "utf8",
);

test("uses the official Chun Wo palette and typography", () => {
  for (const token of ["#f7941d", "#7b791c", "#231f20", "#e6e6e6", "#8a8a8a"]) {
    assert.match(globalsSource.toLowerCase(), new RegExp(token));
  }
  assert.match(globalsSource, /Noto Sans CJK TC/);
  assert.match(globalsSource, /html\[data-theme="dark"\]/);
});

test("keeps neutral text and orange actions readable in light mode", async () => {
  assert.match(
    globalsSource,
    /@custom-variant dark \(&:where\(\[data-theme="dark"\]/,
  );
  assert.match(
    globalsSource,
    /html:not\(\[data-theme="dark"\]\) \.text-neutral-900[\s\S]*color: #231f20/,
  );
  assert.match(
    globalsSource,
    /html:not\(\[data-theme="dark"\]\) \.text-neutral-500[\s\S]*color: #666162/,
  );
  assert.match(
    globalsSource,
    /html:not\(\[data-theme="dark"\]\) \.text-\\\[\\#8a8a8a\\\][\s\S]*color: #666162/,
  );

  for (const path of [
    "../app/form-library.tsx",
    "../app/upload-view.tsx",
    "../app/workflow-view.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /bg-\[\#f7941d\][^"\n]*text-white/);
  }
});

test("keeps dark mode foregrounds and placeholders readable", () => {
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] \.text-neutral-400[\s\S]*color: #aaa4a5 !important/,
  );
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] \.text-emerald-100[\s\S]*color: #ffd7aa !important/,
  );
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] \.text-sky-100[\s\S]*color: #e5e69e !important/,
  );
  assert.match(globalsSource, /::placeholder[\s\S]*color: #666162/);
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] ::placeholder[\s\S]*color: #aaa4a5/,
  );
});

test("labels editable admin fields and saved-draft actions", () => {
  assert.match(adminViewSource, /aria-label="Business name"/);
  assert.match(adminViewSource, /aria-label=\{`Department name \$\{index \+ 1\}`\}/);
  assert.match(adminViewSource, /aria-label="Test email recipient"/);
  assert.match(
    uploadDraftControlsSource,
    /aria-label=\{`Open saved draft \$\{draft\.title\}`\}/,
  );
  assert.match(shellSource, /size-10 shrink-0 items-center/);
});

test("keeps form-library inputs mounted while their labels change", () => {
  assert.match(formLibrarySource, /key=\{`mapped-value-\$\{index\}`\}/);
  assert.match(formLibrarySource, /key=\{`mapped-attachment-\$\{index\}`\}/);
  assert.doesNotMatch(formLibrarySource, /key=\{`\$\{field\.name\}-\$\{index\}`\}/);
});

test("uses the official logo and labeled mobile navigation", () => {
  assert.match(shellSource, /src="\/chunwo-logo\.svg"/);
  assert.match(shellSource, /src="\/chunwo-logo-dark\.svg"/);
  assert.match(loginSource, /src="\/chunwo-logo\.svg"/);
  assert.match(loginSource, /src="\/chunwo-logo-dark\.svg"/);
  assert.match(darkLogoSource, /\.a\{fill:#ffffff;\}/);
  assert.match(shellSource, /sm:grid-cols-6/);
  assert.doesNotMatch(shellSource, /Approval App/);
});

test("uses black workflow and logo surfaces in dark mode", () => {
  assert.match(workflowViewSource, /data-workflow-publish-bar/);
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] \[data-workflow-publish-bar\][\s\S]*background-color: #000000/,
  );
  assert.match(
    globalsSource,
    /html\[data-theme="dark"\] \[data-brand-lockup\][\s\S]*background-color: #000000/,
  );
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

test("explains the mobile canvas restriction accessibly", async () => {
  const workflowViewSource = await readFile(
    new URL("../app/workflow-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workflowViewSource, /aria-label="Canvas \(desktop only\)"/);
  assert.match(
    workflowViewSource,
    /title="Canvas editing is available on tablet and desktop screens\."/,
  );
});

test("keeps sign out as the rightmost header action", () => {
  const newRequestIndex = shellSource.indexOf('title="Create a new approval request"');
  const signOutIndex = shellSource.indexOf('title="Sign out"');

  assert.ok(newRequestIndex >= 0);
  assert.ok(signOutIndex > newRequestIndex);
});

test("header notifications open a user-actionable menu", () => {
  assert.match(shellSource, /title="Open notifications"/);
  assert.match(shellSource, /aria-label="Notifications"/);
  assert.match(shellSource, /Mark all read/);
  assert.match(shellSource, /notification\.requestId/);
});

test("calls actionable work Inbox while preserving the queue route", async () => {
  const queueViewSource = await readFile(
    new URL("../app/queue-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shellSource, /queue: \{ label: "Inbox"/);
  assert.match(queueViewSource, />Inbox</);
  assert.match(queueViewSource, />Inbox is empty</);
  assert.match(shellSource, /href=\{`\/\?tab=\$\{tab\.id\}`\}/);
});

test("keeps intermediate-width panels readable", async () => {
  const queueViewSource = await readFile(
    new URL("../app/queue-view.tsx", import.meta.url),
    "utf8",
  );
  const taskDetailSource = await readFile(
    new URL("../app/task-detail-panels.tsx", import.meta.url),
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

  assert.match(taskDetailSource, /minmax\(min\(100%,24rem\),1fr\)/);
  assert.match(queueViewSource, /2xl:grid-cols-\[360px_minmax\(0,1fr\)_320px\]/);
  assert.match(taskDetailSource, /\[overflow-wrap:anywhere\]/);
  assert.match(uploadViewSource, /minmax\(min\(100%,10rem\),1fr\)/);
  assert.match(runtimePanelSource, /validation-warning/);
  assert.match(runtimePanelSource, /validation-error/);
  assert.match(runtimePanelSource, /validation-ready/);
});

test("explains workflow testing without exposing stale live requests", async () => {
  const source = await readFile(
    new URL("../app/workflow-runtime-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Test this workflow/);
  assert.match(source, /Tester email/);
  assert.match(source, /Every workflow role is assigned to the tester/);
  assert.match(source, /It does not change a live request/);
  assert.doesNotMatch(source, /Test controls/);
  assert.doesNotMatch(source, /selectedRuntimeTaskId/);
});

test("keeps request progress out of the workflow template canvas", async () => {
  const workflowViewSource = await readFile(
    new URL("../app/workflow-view.tsx", import.meta.url),
    "utf8",
  );
  const runtimePanelSource = await readFile(
    new URL("../app/workflow-runtime-panel.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(canvasSource, /runtimeTask/);
  assert.doesNotMatch(canvasSource, /formatRuntimeStatus/);
  assert.doesNotMatch(
    workflowViewSource,
    /<WorkflowCanvas\s*\n\s*graph=\{workflowGraph\}\s*\n\s*runtimeTask=/,
  );
  assert.doesNotMatch(runtimePanelSource, />\s*FYI sent\s*</);
});
