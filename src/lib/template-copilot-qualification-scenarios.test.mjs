import assert from "node:assert/strict";
import test from "node:test";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";

test("all live FYI qualifications name the scenario-specific recipient", () => {
  assert.equal(templateCopilotQualificationScenarios.length, 24);
  const fyiScenarios = templateCopilotQualificationScenarios.filter(
    (scenario) => scenario.expectations.requireFyi,
  );
  assert.equal(fyiScenarios.length, 16);
  for (const scenario of fyiScenarios) {
    assert.ok(
      Array.isArray(scenario.expectations.expectedFyiTerms) &&
        scenario.expectations.expectedFyiTerms.length > 0,
      `${scenario.id} must identify its intended FYI recipient.`,
    );
    const stageSource = scenario.stages.toLocaleLowerCase();
    for (const term of scenario.expectations.expectedFyiTerms) {
      assert.ok(
        stageSource.includes(term.toLocaleLowerCase()),
        `${scenario.id} FYI term must occur in its source requirement.`,
      );
    }
  }
});
