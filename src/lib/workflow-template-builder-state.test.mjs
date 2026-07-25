import assert from "node:assert/strict";
import test from "node:test";
import {
  getDepartmentForBusiness,
  getWorkflowTemplateBuilderBusinessState,
} from "./workflow-template-builder-state.ts";

const businesses = [
  {
    id: "asia",
    name: "Asia Allied Infrastructure",
    departments: ["Finance", "Human Resources"],
  },
  {
    id: "allalign",
    name: "Allalign",
    departments: [],
  },
];

test("selects the requested business and exposes its departments", () => {
  const state = getWorkflowTemplateBuilderBusinessState({
    businessDirectory: businesses,
    businessId: "asia",
  });

  assert.equal(state.selectedBusiness?.id, "asia");
  assert.equal(state.usesDepartmentSelect, true);
  assert.deepEqual(state.departmentOptions, ["Finance", "Human Resources"]);
});

test("falls back to the first business when selected id is missing", () => {
  const state = getWorkflowTemplateBuilderBusinessState({
    businessDirectory: businesses,
    businessId: "missing",
  });

  assert.equal(state.selectedBusiness?.id, "asia");
  assert.equal(state.selectedBusinessId, "asia");
});

test("uses free text department input when business has no department options", () => {
  const state = getWorkflowTemplateBuilderBusinessState({
    businessDirectory: businesses,
    businessId: "allalign",
  });

  assert.equal(state.selectedBusiness?.id, "allalign");
  assert.equal(state.usesDepartmentSelect, false);
  assert.deepEqual(state.departmentOptions, []);
});

test("returns the first department for a changed business", () => {
  assert.equal(getDepartmentForBusiness(businesses, "asia"), "Finance");
  assert.equal(getDepartmentForBusiness(businesses, "allalign"), "");
  assert.equal(getDepartmentForBusiness(businesses, "missing"), "");
});
