import assert from "node:assert/strict";
import test from "node:test";
import {
  templateCopilotQualificationScenarios,
} from "../../scripts/template-copilot-qualification-scenarios.mjs";
import {
  assertTemplateCopilotV3SemanticRoundPlans,
  templateCopilotV3SemanticInterviewSlots,
  templateCopilotV3SemanticFactBatchIdsForScenario,
  templateCopilotV3SemanticFactSourceSlotsForScenario,
  templateCopilotV3SemanticRoundPlan,
  templateCopilotV3SemanticRoundPlanFingerprint,
  templateCopilotV3SemanticRoundPlans,
} from "../../scripts/template-copilot-v3-semantic-round-plans.mjs";

test("all 24 fixed plans retain every supplied section and rotate recovery probes", () => {
  assert.equal(assertTemplateCopilotV3SemanticRoundPlans(), true);
  assert.equal(Object.keys(templateCopilotV3SemanticRoundPlans).length, 24);
  assert.match(
    templateCopilotV3SemanticRoundPlanFingerprint,
    /^sha256:[0-9a-f]{64}$/u,
  );
  for (const language of ["en", "zh-Hant", "zh-Hans"]) {
    const plans = Object.values(templateCopilotV3SemanticRoundPlans)
      .filter((plan) => plan.language === language);
    assert.equal(plans.length, 8, language);
    assert.deepEqual(
      plans.map((plan) => plan.recoveryProbeSlot).sort(),
      [...templateCopilotV3SemanticInterviewSlots].sort(),
      language,
    );
  }
});

test("fixed complete-source plans expect zero questions and expose no answers", () => {
  for (const item of templateCopilotQualificationScenarios) {
    const plan = templateCopilotV3SemanticRoundPlan(item.id);
    assert.ok(plan, item.id);
    assert.deepEqual(plan.provisionalSourceSlots, plan.finalSourceSlots, item.id);
    assert.deepEqual(plan.expectedQuestionIds, [], item.id);
    assert.deepEqual(plan.eligibleAmbiguityQuestions, [], item.id);
    assert.equal(plan.questions.length, 13, item.id);
    assert.equal(
      new Set(plan.questions.map((question) => question.factId)).size,
      13,
      item.id,
    );
    const serialized = JSON.stringify(plan);
    for (const answer of Object.values(item).filter(
      (value) => typeof value === "string" && value.length > 40,
    )) {
      assert.ok(!serialized.includes(answer), item.id);
    }
  }
});

test("unknown scenario IDs have no round plan", () => {
  assert.equal(templateCopilotV3SemanticRoundPlan("EN-99"), null);
  assert.equal(
    templateCopilotV3SemanticFactSourceSlotsForScenario("EN-99"),
    null,
  );
  assert.equal(
    templateCopilotV3SemanticFactBatchIdsForScenario("EN-99"),
    null,
  );
});

test("fact recovery owns only the responsible formal batches", () => {
  for (const item of templateCopilotQualificationScenarios) {
    const batches = templateCopilotV3SemanticFactBatchIdsForScenario(item.id);
    assert.ok(batches, item.id);
    assert.deepEqual(
      batches["workflow.conditions"],
      ["routing_conditions"],
      item.id,
    );
    assert.deepEqual(
      batches["workflow.rejection_policy"],
      ["routing_rejection"],
      item.id,
    );
    assert.deepEqual(
      batches["visibility.policy"],
      ["routing_stages_participants"],
      item.id,
    );
    assert.deepEqual(
      batches["notifications.rules"],
      item.id === "EN-01"
        ? ["routing_stages_participants", "policy_context"]
        : ["policy_context"],
      item.id,
    );
  }
});

test("visibility and notification recovery uses each manifest's actual source authority", () => {
  for (const item of templateCopilotQualificationScenarios) {
    const mapping = templateCopilotV3SemanticFactSourceSlotsForScenario(
      item.id,
    );
    assert.ok(mapping, item.id);
    assert.ok(
      ["stages_participants", "visibility_notifications"].includes(
        mapping["visibility.policy"],
      ),
      item.id,
    );
    assert.ok(
      ["stages_participants", "visibility_notifications"].includes(
        mapping["notifications.rules"],
      ),
      item.id,
    );
  }
});
