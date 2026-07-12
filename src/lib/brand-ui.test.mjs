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

test("uses the official Chun Wo palette and typography", () => {
  for (const token of ["#f7941d", "#7b791c", "#231f20", "#e6e6e6", "#8a8a8a"]) {
    assert.match(globalsSource.toLowerCase(), new RegExp(token));
  }
  assert.match(globalsSource, /Noto Sans CJK TC/);
  assert.doesNotMatch(globalsSource, /prefers-color-scheme:\s*dark/);
});

test("uses the official logo and labeled mobile navigation", () => {
  assert.match(shellSource, /src="\/chunwo-logo\.svg"/);
  assert.match(loginSource, /src="\/chunwo-logo\.svg"/);
  assert.match(shellSource, /grid-cols-5/);
  assert.doesNotMatch(shellSource, /Approval App/);
});

test("uses a light technical workflow canvas", () => {
  assert.match(canvasSource, /colorMode="light"/);
  assert.match(canvasSource, /<Background color="#d9d9d9"/);
  assert.doesNotMatch(canvasSource, /background:\s*"#0f172a"/);
});
