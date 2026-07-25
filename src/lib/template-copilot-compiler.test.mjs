import assert from "node:assert/strict";
import test from "node:test";
import { compileTemplateCopilotPlan } from "./template-copilot-compiler.ts";
import {
  applyTemplateCopilotPlanRepair,
  templateCopilotPlanV1Schema,
} from "./template-copilot-plan.ts";
import {
  simulateTemplateAuthoringDefinition,
  validateTemplateAuthoringDefinition,
} from "./template-authoring-validation.ts";

const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Example Business",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Procurement Operations",
  actorEmail: "template.manager@example.com",
  generatedAt: "2026-07-26T08:00:00.000Z",
  dossierId: "dossier-qualification",
  templateId: "template-qualification",
};

test("deterministically compiles a multilingual conditional parallel workflow", () => {
  const plan = qualificationPlan("zh-Hant");
  const first = compileTemplateCopilotPlan({ ...scope, plan });
  const second = compileTemplateCopilotPlan({ ...scope, plan });

  assert.deepEqual(first, second);
  assert.equal(first.dossier.title, "高額採購審批");
  assert.deepEqual(first.definition.template.languages, [
    "Traditional Chinese",
    "English",
  ]);
  assert.ok(
    first.definition.template.graph.nodes.some(
      (node) => node.kind === "condition",
    ),
  );
  assert.ok(
    first.definition.template.graph.edges.some(
      (edge) => edge.branchType === "rejected",
    ),
  );
  assert.ok(
    first.definition.template.graph.edges.some(
      (edge) => edge.branchType === "for_information" && edge.blocking === false,
    ),
  );
  assert.ok(
    first.definition.template.graph.nodes.some(
      (node) =>
        node.handoffView?.fieldVisibility?.mode === "selected" &&
        node.handoffView?.documentVisibility?.mode === "selected",
    ),
  );

  const validation = validateTemplateAuthoringDefinition(first);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  const simulation = simulateTemplateAuthoringDefinition(first);
  assert.equal(simulation.validation.valid, true);
  assert.ok(simulation.route.currentNodeIds.length >= 1);
});

test("compiler repairs structural omissions without inventing identities", () => {
  const plan = qualificationPlan("en");
  plan.requestFields = [];
  plan.attachments[0].fields = [];
  plan.attachments[0].minimumFiles = 0;
  plan.phases[0].stages[0].participant = {
    mode: "fixed_email",
    email: "",
    directoryPosition: "",
    requestFieldLabel: "",
  };

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });
  assert.equal(
    artifacts.dossier.initiation.requestFields[0].label,
    "Request summary",
  );
  assert.equal(artifacts.dossier.attachmentRequirements[0].minimumFiles, 1);
  assert.equal(
    artifacts.dossier.attachmentRequirements[0].fields[0].label,
    "Details",
  );
  const firstApproval = artifacts.dossier.stages.find(
    (stage) => stage.kind === "approval",
  );
  assert.equal(firstApproval?.assignee.mode, "unassigned_at_template");
  assert.equal(validateTemplateAuthoringDefinition(artifacts).valid, true);
});

test("compiler preserves completion notifications as nonblocking FYI handoffs", () => {
  const plan = qualificationPlan("en");
  plan.phases = plan.phases.filter((phase) =>
    phase.stages.every((stage) => stage.kind !== "for_information"),
  );

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });
  const completionNotice = artifacts.definition.template.graph.nodes.find(
    (node) =>
      node.kind === "for_information" &&
      node.label === "Completion notification",
  );

  assert.equal(completionNotice?.assigneeName, "Requester");
  assert.deepEqual(completionNotice?.documentIds, []);
  assert.equal(
    completionNotice?.handoffView?.documentVisibility?.mode,
    "none",
  );
  assert.ok(
    artifacts.definition.template.graph.edges.some(
      (edge) =>
        edge.targetId === completionNotice?.id &&
        edge.branchType === "for_information" &&
        edge.blocking === false,
    ),
  );
  assert.equal(validateTemplateAuthoringDefinition(artifacts).valid, true);
});

test("compiler normalizes grouped numeric condition values", () => {
  const plan = qualificationPlan("en");
  plan.phases[1].condition.value = "2,000,000";

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });
  const condition = artifacts.definition.template.graph.nodes.find(
    (node) => node.label === "High value",
  );

  assert.equal(condition?.conditionCases?.[0]?.numericRule?.value, "2000000");
  assert.ok(
    artifacts.dossier.stages.some(
      (stage) =>
        stage.kind === "condition" &&
        stage.description.includes("2000000"),
    ),
  );
});

test("compiler routes a conditional FYI only through its matched condition case", () => {
  const plan = qualificationPlan("en");
  const noticePhase = plan.phases.find((phase) =>
    phase.stages.some((stage) => stage.kind === "for_information"),
  );
  assert.ok(noticePhase);
  noticePhase.condition = {
    label: "Board notification threshold",
    fieldLabel: "Total amount",
    operator: ">",
    value: "2,000,000",
    join: "and",
  };

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });
  const fyi = artifacts.definition.template.graph.nodes.find(
    (node) => node.kind === "for_information",
  );
  const condition = artifacts.definition.template.graph.nodes.find(
    (node) => node.label === "Board notification threshold",
  );
  const matchedCase = condition?.conditionCases?.find(
    (conditionCase) => !conditionCase.isFallback,
  );
  const fallbackCase = condition?.conditionCases?.find(
    (conditionCase) => conditionCase.isFallback,
  );

  assert.ok(fyi);
  assert.equal(matchedCase?.numericRule?.value, "2000000");
  assert.equal(matchedCase?.targetNodeIds.includes(fyi.id), true);
  assert.equal(fallbackCase?.targetNodeIds.includes(fyi.id), false);
  assert.ok(
    artifacts.definition.template.graph.edges.some(
      (edge) =>
        edge.sourceId === condition?.id &&
        edge.targetId === fyi.id &&
        edge.branchType === "condition" &&
        edge.blocking === false,
    ),
  );
  const validation = validateTemplateAuthoringDefinition(artifacts);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
});

test("compiler enforces conditional attachments through a routed submit stage", () => {
  const plan = qualificationPlan("en");
  plan.attachments[1].required = false;
  plan.attachments[1].minimumFiles = 0;
  plan.attachments[1].requiredWhen = {
    label: "High-value quotation required",
    fieldLabel: "Total amount",
    operator: ">=",
    value: "50,000",
    join: "and",
  };

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });
  const initialSubmit = artifacts.definition.template.graph.nodes.find(
    (node) => node.id === "submit-request",
  );
  const conditionalSubmit = artifacts.definition.template.graph.nodes.find(
    (node) =>
      node.kind === "submit_request" &&
      node.id !== "submit-request" &&
      node.documentIds?.includes("attachment-supplier-quotation"),
  );
  const condition = artifacts.definition.template.graph.nodes.find(
    (node) => node.label === "High-value quotation required",
  );
  const quotation = artifacts.definition.template.documents.find(
    (document) => document.id === "attachment-supplier-quotation",
  );

  assert.equal(
    initialSubmit?.documentIds?.includes("attachment-supplier-quotation"),
    false,
  );
  assert.ok(conditionalSubmit);
  assert.equal(quotation?.required, true);
  assert.equal(condition?.conditionCases?.[0]?.numericRule?.value, "50000");
  const validation = validateTemplateAuthoringDefinition(artifacts);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues));
});

test("model questions remain visible without gaining executable blocking authority", () => {
  const plan = qualificationPlan("en");
  plan.openQuestions = [
    {
      question: "Which directory position should receive Finance approval?",
      importance: "blocking",
      answer: "",
    },
  ];

  const artifacts = compileTemplateCopilotPlan({ ...scope, plan });

  assert.deepEqual(artifacts.dossier.openQuestions, [
    {
      id: "question-which-directory-position-should-receive-finance-approval",
      question: "Which directory position should receive Finance approval?",
      importance: "important",
    },
  ]);
  assert.deepEqual(artifacts.definition.generation.unresolvedQuestionIds, [
    "question-which-directory-position-should-receive-finance-approval",
  ]);
  assert.equal(validateTemplateAuthoringDefinition(artifacts).valid, true);
});

test("compiler preserves exact employee requirement wording for traceability", () => {
  const plan = qualificationPlan("zh-Hant");
  const sourceRequirement =
    "若差異超過百分之五，或核實金額超過港幣五百萬元，必須增加審批。";

  const artifacts = compileTemplateCopilotPlan({
    ...scope,
    plan,
    sourceRequirements: [sourceRequirement],
  });

  assert.ok(
    artifacts.dossier.assumptions.some(
      (assumption) =>
        assumption.status === "confirmed" &&
        assumption.statement === sourceRequirement,
    ),
  );
});

test("plan contract rejects executable graph authority from the model", () => {
  const plan = qualificationPlan("zh-Hans");
  const result = templateCopilotPlanV1Schema.safeParse({
    ...plan,
    graph: {
      nodes: [{ id: "model-controlled" }],
      edges: [],
    },
  });
  assert.equal(result.success, false);
});

test("compact coverage repair replaces only audited plan properties", () => {
  const plan = qualificationPlan("en");
  const repairedFields = [
    ...plan.requestFields,
    field("Cost centre", "text"),
  ];
  const repaired = applyTemplateCopilotPlanRepair(plan, {
    schemaVersion: 1,
    title: null,
    purpose: null,
    dataClassification: null,
    allowedInitiators: null,
    initiatorRoles: null,
    initiatorEmails: null,
    requestFields: repairedFields,
    attachments: null,
    phases: null,
    collaboration: null,
    notifications: null,
    governance: null,
    assumptions: null,
    openQuestions: null,
  });

  assert.deepEqual(repaired.requestFields, repairedFields);
  assert.deepEqual(repaired.attachments, plan.attachments);
  assert.deepEqual(repaired.phases, plan.phases);
  assert.notEqual(repaired, plan);
});

function qualificationPlan(locale) {
  const traditional = locale === "zh-Hant";
  const simplified = locale === "zh-Hans";
  const text = (en, zhHant, zhHans) =>
    traditional ? zhHant : simplified ? zhHans : en;
  return templateCopilotPlanV1Schema.parse({
    schemaVersion: 1,
    locale,
    title: text("High-value purchase approval", "高額採購審批", "高额采购审批"),
    purpose: text(
      "Approve purchases and preserve a correction path.",
      "審批採購並保留補正路徑。",
      "审批采购并保留补正路径。",
    ),
    dataClassification: "confidential",
    allowedInitiators: "any_employee",
    initiatorRoles: [],
    initiatorEmails: [],
    requestFields: [
      field(text("Purpose", "用途", "用途"), "long_text"),
      field(text("Total amount", "總金額", "总金额"), "currency"),
      {
        ...field(text("Goods or services", "貨品或服務", "货品或服务"), "select"),
        options: text(
          ["Goods", "Services"],
          ["貨品", "服務"],
          ["货品", "服务"],
        ),
      },
    ],
    attachments: [
      {
        label: text("Justification form", "理據表", "理由表"),
        description: text(
          "Business justification.",
          "業務理據。",
          "业务理由。",
        ),
        required: true,
        inputMode: "manual_form",
        acceptedFormats: ["text"],
        minimumFiles: 1,
        maximumFiles: 1,
        maximumFileSizeMb: 10,
        fields: [field(text("Reason", "原因", "原因"), "long_text")],
        allowSharedFulfillment: true,
        requireSharedFulfillmentConfirmation: true,
        requiredWhen: null,
      },
      {
        label: text("Supplier quotation", "供應商報價", "供应商报价"),
        description: text(
          "Quotation evidence.",
          "報價證明。",
          "报价证明。",
        ),
        required: true,
        inputMode: "upload",
        acceptedFormats: ["pdf"],
        minimumFiles: 1,
        maximumFiles: 3,
        maximumFileSizeMb: 20,
        fields: [],
        allowSharedFulfillment: true,
        requireSharedFulfillmentConfirmation: true,
        requiredWhen: null,
      },
    ],
    phases: [
      {
        label: text("Manager review", "經理審批", "经理审批"),
        execution: "sequential",
        condition: null,
        stages: [
          stage(text("Department manager", "部門經理", "部门经理"), "approval"),
        ],
      },
      {
        label: text(
          "High-value parallel approval",
          "高額並行審批",
          "高额并行审批",
        ),
        execution: "parallel",
        condition: {
          label: text("High value", "高額", "高额"),
          fieldLabel: text("Total amount", "總金額", "总金额"),
          operator: ">=",
          value: "50000",
          join: "and",
        },
        stages: [
          {
            ...stage(text("Finance approval", "財務審批", "财务审批"), "approval"),
            attachmentLabels: [
              text("Supplier quotation", "供應商報價", "供应商报价"),
            ],
            fieldVisibility: "selected",
            visibleFieldLabels: [
              text("Purpose", "用途", "用途"),
              text("Total amount", "總金額", "总金额"),
            ],
            documentVisibility: "selected",
            visibleDocumentLabels: [
              text("Supplier quotation", "供應商報價", "供应商报价"),
            ],
          },
          stage(
            text("General manager approval", "總經理審批", "总经理审批"),
            "approval",
          ),
        ],
      },
      {
        label: text("Completion notice", "完成通知", "完成通知"),
        execution: "sequential",
        condition: null,
        stages: [
          stage(text("Requester FYI", "通知申請人", "通知申请人"), "for_information"),
        ],
      },
    ],
    collaboration: {
      templateDefinedSubmitters: true,
      adHocContributors: true,
      contributorDueDates: true,
      statusVisibility: "participants",
      confirmationPolicy: "assigned_submitter_only",
      rejectionCreatesCorrectionLoop: true,
    },
    notifications: {
      strategy: "important_changes_only",
      recipients: "directly_involved",
      events: [
        "assigned",
        "due_soon",
        "overdue",
        "rejected",
        "correction_requested",
        "completed",
      ],
    },
    governance: {
      publishMode: "template_manager_review",
      processOwnerEmail: "",
      reviewerEmails: [],
      policyReferences: [],
      retentionDays: 2555,
      changeReasonRequired: true,
    },
    assumptions: [],
    openQuestions: [],
  });
}

function field(label, type) {
  return {
    label,
    type,
    required: true,
    instructions: "",
    placeholder: "",
    options: [],
    source: "manual",
  };
}

function stage(label, kind) {
  return {
    label,
    kind,
    participant: {
      mode: kind === "for_information" ? "requester" : "directory_position",
      email: "",
      directoryPosition: kind === "for_information" ? "" : label,
      requestFieldLabel: "",
    },
    dueInHours: 24,
    escalationParticipant: null,
    acknowledgementRequired: false,
    attachmentLabels: [],
    fieldVisibility: "all",
    visibleFieldLabels: [],
    documentVisibility: "all",
    visibleDocumentLabels: [],
  };
}
