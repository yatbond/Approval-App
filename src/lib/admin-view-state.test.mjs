import assert from "node:assert/strict";
import test from "node:test";
import { getAdminBusinessSelectionState } from "./admin-view-state.ts";

const businesses = [
  { id: "asia", name: "Asia Allied Infrastructure", departments: ["Finance"] },
  { id: "cw", name: "Chun Wo Construction", departments: ["Commercial", "Tendering"] },
];

test("uses the requested selected business when it exists", () => {
  const state = getAdminBusinessSelectionState({
    businessDirectory: businesses,
    selectedBusinessId: "cw",
  });

  assert.equal(state.selectedBusiness?.id, "cw");
  assert.equal(state.businessNameDraft, "Chun Wo Construction");
  assert.deepEqual(state.departments, ["Commercial", "Tendering"]);
});

test("falls back to the first business when selected id is missing", () => {
  const state = getAdminBusinessSelectionState({
    businessDirectory: businesses,
    selectedBusinessId: "missing",
  });

  assert.equal(state.selectedBusiness?.id, "asia");
  assert.equal(state.selectedBusinessId, "asia");
  assert.equal(state.businessNameDraft, "Asia Allied Infrastructure");
});

test("handles an empty business directory", () => {
  const state = getAdminBusinessSelectionState({
    businessDirectory: [],
    selectedBusinessId: "missing",
  });

  assert.equal(state.selectedBusiness, undefined);
  assert.equal(state.selectedBusinessId, "");
  assert.equal(state.businessNameDraft, "");
  assert.deepEqual(state.departments, []);
});
