import assert from "node:assert/strict";
import test from "node:test";

import { doesWorkflowNumericRuleMatch } from "./workflow-numeric-rule.ts";

const numericCases = [
  ["=", "HKD 1,200.00", "1200", true],
  ["!=", "HKD 1,200.00", "1200", false],
  [">", "1,201", "1200", true],
  [">=", "1,200", "1200", true],
  ["<", "1,199", "1200", true],
  ["<=", "1,200", "1200", true],
];

for (const [operator, fieldValue, ruleValue, expected] of numericCases) {
  test(`evaluates ${operator} after normalizing formatted numbers`, () => {
    assert.equal(
      doesWorkflowNumericRuleMatch(
        { field: "amount", operator, value: ruleValue },
        { amount: fieldValue },
      ),
      expected,
    );
  });
}

test("matches contains without case sensitivity", () => {
  assert.equal(
    doesWorkflowNumericRuleMatch(
      { field: "supplier", operator: "contains", value: "CLOUD" },
      { supplier: "Northstar Cloud Limited" },
    ),
    true,
  );
});

test("preserves legacy normalization for nonempty nonnumeric equality", () => {
  assert.equal(
    doesWorkflowNumericRuleMatch(
      { field: "status", operator: "=", value: "Approved" },
      { status: "approved" },
    ),
    true,
  );
});

test("returns false for relational comparisons without two numbers", () => {
  assert.equal(
    doesWorkflowNumericRuleMatch(
      { field: "amount", operator: ">", value: "not available" },
      { amount: "pending" },
    ),
    false,
  );
});
