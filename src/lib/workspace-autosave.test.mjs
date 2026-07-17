import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceAutosaveDelay } from "./workspace-autosave.ts";

test("backs off failed workspace saves and caps the delay", () => {
  assert.equal(getWorkspaceAutosaveDelay(0), 30_000);
  assert.equal(getWorkspaceAutosaveDelay(1), 60_000);
  assert.equal(getWorkspaceAutosaveDelay(2), 120_000);
  assert.equal(getWorkspaceAutosaveDelay(3), 240_000);
  assert.equal(getWorkspaceAutosaveDelay(4), 300_000);
  assert.equal(getWorkspaceAutosaveDelay(20), 300_000);
});

test("normalizes invalid failure counts", () => {
  assert.equal(getWorkspaceAutosaveDelay(-2), 30_000);
  assert.equal(getWorkspaceAutosaveDelay(1.9), 60_000);
});
