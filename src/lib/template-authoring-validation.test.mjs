import assert from "node:assert/strict";
import test from "node:test";
import { createTemplateDefinitionV1 } from "./template-authoring-definition.ts";
import {
  createTemplateFamilyCommandSchema,
  reviewTemplatePublishCommandSchema,
} from "./template-authoring-api-contracts.ts";
import { workflowTemplates } from "./mock-data.ts";
import {
  diffTemplateDefinitions,
  simulateTemplateAuthoringDefinition,
  validateTemplateAuthoringDefinition,
} from "./template-authoring-validation.ts";

function dossier(overrides = {}) {
  return {
    schemaVersion: 1,
    dossierId: "dossier.finance.invoice",
    title: "Finance invoice approval",
    purpose: "Review invoices and route them through Finance approval.",
    businessScope: {
      businessName: "Asia Allied Infrastructure",
      departmentName: "Finance",
      dataClassification: "confidential",
    },
    initiation: {
      allowedInitiators: "department_members",
      initiatorRoles: [],
      initiatorEmails: [],
      requestFields: [],
    },
    attachmentRequirements: [],
    stages: [
      {
        id: "submit",
        label: "Submit request",
        description: "",
        kind: "submit_request",
        attachmentRequirementIds: [],
        blocking: true,
        assignee: { mode: "requester" },
        allowSharedFulfillment: false,
        requireSharedFulfillmentConfirmation: false,
      },
      {
        id: "approve",
        label: "Finance approval",
        description: "",
        kind: "approval",
        attachmentRequirementIds: [],
        blocking: true,
        assignee: { mode: "unassigned_at_template" },
        dueInHours: 48,
        acknowledgementRequired: false,
      },
    ],
    routes: [
      {
        id: "submit-approve",
        sourceStageId: "submit",
        targetStageId: "approve",
        label: "Submit",
        type: "main",
        blocking: true,
      },
    ],
    collaboration: {
      templateDefinedSubmitters: false,
      adHocContributors: true,
      contributorDueDates: true,
      statusVisibility: "participants",
      confirmationPolicy: "first_decision_wins",
      rejectionCreatesCorrectionLoop: true,
    },
    notifications: {
      strategy: "important_changes_only",
      recipients: "directly_involved",
      events: ["assigned", "rejected", "completed"],
    },
    governance: {
      publishMode: "template_manager_review",
      reviewerEmails: [],
      policyReferences: ["FIN-AP-001"],
      retentionDays: 2555,
      changeReasonRequired: true,
    },
    assumptions: [],
    openQuestions: [],
    ...overrides,
  };
}

function definition() {
  return createTemplateDefinitionV1({
    template: workflowTemplates[0],
    sourceDossierId: "dossier.finance.invoice",
    mode: "manual",
    generatedAt: "2026-07-25T00:00:00.000Z",
    generatedByEmail: "manager@example.com",
  });
}

test("coded validation accepts a complete dossier and current executable workflow", () => {
  const result = validateTemplateAuthoringDefinition({
    dossier: dossier(),
    definition: definition(),
  });

  assert.equal(result.errorCount, 0, JSON.stringify(result));
  assert.equal(result.valid, true);
});

test("coded validation blocks unanswered critical questions and unknown ledger ids", () => {
  const nextDefinition = definition();
  nextDefinition.generation.unresolvedQuestionIds = ["missing-question"];
  const result = validateTemplateAuthoringDefinition({
    dossier: dossier({
      openQuestions: [
        {
          id: "approval-owner",
          question: "Who owns final approval?",
          importance: "blocking",
        },
      ],
    }),
    definition: nextDefinition,
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.issues.some((issue) => issue.code === "blocking_question_unanswered"),
  );
  assert.ok(
    result.issues.some((issue) => issue.code === "unknown_unresolved_question"),
  );
});

test("simulation returns coded validation and deterministic route ids", () => {
  const result = simulateTemplateAuthoringDefinition({
    dossier: dossier(),
    definition: definition(),
  });

  assert.equal(result.validation.valid, true);
  assert.ok(result.route.currentNodeIds.length >= 1);
  assert.ok(result.route.traversedNodeIds.length >= 1);
});

test("definition diff is deterministic, bounded, and uses JSON paths", () => {
  const before = definition();
  const after = structuredClone(before);
  after.template.name = "Updated invoice approval";
  after.template.graph.nodes[0].label = "Begin";

  const result = diffTemplateDefinitions(before, after);

  assert.equal(result.changed, true);
  assert.equal(result.changeCount, 2);
  assert.deepEqual(
    result.changes.map((change) => change.path),
    ["$.template.graph.nodes[0].label", "$.template.name"],
  );
});

test("authoring command schemas reject actors, publication state, and mismatched dossiers", () => {
  const command = {
    familyKey: "finance.invoice",
    name: "Finance invoice approval",
    businessUnitId: "11111111-1111-4111-8111-111111111111",
    departmentId: "22222222-2222-4222-8222-222222222222",
    dossier: dossier(),
    definition: definition(),
    changeReason: "Initial proposal",
    idempotencyKey: "finance-invoice-001",
    actorId: "33333333-3333-4333-8333-333333333333",
    isPublished: true,
  };

  assert.equal(createTemplateFamilyCommandSchema.safeParse(command).success, false);
  delete command.actorId;
  delete command.isPublished;
  assert.equal(createTemplateFamilyCommandSchema.safeParse(command).success, true);
  command.definition.sourceDossierId = "different-dossier";
  assert.equal(createTemplateFamilyCommandSchema.safeParse(command).success, false);
});

test("review schema requires a human explanation for rejection or changes", () => {
  assert.equal(
    reviewTemplatePublishCommandSchema.safeParse({
      decision: "request_changes",
      reviewNote: "",
      idempotencyKey: "review-change-001",
    }).success,
    false,
  );
  assert.equal(
    reviewTemplatePublishCommandSchema.safeParse({
      decision: "approve",
      reviewNote: "",
      idempotencyKey: "review-approve-001",
    }).success,
    true,
  );
});
