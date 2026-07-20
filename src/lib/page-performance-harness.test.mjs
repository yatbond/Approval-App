import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceTabIds } from "./workspace-tabs-state.ts";

const source = readFileSync("scripts/measure-page-load.mjs", "utf8");

test("page performance coverage includes every workspace tab", () => {
  workspaceTabIds.forEach((tabId) => {
    assert.equal(source.includes(`\"/?tab=${tabId}\"`), true, tabId);
  });
});

test("page performance coverage includes every public page state", () => {
  [
    '"/"',
    '"/login"',
    '"/login?mode=setup"',
    '"/logout"',
    '"/perf-probe"',
    '"/raw-probe"',
  ].forEach((route) => assert.equal(source.includes(route), true, route));
});

test("authenticated production benchmarks require the protected local token", () => {
  assert.equal(source.includes('PERF_AUTH_BYPASS === "true"'), true);
  assert.equal(source.includes("PERF_AUTH_TOKEN"), true);
  assert.equal(source.includes("must contain at least 32 characters"), true);
  assert.equal(source.includes("x-approval-local-performance-auth"), true);
});
