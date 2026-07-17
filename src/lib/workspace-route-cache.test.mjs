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

test("workspace writes short-circuit completed identical snapshots", () => {
  assert.match(workspaceRouteSource, /\.select\("snapshot_hash"\)/);
  assert.match(
    workspaceRouteSource,
    /snapshotMetadata\?\.snapshot_hash === incomingSnapshotHash/,
  );
  assert.match(workspaceRouteSource, /unchanged: true/);
  assert.match(workspaceRouteSource, /snapshot_hash: null/);
  assert.match(workspaceRouteSource, /saveWorkspaceSnapshotHash/);
});
