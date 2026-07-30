import assert from "node:assert/strict";
import test from "node:test";
import {
  templateCopilotCommittedValueSchemas,
  templateCopilotFactIds,
} from "./template-copilot-facts.ts";
import {
  canonicalizeTemplateCopilotV2MapEditorValue,
  getTemplateCopilotV2MapEditorContract,
  validateTemplateCopilotV2MapEditorValue,
} from "./template-copilot-v2-authoritative-map-contract.ts";

const values = {
  "workflow.name": "Long purchase approval workflow name",
  "workflow.purpose":
    "A deliberately long English purpose that must remain readable next to a long CJK example: 這是一段很長的繁體中文說明，這是一段很長的简体中文说明。",
  "workflow.scope": {
    description: "Requests for purchasing",
    rules: ["Exclude emergencies"],
  },
  "request.initiator_policy": {
    mode: "directory_role",
    description: "Finance staff",
  },
  "request.fields": [
    {
      label: "Amount",
      type: "currency",
      required: true,
      options: ["HKD", "USD"],
    },
  ],
  "attachments.requirements": [
    {
      label: "Invoice",
      required: true,
      formats: ["pdf", "image"],
      stage: "Finance review",
    },
  ],
  "workflow.stages": [
    {
      label: "Manager review",
      kind: "approval",
      participant: { mode: "directory_position", value: "Manager" },
      sequence: 1,
    },
  ],
  "workflow.conditions": [
    {
      field: "Amount",
      operator: ">",
      value: 1000,
      matchingRoute: "Manager review",
      otherwiseRoute: "Finance review",
    },
  ],
  "workflow.rejection_policy": {
    action: "route_to_stage",
    route: "Requester correction",
  },
  "collaboration.policy": {
    description: "Requester corrects",
    rules: ["Keep an audit trail"],
  },
  "timing.rules": {
    defaultDueHours: 24,
    escalation: {
      description: "Escalate overdue work",
      rules: ["Notify Finance"],
    },
  },
  "visibility.policy": { description: "Participants only", rules: [] },
  "notifications.rules": [
    {
      event: "Assigned",
      recipients: ["Requester", "Approver"],
      channel: "email",
    },
  ],
  "governance.owner": "Finance",
  "governance.policies": ["Quarterly review"],
  "governance.retention": { period: "7 years", rationale: "Audit requirement" },
};

test("every typed map editor serializes into the exact fact schema without blank optional strings", () => {
  for (const factId of templateCopilotFactIds) {
    const canonical = canonicalizeTemplateCopilotV2MapEditorValue(
      factId,
      values[factId],
    );
    const parsed = templateCopilotCommittedValueSchemas[factId].parse(canonical);
    assert.deepEqual(
      templateCopilotCommittedValueSchemas[factId].parse(structuredClone(parsed)),
      parsed,
      `${factId} schema round trip`,
    );
    assert.equal(
      validateTemplateCopilotV2MapEditorValue(factId, canonical, "en").length,
      0,
      factId,
    );
  }
  const stage = canonicalizeTemplateCopilotV2MapEditorValue("workflow.stages", [
    {
      label: "Review",
      kind: "review",
      participant: { mode: "requester", value: "" },
      sequence: 2,
    },
  ]);
  assert.deepEqual(stage[0].participant, { mode: "requester" });
  const numericCondition = canonicalizeTemplateCopilotV2MapEditorValue(
    "workflow.conditions",
    values["workflow.conditions"],
  );
  assert.equal(
    typeof numericCondition[0].value,
    "number",
    "an explicitly numeric condition remains numeric",
  );
  const textCondition = canonicalizeTemplateCopilotV2MapEditorValue(
    "workflow.conditions",
    [{ ...values["workflow.conditions"][0], operator: "=", value: "001" }],
  );
  assert.equal(textCondition[0].value, "001");
  assert.equal(typeof textCondition[0].value, "string");
  assert.deepEqual(
    canonicalizeTemplateCopilotV2MapEditorValue("governance.retention", {
      period: "7 years",
      rationale: "",
    }),
    { period: "7 years" },
  );
  assert.deepEqual(
    canonicalizeTemplateCopilotV2MapEditorValue(
      "workflow.rejection_policy",
      { action: "close", route: "Stale route" },
    ),
    { action: "close" },
  );
});

test("participant resolvers and rejection routing reject invalid dependent values", () => {
  const stages = templateCopilotCommittedValueSchemas["workflow.stages"];
  const stage = (participant) => [
    { label: "Review", kind: "approval", participant, sequence: 1 },
  ];
  assert.equal(
    stages.safeParse(
      stage({ mode: "fixed_email", value: "owner@example.com" }),
    ).success,
    true,
  );
  assert.equal(
    stages.safeParse(stage({ mode: "fixed_email", value: "not-an-email" }))
      .success,
    false,
  );
  assert.equal(
    stages.safeParse(stage({ mode: "directory_position" })).success,
    false,
  );
  assert.equal(stages.safeParse(stage({ mode: "request_field" })).success, false);
  assert.equal(
    stages.safeParse(stage({ mode: "requester", value: "must-not-survive" }))
      .success,
    false,
  );
  assert.equal(
    stages.safeParse(
      stage({ mode: "unassigned_at_template", value: "must-not-survive" }),
    ).success,
    false,
  );
  assert.deepEqual(
    canonicalizeTemplateCopilotV2MapEditorValue(
      "workflow.stages",
      stage({ mode: "requester", value: "draft-only" }),
    )[0].participant,
    { mode: "requester" },
  );

  const rejection =
    templateCopilotCommittedValueSchemas["workflow.rejection_policy"];
  assert.equal(rejection.safeParse({ action: "route_to_stage" }).success, false);
  assert.equal(
    rejection.safeParse({
      action: "return_for_correction",
      route: "Review",
    }).success,
    false,
  );
  assert.equal(
    rejection.safeParse({ action: "close", route: "Review" }).success,
    false,
  );
  assert.equal(
    rejection.safeParse({ action: "route_to_stage", route: "Review" }).success,
    true,
  );
});

test("map editor transition matrix enables corrections while reserving conflict resolution", () => {
  for (const state of [
    "committed",
    "candidate",
    "conflicting",
    "unresolved",
    "unknown",
    "not_applicable",
  ]) {
    const result = getTemplateCopilotV2MapEditorContract({
      factId: "attachments.requirements",
      state,
      hasNotApplicableReason: true,
    });
    assert.equal(result.canSave, true);
    assert.equal(result.initialFocus, "first-editor-control");
    assert.equal(result.restoreFocus, "edit-trigger");
    assert.equal(
      result.canMarkUnknown,
      state !== "conflicting",
    );
    assert.equal(
      result.canMarkNotApplicable,
      state !== "conflicting",
    );
  }
  assert.equal(
    getTemplateCopilotV2MapEditorContract({
      factId: "workflow.name",
      state: "unresolved",
      hasNotApplicableReason: true,
    }).canMarkNotApplicable,
    false,
  );
  assert.equal(
    getTemplateCopilotV2MapEditorContract({
      factId: "attachments.requirements",
      state: "unresolved",
      hasNotApplicableReason: false,
    }).canMarkNotApplicable,
    false,
  );
  assert.deepEqual(
    getTemplateCopilotV2MapEditorContract({
      factId: "attachments.requirements",
      state: "candidate",
      hasNotApplicableReason: true,
      hasOpenExtractionSidecar: true,
    }),
    {
      canSave: false,
      canMarkUnknown: false,
      canMarkNotApplicable: false,
      initialFocus: "first-editor-control",
      restoreFocus: "edit-trigger",
    },
  );
  for (const locale of ["en", "zh-Hant", "zh-Hans"])
    assert.ok(
      validateTemplateCopilotV2MapEditorValue(
        "workflow.name",
        "",
        locale,
      ).join().length > 0,
    );
});
