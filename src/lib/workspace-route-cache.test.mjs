import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceRouteSource = readFileSync(
  new URL("../app/api/workspace/route.ts", import.meta.url),
  "utf8",
);

test("workspace reads do not use a process-local payload cache", () => {
  assert.doesNotMatch(workspaceRouteSource, /workspacePayloadCache/);
  assert.match(workspaceRouteSource, /\.from\("workspace_snapshots"\)/);
});
