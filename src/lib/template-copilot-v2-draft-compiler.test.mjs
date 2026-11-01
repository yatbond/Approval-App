import assert from "node:assert/strict";
import test from "node:test";
import {
  createTemplateCopilotV2Ledger,
  templateCopilotFactIds,
} from "./template-copilot-facts.ts";
import {
  compileTemplateCopilotV2AuthoringArtifacts,
  validateTemplateCopilotV2DraftCompilation,
} from "./template-copilot-v2-draft-compiler.ts";
import { validateTemplateAuthoringDefinition } from "./template-authoring-validation.ts";

const values = {
  "workflow.name": "Purchase approval",
  "workflow.purpose": "Review purchases before commitment.",
  "workflow.scope": {
    description: "Finance purchases",
    rules: ["Emergency purchases use the emergency process."],
  },
  "request.initiator_policy": {
    mode: "any_employee",
    description: "Any employee may submit.",
  },
  "request.fields": [
    {
      label: "Amount",
      type: "currency",
      required: true,
      options: ["HKD"],
    },
  ],
  "attachments.requirements": [
    {
      id: "invoice_file",
      label: "Invoice",
      kind: "attachment",
      required: true,
      formats: ["pdf"],
      minimumQuantity: 1,
      maximumQuantity: 2,
      maximumFileSizeMb: 10,
      stage: "request_submission",
      contributorPolicy: "requester_only",
      confirmationPolicy: "none",
    },
  ],
  "workflow.stages": [
    {
      label: "Manager",
      kind: "approval",
      participant: {
        mode: "directory_position",
        value: "Manager",
      },
      sequence: 1,
    },
  ],
  "workflow.conditions": [
    {
      id: "amount_route",
      sequence: 1,
      field: "Amount",
      operator: ">",
      value: 10000,
      currency: "HKD",
      matchingRoute: "stage:Manager",
      otherwiseRoute: "complete",
    },
  ],
  "workflow.rejection_policy": {
    action: "return_for_correction",
  },
  "collaboration.policy": {
    description: "The requester corrects returned information.",
    rules: ["Keep the prior submission in history."],
  },
  "timing.rules": {
    defaultDueHours: 24,
    escalation: {
      description: "Notify the workflow owner after the due time.",
      rules: ["Escalate after 24 hours."],
    },
  },
  "visibility.policy": {
    description: "Requester and participants can view the request.",
    rules: ["Documents follow the configured workflow stage."],
  },
  "notifications.rules": [
    {
      id: "manager_assigned",
      event: "stage_assigned",
      recipients: ["current_stage_participants"],
      timing: { mode: "immediate" },
      channel: "in_app_and_email",
      visibility: "recipients_only",
      stage: "stage:Manager",
    },
  ],
  "governance.owner": "Finance",
  "governance.policies": ["Procurement policy"],
  "governance.retention": {
    period: "7 years",
    rationale: "Audit records",
  },
};

function completeLedger(locale = "en") {
  const ledger = createTemplateCopilotV2Ledger(
    {
      businessUnitId: "11111111-1111-4111-8111-111111111111",
      businessName: "Finance",
      departmentId: "22222222-2222-4222-8222-222222222222",
      departmentName: "Accounts",
      locale,
      questionLibraryVersion: "v2.2",
    },
    { enabled: true },
  );
  for (const factId of templateCopilotFactIds) {
    ledger.facts[factId] = {
      ...ledger.facts[factId],
      status: "committed",
      canonicalValue: structuredClone(values[factId]),
      provenance: [
        {
          kind: "human_editor",
          sourceId: `map:${factId}`,
          sourceMessageIds: [`message:${factId}`],
        },
      ],
      confirmation: {
        actorId: "33333333-3333-4333-8333-333333333333",
        confirmedAt: "2026-07-30T00:00:00Z",
        operation: "human_confirm",
      },
    };
  }
  return ledger;
}

const compileInput = {
  actorEmail: "author@example.com",
  generatedAt: "2026-07-30T00:00:00Z",
  dossierId: "dossier-step9",
  templateId: "template-step9",
  sourceSessionId: "44444444-4444-4444-8444-444444444444",
  sourceSessionRevision: 20,
};

test("v2 committed facts compile deterministically without a model or assumptions", () => {
  const first = compileTemplateCopilotV2AuthoringArtifacts({
    ledger: completeLedger(),
    ...compileInput,
  });
  const second = compileTemplateCopilotV2AuthoringArtifacts({
    ledger: completeLedger(),
    ...compileInput,
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.dossier.assumptions, []);
  assert.equal(first.definition.generation.mode, "copilot");
  assert.equal(
    first.definition.generation.sourceSessionId,
    compileInput.sourceSessionId,
  );
  assert.equal(first.definition.generation.sourceSessionRevision, 20);
  assert.equal(first.definition.template.name, "Purchase approval");
  assert.ok(
    first.definition.template.graph.nodes.some(
      (node) => node.label === "Manager" && node.kind === "approval",
    ),
  );
  assert.ok(
    first.definition.template.graph.nodes.some(
      (node) => node.kind === "condition",
    ),
  );
  assert.ok(
    first.definition.template.documents.some(
      (document) => document.documentType === "Invoice",
    ),
  );
  const manager = first.definition.template.graph.nodes.find(
    (node) => node.label === "Manager",
  );
  const amountCondition = first.definition.template.graph.nodes.find(
    (node) =>
      node.kind === "condition" &&
      node.conditionCases?.some(
        (conditionCase) => conditionCase.numericRule?.value === "10000",
      ),
  );
  const matchingCase = amountCondition.conditionCases.find(
    (conditionCase) => conditionCase.numericRule?.value === "10000",
  );
  const fallbackCase = amountCondition.conditionCases.find(
    (conditionCase) => conditionCase.isFallback,
  );
  assert.equal(matchingCase.numericRule.operator, ">");
  assert.equal(matchingCase.numericRule.value, "10000");
  assert.equal(matchingCase.numericRule.field, "field-amount");
  assert.deepEqual(matchingCase.targetNodeIds, [manager.id]);
  assert.deepEqual(fallbackCase.targetNodeIds, ["end"]);
  assert.equal(manager.dueInHours, 24);
  assert.equal(manager.handoffView.fieldVisibility.mode, "hidden");
  assert.equal(manager.handoffView.documentVisibility.mode, "none");
  assert.deepEqual(first.dossier.notifications.events, []);
  assert.equal(
    first.dossier.collaboration.statusVisibility,
    "process_owners",
  );
  assert.equal(
    first.dossier.attachmentRequirements[0]
      .requireSharedFulfillmentConfirmation,
    false,
  );
  assert.equal(first.dossier.initiation.allowedInitiators, "any_employee");
  assert.deepEqual(
    first.dossier.attachmentRequirements[0].acceptedFormats,
    ["pdf"],
  );
  assert.equal(first.dossier.attachmentRequirements[0].minimumFiles, 1);
  assert.equal(first.dossier.attachmentRequirements[0].maximumFiles, 2);
  assert.ok(
    first.dossier.openQuestions.some((item) =>
      item.question.includes("visibility_requires_review"),
    ),
  );
  assert.ok(
    first.dossier.openQuestions.some((item) =>
      item.question.includes("notification_delivery_requires_review"),
    ),
  );
  assert.ok(
    first.dossier.openQuestions.some((item) =>
      item.question.includes("escalation_requires_review"),
    ),
  );
  const validation = validateTemplateAuthoringDefinition(first);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.issues
      .filter((item) => item.severity === "error")
      .every((item) => item.code === "blocking_question_unanswered"),
  );
});

test("a fully representable ledger preserves exact timing, visibility, routing, and initiator semantics", () => {
  const ledger = completeLedger();
  ledger.facts["timing.rules"].canonicalValue = {
    defaultDueHours: 24,
  };
  ledger.facts["visibility.policy"].canonicalValue = {
    description: "Participants see the request and stage documents.",
    rules: [
      "status:participants",
      "fields:all",
      "documents:required_for_node",
    ],
  };
  ledger.facts["notifications.rules"] = {
    ...ledger.facts["notifications.rules"],
    status: "not_applicable",
    canonicalValue: undefined,
    notApplicableReason: "No notifications are required.",
  };
  const issues = validateTemplateCopilotV2DraftCompilation(ledger);
  assert.deepEqual(issues, []);
  const compiled = compileTemplateCopilotV2AuthoringArtifacts({
    ledger,
    ...compileInput,
  });
  assert.equal(validateTemplateAuthoringDefinition(compiled).valid, true);
  assert.deepEqual(
    compiled.definition.generation.unresolvedQuestionIds,
    [],
  );
  const manager = compiled.definition.template.graph.nodes.find(
    (node) => node.label === "Manager",
  );
  assert.equal(manager.dueInHours, 24);
  assert.equal(manager.handoffView.fieldVisibility.mode, "all");
  assert.equal(
    manager.handoffView.documentVisibility.mode,
    "required_for_node",
  );
  assert.equal(
    compiled.dossier.collaboration.statusVisibility,
    "participants",
  );
  assert.deepEqual(compiled.dossier.notifications.events, []);
});

test("compiler fails closed for uncommitted facts, incomplete forms, and non-linear routes", () => {
  const uncommitted = completeLedger();
  uncommitted.facts["workflow.purpose"] = {
    ...uncommitted.facts["workflow.purpose"],
    status: "unresolved",
    canonicalValue: undefined,
    provenance: [],
    confirmation: undefined,
  };
  assert.ok(
    validateTemplateCopilotV2DraftCompilation(uncommitted).some(
      (item) =>
        item.factId === "workflow.purpose" &&
        item.code === "fact_not_committed",
    ),
  );

  const form = completeLedger();
  form.facts["attachments.requirements"].canonicalValue = [
    {
      id: "expense_form",
      label: "Expense details",
      kind: "form",
      required: true,
      formats: [],
      minimumQuantity: 1,
      maximumQuantity: 1,
      stage: "request_submission",
      contributorPolicy: "requester_only",
      confirmationPolicy: "none",
    },
  ];
  assert.ok(
    validateTemplateCopilotV2DraftCompilation(form).some(
      (item) => item.code === "form_fields_required",
    ),
  );

  const nonlinear = completeLedger();
  nonlinear.facts["workflow.conditions"].canonicalValue[0].otherwiseRoute =
    "return_for_correction";
  assert.ok(
    validateTemplateCopilotV2DraftCompilation(nonlinear).some(
      (item) =>
        item.code === "nonlinear_condition_requires_review" &&
        item.blockingLevel === "publication",
    ),
  );
  const nonlinearDraft = compileTemplateCopilotV2AuthoringArtifacts({
    ledger: nonlinear,
    ...compileInput,
  });
  assert.ok(
    nonlinearDraft.definition.generation.unresolvedQuestionIds.length > 0,
  );
  assert.equal(
    nonlinearDraft.definition.template.graph.nodes.some(
      (node) => node.kind === "condition",
    ),
    false,
  );
});

test("computed N/A facts are excluded consistently from validation and compilation", () => {
  const ledger = completeLedger();
  ledger.facts["workflow.conditions"] = {
    ...ledger.facts["workflow.conditions"],
    status: "unresolved",
    canonicalValue: undefined,
    provenance: [],
    confirmation: undefined,
  };
  const issues = validateTemplateCopilotV2DraftCompilation(ledger, {
    inapplicableFactIds: ["workflow.conditions"],
  });
  assert.equal(
    issues.some(
      (item) =>
        item.factId === "workflow.conditions" &&
        item.code === "fact_not_committed",
    ),
    false,
  );
  const compiled = compileTemplateCopilotV2AuthoringArtifacts({
    ledger,
    ...compileInput,
    inapplicableFactIds: ["workflow.conditions"],
  });
  assert.equal(
    compiled.definition.template.graph.nodes.some(
      (node) => node.kind === "condition",
    ),
    false,
  );
});

test("every unresolved publication fact creates a conservative blocked scaffold instead of throwing", () => {
  const publicationFacts = [
    "workflow.scope",
    "attachments.requirements",
    "workflow.conditions",
    "collaboration.policy",
    "timing.rules",
    "notifications.rules",
    "governance.owner",
    "governance.policies",
    "governance.retention",
  ];
  for (const factId of publicationFacts) {
    const ledger = completeLedger();
    ledger.facts[factId] = {
      ...ledger.facts[factId],
      status: "unresolved",
      canonicalValue: undefined,
      provenance: [],
      confirmation: undefined,
    };
    const issues = validateTemplateCopilotV2DraftCompilation(ledger);
    assert.ok(
      issues.some(
        (item) =>
          item.factId === factId &&
          item.code === "fact_not_committed" &&
          item.blockingLevel === "publication",
      ),
      `${factId} remains an explicit publication blocker`,
    );
    const compiled = compileTemplateCopilotV2AuthoringArtifacts({
      ledger,
      ...compileInput,
    });
    assert.ok(
      compiled.definition.generation.unresolvedQuestionIds.length > 0,
      `${factId} produces a blocked editable scaffold`,
    );
    assert.ok(
      validateTemplateAuthoringDefinition(compiled).issues
        .filter((item) => item.severity === "error")
        .every((item) => item.code === "blocking_question_unanswered"),
      `${factId} has no unrelated executable validation failure`,
    );
  }
});

test("visibility requires exactly one token per category and never chooses through a conflict", () => {
  for (const rules of [
    [
      "status:participants",
      "fields:all",
      "fields:hidden",
      "documents:required_for_node",
    ],
    [
      "status:participants",
      "status:department",
      "fields:hidden",
      "documents:none",
    ],
    [
      "status:process_owners",
      "fields:hidden",
      "documents:none",
      "documents:all",
    ],
    [
      "status:participants",
      "fields:all",
      "fields:all",
      "documents:required_for_node",
    ],
    [
      "status:participants",
      "fields:all",
      "documents:required_for_node",
      "Only Finance may view salary",
    ],
  ]) {
    const ledger = completeLedger();
    ledger.facts["visibility.policy"].canonicalValue = {
      description: "Conflicting visibility settings.",
      rules,
    };
    const issues = validateTemplateCopilotV2DraftCompilation(ledger);
    assert.ok(
      issues.some((item) => item.code === "visibility_requires_review"),
    );
    const compiled = compileTemplateCopilotV2AuthoringArtifacts({
      ledger,
      ...compileInput,
    });
    const manager = compiled.definition.template.graph.nodes.find(
      (node) => node.label === "Manager",
    );
    assert.equal(manager.handoffView.fieldVisibility.mode, "hidden");
    assert.equal(manager.handoffView.documentVisibility.mode, "none");
    assert.equal(
      compiled.dossier.collaboration.statusVisibility,
      "process_owners",
    );
  }
});

test("directory roles compile only from an explicit lossless one-or-many mapping", () => {
  for (const [description, expected] of [
    ["roles:Procurement Manager", ["Procurement Manager"]],
    [
      "roles:Procurement Manager|Finance Officer",
      ["Procurement Manager", "Finance Officer"],
    ],
  ]) {
    const ledger = completeLedger();
    ledger.facts["request.initiator_policy"].canonicalValue = {
      mode: "directory_role",
      description,
    };
    const issues = validateTemplateCopilotV2DraftCompilation(ledger);
    assert.equal(
      issues.some((item) => item.code === "initiator_roles_require_review"),
      false,
    );
    const compiled = compileTemplateCopilotV2AuthoringArtifacts({
      ledger,
      ...compileInput,
    });
    assert.deepEqual(compiled.dossier.initiation.initiatorRoles, expected);
  }

  const prose = completeLedger();
  prose.facts["request.initiator_policy"].canonicalValue = {
    mode: "directory_role",
    description: "Procurement Manager and Finance Officer",
  };
  assert.ok(
    validateTemplateCopilotV2DraftCompilation(prose).some(
      (item) => item.code === "initiator_roles_require_review",
    ),
  );
  const blocked = compileTemplateCopilotV2AuthoringArtifacts({
    ledger: prose,
    ...compileInput,
  });
  assert.deepEqual(blocked.dossier.initiation.initiatorRoles, []);
  assert.ok(blocked.definition.generation.unresolvedQuestionIds.length > 0);
});

test("unsupported condition targets are explicit publication blockers and never gate a parallel group", () => {
  const ledger = completeLedger();
  ledger.facts["workflow.stages"].canonicalValue.push({
    label: "Finance review",
    kind: "review",
    participant: {
      mode: "directory_position",
      value: "Finance reviewer",
    },
    sequence: 1,
  });
  const issues = validateTemplateCopilotV2DraftCompilation(ledger);
  assert.ok(
    issues.some(
      (item) => item.code === "condition_targets_parallel_member",
    ),
  );
  const compiled = compileTemplateCopilotV2AuthoringArtifacts({
    ledger,
    ...compileInput,
  });
  assert.equal(
    compiled.definition.template.graph.nodes
      .filter((node) => node.kind === "condition")
      .flatMap((node) => node.conditionCases || [])
      .some(
        (conditionCase) =>
          !conditionCase.isApprovalCount &&
          !conditionCase.isFallback,
      ),
    false,
  );
});

test("parallel phases deterministically wait for every blocking approval or review", () => {
  const ledger = completeLedger();
  ledger.facts["workflow.stages"].canonicalValue.push(
    {
      label: "Finance review",
      kind: "review",
      participant: {
        mode: "directory_position",
        value: "Finance reviewer",
      },
      sequence: 1,
    },
    {
      label: "Requester FYI",
      kind: "for_information",
      participant: { mode: "requester" },
      sequence: 1,
    },
  );
  const compiled = compileTemplateCopilotV2AuthoringArtifacts({
    ledger,
    ...compileInput,
  });
  const join = compiled.definition.template.graph.nodes.find(
    (node) =>
      node.kind === "condition" &&
      node.conditionCases?.some((item) => item.isApprovalCount),
  );
  const approvalRule = join?.conditionCases?.find(
    (item) => item.isApprovalCount,
  )?.approvalRule;
  assert.equal(approvalRule.minimumApproved, 2);
  assert.equal(approvalRule.upstreamNodeIds.length, 2);
});
