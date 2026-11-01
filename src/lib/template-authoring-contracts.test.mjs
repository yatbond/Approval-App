import assert from "node:assert/strict";
import test from "node:test";
import {
  templateDraftPutCommandSchema,
  templateRequirementsDossierV1Schema,
} from "./template-authoring-contracts.ts";
import {
  getTemplateAuthoringCapability,
  templateAuthoringCapabilities,
} from "./template-authoring-capabilities.ts";
import { templateAuthoringGoldenWorkflows } from "./template-authoring-golden-workflows.ts";
import {
  createTemplateDefinitionV1,
  workflowTemplateFromDefinition,
} from "./template-authoring-definition.ts";
import { workflowTemplates } from "./mock-data.ts";

function validDossier() {
  return {
    schemaVersion: 1,
    dossierId: "dossier.purchase",
    title: "Purchase approval",
    purpose: "Approve department purchases with documented quotations.",
    businessScope: {
      businessName: "Chun Wo Construction",
      departmentName: "Procurement",
      dataClassification: "confidential",
    },
    initiation: {
      allowedInitiators: "department_members",
      initiatorRoles: [],
      initiatorEmails: [],
      requestFields: [
        {
          id: "amount",
          label: "Amount",
          type: "currency",
          required: true,
          instructions: "Enter the total request amount.",
          source: "manual",
        },
      ],
    },
    attachmentRequirements: [
      {
        id: "quotation",
        label: "Quotation",
        description: "Supplier quotation",
        required: true,
        inputMode: "upload",
        acceptedFormats: ["pdf"],
        minimumFiles: 1,
        maximumFiles: 3,
        maximumFileSizeMb: 25,
        fields: [],
        allowSharedFulfillment: false,
        requireSharedFulfillmentConfirmation: false,
      },
    ],
    stages: [
      {
        id: "submit",
        label: "Submit request",
        description: "",
        kind: "submit_request",
        attachmentRequirementIds: ["quotation"],
        blocking: true,
        assignee: { mode: "requester" },
        allowSharedFulfillment: false,
        requireSharedFulfillmentConfirmation: false,
      },
      {
        id: "approve",
        label: "Department approval",
        description: "",
        kind: "approval",
        attachmentRequirementIds: [],
        blocking: true,
        assignee: {
          mode: "directory_position",
          directoryPosition: "Department Head",
        },
        dueInHours: 48,
        acknowledgementRequired: false,
      },
    ],
    routes: [
      {
        id: "submit-to-approve",
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
      policyReferences: ["PROC-001"],
      retentionDays: 2555,
      changeReasonRequired: true,
    },
    assumptions: [],
    openQuestions: [],
  };
}

test("requirements dossier accepts a complete bounded workflow interview", () => {
  const result = templateRequirementsDossierV1Schema.safeParse(validDossier());
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
});

test("requirements dossier rejects unresolved references and unsafe loose fields", () => {
  const dossier = validDossier();
  dossier.stages[0].attachmentRequirementIds = ["invented-document"];
  dossier.actorEmail = "forged@example.com";

  const result = templateRequirementsDossierV1Schema.safeParse(dossier);

  assert.equal(result.success, false);
  assert.match(
    result.error.issues.map((issue) => issue.message).join("\n"),
    /Unknown attachment requirement|Unrecognized key/,
  );
});

test("requirements dossier enforces native form, choice, and file cardinality rules", () => {
  const dossier = validDossier();
  dossier.attachmentRequirements[0] = {
    ...dossier.attachmentRequirements[0],
    inputMode: "manual_form",
    minimumFiles: 4,
    maximumFiles: 2,
    fields: [
      {
        id: "category",
        label: "Category",
        type: "select",
        required: true,
        instructions: "",
        source: "manual",
      },
    ],
  };

  const result = templateRequirementsDossierV1Schema.safeParse(dossier);

  assert.equal(result.success, false);
  const messages = result.error.issues.map((issue) => issue.message).join("\n");
  assert.match(messages, /requires at least one option/);
  assert.match(messages, /Minimum files cannot exceed maximum files/);
});

test("draft replacement command rejects authority fields and requires concurrency controls", () => {
  const dossier = validDossier();
  const definition = {
    schemaVersion: 1,
    sourceDossierId: dossier.dossierId,
    template: {
      id: "purchase",
      name: "Purchase approval",
      business: "Chun Wo Construction",
      department: "Procurement",
      version: 1,
      isDraft: true,
      documentTypes: ["Quotation"],
      documents: [
        {
          id: "quotation",
          documentType: "Quotation",
          format: "pdf",
          required: true,
          fields: [],
        },
      ],
      languages: ["English"],
      fields: [],
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "submit",
            kind: "submit_request",
            label: "Submit request",
            x: 250,
            y: 0,
            documentIds: ["quotation"],
          },
          { id: "end", kind: "end", label: "End", x: 500, y: 0 },
        ],
        edges: [
          {
            id: "start-submit",
            sourceId: "start",
            targetId: "submit",
            label: "Start",
            branchType: "main",
          },
          {
            id: "submit-end",
            sourceId: "submit",
            targetId: "end",
            label: "Submit",
            branchType: "main",
          },
        ],
      },
    },
    generation: {
      mode: "copilot",
      generatedAt: "2026-07-25T00:00:00.000Z",
      generatedByEmail: "author@example.com",
      unresolvedQuestionIds: [],
    },
  };
  const command = {
    expectedRevision: 0,
    idempotencyKey: "draft-purchase-001",
    dossier,
    definition,
    changeReason: "Initial draft",
    publishedBy: "forged@example.com",
  };

  assert.equal(templateDraftPutCommandSchema.safeParse(command).success, false);
  delete command.publishedBy;
  assert.equal(templateDraftPutCommandSchema.safeParse(command).success, true);
  delete command.expectedRevision;
  assert.equal(templateDraftPutCommandSchema.safeParse(command).success, false);
});

test("capability matrix has stable unique ids and explicit authoring rules", () => {
  assert.equal(
    new Set(templateAuthoringCapabilities.map((item) => item.id)).size,
    templateAuthoringCapabilities.length,
  );
  assert.ok(templateAuthoringCapabilities.length >= 20);
  for (const capability of templateAuthoringCapabilities) {
    assert.ok(capability.evidence);
    assert.ok(capability.authoringRule);
  }
});

test("golden set covers 24 distinct corporate workflows and known capabilities", () => {
  assert.equal(templateAuthoringGoldenWorkflows.length, 24);
  assert.equal(
    new Set(templateAuthoringGoldenWorkflows.map((workflow) => workflow.id)).size,
    24,
  );

  const coveredCapabilities = new Set();
  for (const workflow of templateAuthoringGoldenWorkflows) {
    assert.ok(workflow.employeePrompt.length >= 50);
    assert.ok(workflow.requiredInterviewTopics.length >= 3);
    for (const capabilityId of workflow.expectedCapabilities) {
      assert.ok(
        getTemplateAuthoringCapability(capabilityId),
        `${workflow.id} references unknown capability ${capabilityId}`,
      );
      coveredCapabilities.add(capabilityId);
    }
  }

  for (const requiredCapability of [
    "linear_approval",
    "parallel_approval",
    "conditional_routing",
    "reject_return",
    "fyi",
    "file_requirements",
    "attachment_extraction",
    "template_submitters",
    "ad_hoc_contributors",
    "shared_confirmation",
    "sla_escalation",
    "visibility",
    "targeted_notifications",
  ]) {
    assert.ok(
      coveredCapabilities.has(requiredCapability),
      `golden set does not cover ${requiredCapability}`,
    );
  }
});

test("definition adapter round trips every current seed workflow through the strict contract", () => {
  for (const template of workflowTemplates) {
    const definition = createTemplateDefinitionV1({
      template,
      sourceDossierId: `seed.${template.id}`,
      mode: "manual",
      generatedAt: "2026-07-25T00:00:00.000Z",
      generatedByEmail: "template.manager@example.com",
    });
    const restored = workflowTemplateFromDefinition(definition);

    assert.equal(restored.id, template.id);
    assert.equal(restored.name, template.name);
    assert.deepEqual(restored.documents, template.documents);
    assert.deepEqual(restored.graph, definition.template.graph);
  }
});
