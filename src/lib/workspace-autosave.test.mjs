import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWorkspaceAutosaveBytes,
  getWorkspaceAutosaveDelay,
} from "./workspace-autosave.ts";

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

test("formats autosave payload sizes for monitoring", () => {
  assert.equal(formatWorkspaceAutosaveBytes(512), "512 B");
  assert.equal(formatWorkspaceAutosaveBytes(1536), "1.5 KB");
  assert.equal(formatWorkspaceAutosaveBytes(2 * 1024 * 1024), "2.00 MB");
});
