import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
  templateCopilotV2LedgerSchema,
} from "./template-copilot-facts.ts";
import {
  compileTemplateCopilotV2StructuredFacts,
  formatTemplateCopilotV2StructuredIssue,
  prepareTemplateCopilotV2StructuredEditorValue,
  previewTemplateCopilotV2StructuredFact,
  templateCopilotV2AttachmentRequirementsSchema,
  templateCopilotV2ConditionRulesSchema,
  templateCopilotV2NotificationRulesSchema,
  validateTemplateCopilotV2StructuredFacts,
  validateTemplateCopilotV2StructuredMutation,
} from "./template-copilot-v2-structured-facts.ts";

const flag = { enabled: true };
const actorId = "11111111-1111-4111-8111-111111111111";
const confirmedAt = "2026-07-27T12:00:00.000Z";
const provenance = [{ kind: "human_editor", sourceId: "step7-test", sourceMessageIds: [] }];

function ledger() {
  let current = createTemplateCopilotV2Ledger({
    businessUnitId: "22222222-2222-4222-8222-222222222222",
    businessName: "Operations",
    departmentId: "33333333-3333-4333-8333-333333333333",
    departmentName: "Procurement",
    questionLibraryVersion: "v2.1",
  }, flag);
  current = commit(current, "request.fields", [
    { label: "Amount", type: "currency", required: true, options: ["HKD", "USD"] },
    { label: "Headcount", type: "number", required: true, options: [] },
    { label: "Country", type: "text", required: true, options: [] },
  ]);
  current = commit(current, "workflow.stages", [
    { label: "Manager review", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 },
    { label: "Finance review", kind: "approval", participant: { mode: "directory_position", value: "Finance reviewer" }, sequence: 2 },
  ]);
  current = commit(current, "timing.rules", { defaultDueHours: 72 });
  return current;
}
function commit(current, factId, canonicalValue) {
  const operation = current.facts[factId].status === "committed"
    ? "human_replace"
    : "human_commit";
  return applyTemplateCopilotV2FactTransition({
    ledger: current,
    factId,
    transition: { operation, payload: { canonicalValue, provenance } },
    actorId,
    confirmedAt,
    flag,
  });
}
const attachments = [
  {
    id: "attachment-quotation",
    label: "Supplier quotation",
    kind: "attachment",
    required: true,
    formats: ["pdf", "image"],
    minimumQuantity: 2,
    maximumQuantity: 3,
    maximumFileSizeMb: 20,
    stage: "request_submission",
    contributorPolicy: "allow_invited_contributors",
    confirmationPolicy: "requester_confirms",
  },
  {
    id: "attachment-comparison-form",
    label: "Quotation comparison",
    kind: "form",
    required: true,
    formats: [],
    minimumQuantity: 1,
    maximumQuantity: 1,
    stage: "stage:Finance review",
    contributorPolicy: "requester_only",
    confirmationPolicy: "none",
  },
];
const conditions = [
  {
    id: "condition-high-value",
    sequence: 1,
    field: "Amount",
    operator: ">=",
    value: 1_000_000,
    currency: "HKD",
    matchingRoute: "stage:Finance review",
    otherwiseRoute: "condition:condition-large-team",
  },
  {
    id: "condition-large-team",
    sequence: 2,
    field: "Headcount",
    operator: ">",
    value: 20,
    unit: "people",
    matchingRoute: "stage:Manager review",
    otherwiseRoute: "complete",
  },
];
const notifications = [
  {
    id: "notification-assigned",
    event: "stage_assigned",
    recipients: ["current_stage_participants"],
    timing: { mode: "immediate" },
    channel: "default",
    visibility: "recipients_only",
    stage: "stage:Finance review",
  },
  {
    id: "notification-due",
    event: "due_soon",
    recipients: ["current_stage_participants", "requester"],
    timing: { mode: "before_due", offsetHours: 24 },
    channel: "in_app_and_email",
    visibility: "all_participants",
    stage: "stage:Finance review",
  },
];

test("all three strict structures serialize and round-trip without semantic drift", () => {
  for (const [schema, value] of [
    [templateCopilotV2AttachmentRequirementsSchema, attachments],
    [templateCopilotV2ConditionRulesSchema, conditions],
    [templateCopilotV2NotificationRulesSchema, notifications],
  ]) {
    const parsed = schema.parse(value);
    assert.deepEqual(schema.parse(JSON.parse(JSON.stringify(parsed))), parsed);
  }
  let current = ledger();
  current = commit(current, "attachments.requirements", attachments);
  current = commit(current, "workflow.conditions", conditions);
  current = commit(current, "notifications.rules", notifications);
  assert.deepEqual(validateTemplateCopilotV2StructuredFacts(current), []);
  assert.deepEqual(templateCopilotV2LedgerSchema.parse(structuredClone(current)), current);
});

test("attachment rules reject missing formats, wrong quantity, form file limits, and dangling stages", () => {
  const invalid = [
    null,
    { ...attachments[0], formats: {} },
    { ...attachments[0], minimumQuantity: "1" },
    { ...attachments[0], formats: [] },
    { ...attachments[0], formats: ["pdf", "pdf"] },
    { ...attachments[0], maximumFileSizeMb: 26 },
    { ...attachments[0], minimumQuantity: 4, maximumQuantity: 3 },
    { ...attachments[1], formats: ["pdf"], maximumFileSizeMb: 10 },
  ];
  invalid.forEach((value) => assert.equal(templateCopilotV2AttachmentRequirementsSchema.safeParse([value]).success, false));
  const issues = validateTemplateCopilotV2StructuredFacts(ledger(), {
    attachments: [{ ...attachments[0], stage: "stage:Missing" }],
    conditions: undefined,
    notifications: undefined,
  });
  assert.ok(issues.some((issue) => issue.code === "dangling_stage" && issue.path === "0.stage"));
});

test("condition truth table enforces typed fields, measures, routes, sequencing, and cycles", () => {
  const current = ledger();
  const cases = [
    [{ ...conditions[0], field: "Missing" }, "dangling_field"],
    [{ ...conditions[0], currency: undefined }, "missing_currency"],
    [{ ...conditions[1], unit: undefined }, "missing_unit"],
    [{ ...conditions[1], field: "Country", unit: "people" }, "unexpected_measure"],
    [{ ...conditions[0], matchingRoute: "stage:Missing" }, "dangling_route"],
    [{ ...conditions[0], otherwiseRoute: "condition:condition-high-value" }, "invalid_sequence"],
    [{ ...conditions[0], operator: "=", value: "one million" }, "invalid_value_type"],
  ];
  for (const [changed, code] of cases) {
    const issues = validateTemplateCopilotV2StructuredFacts(current, {
      attachments: undefined,
      conditions: [changed, conditions[1]],
      notifications: undefined,
    });
    assert.ok(issues.some((issue) => issue.code === code), code);
  }
  const cycle = [
    { ...conditions[0], matchingRoute: "condition:condition-large-team", otherwiseRoute: "complete" },
    { ...conditions[1], matchingRoute: "condition:condition-high-value", otherwiseRoute: "complete" },
  ];
  const cycleIssues = validateTemplateCopilotV2StructuredFacts(current, {
    attachments: undefined,
    conditions: cycle,
    notifications: undefined,
  });
  assert.ok(cycleIssues.some((issue) => issue.code === "condition_cycle"));
  assert.equal(templateCopilotV2ConditionRulesSchema.safeParse([{ ...conditions[0], operator: ">", value: "100" }]).success, false);
  assert.equal(templateCopilotV2ConditionRulesSchema.safeParse([{ ...conditions[0], operator: "contains", value: 100 }]).success, false);
  assert.equal(templateCopilotV2ConditionRulesSchema.safeParse([null]).success, false);
  assert.equal(templateCopilotV2ConditionRulesSchema.safeParse([{ ...conditions[0], matchingRoute: null }]).success, false);
});

test("notification matrix permits safe groups and valid timing while rejecting unsafe edges", () => {
  assert.equal(templateCopilotV2NotificationRulesSchema.safeParse(notifications).success, true);
  const invalid = [
    null,
    { ...notifications[0], recipients: {} },
    { ...notifications[0], timing: [] },
    { ...notifications[1], timing: { mode: "before_due", offsetHours: "24" } },
    { ...notifications[0], recipients: ["finance@example.com"] },
    { ...notifications[0], recipients: ["requester", "requester"] },
    { ...notifications[0], stage: undefined },
    { ...notifications[1], timing: { mode: "after_due", offsetHours: 1 } },
    { ...notifications[0], timing: { mode: "immediate", offsetHours: 1 } },
    { ...notifications[0], channel: "sms" },
  ];
  invalid.forEach((value) => assert.equal(templateCopilotV2NotificationRulesSchema.safeParse([value]).success, false));
  const issues = validateTemplateCopilotV2StructuredFacts(ledger(), {
    attachments: undefined,
    conditions: undefined,
    notifications: [{ ...notifications[0], stage: "stage:Missing" }],
  });
  assert.ok(issues.some((issue) => issue.code === "dangling_stage"));
  const withoutDueTime = commit(ledger(), "timing.rules", {});
  const missingDueIssues = validateTemplateCopilotV2StructuredFacts(withoutDueTime, {
    attachments: undefined,
    conditions: undefined,
    notifications,
  });
  assert.ok(missingDueIssues.some((issue) => issue.code === "unavailable_timing"));
  const tooEarlyIssues = validateTemplateCopilotV2StructuredFacts(ledger(), {
    attachments: undefined,
    conditions: undefined,
    notifications: [{ ...notifications[1], timing: { mode: "before_due", offsetHours: 73 } }],
  });
  assert.ok(tooEarlyIssues.some((issue) =>
    issue.code === "invalid_timing_offset"
    && issue.path === "0.timing.offsetHours"));
  const noPreviousIssues = validateTemplateCopilotV2StructuredFacts(ledger(), {
    attachments: undefined,
    conditions: undefined,
    notifications: [{
      ...notifications[0],
      recipients: ["previous_stage_participants"],
      stage: "stage:Manager review",
    }],
  });
  assert.ok(noPreviousIssues.some((issue) => issue.code === "unsafe_recipient"));
});

test("compiler consumes canonical structures and remains equivalent across serialization and localized playback", () => {
  let current = ledger();
  current = commit(current, "attachments.requirements", attachments);
  current = commit(current, "workflow.conditions", conditions);
  current = commit(current, "notifications.rules", notifications);
  const first = compileTemplateCopilotV2StructuredFacts(current);
  const second = compileTemplateCopilotV2StructuredFacts(templateCopilotV2LedgerSchema.parse(JSON.parse(JSON.stringify(current))));
  assert.deepEqual(second, first);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    assert.equal(previewTemplateCopilotV2StructuredFact("attachments.requirements", attachments, locale).length, 2);
    assert.equal(previewTemplateCopilotV2StructuredFact("workflow.conditions", conditions, locale).length, 2);
    assert.equal(previewTemplateCopilotV2StructuredFact("notifications.rules", notifications, locale).length, 2);
  }
  const attachmentPreviews = {
    en: previewTemplateCopilotV2StructuredFact("attachments.requirements", attachments, "en"),
    "zh-Hant": previewTemplateCopilotV2StructuredFact("attachments.requirements", attachments, "zh-Hant"),
    "zh-Hans": previewTemplateCopilotV2StructuredFact("attachments.requirements", attachments, "zh-Hans"),
  };
  assert.match(attachmentPreviews.en[1], /Quotation comparison: in-app form; 1–1; required/u);
  assert.equal((attachmentPreviews.en[1].match(/in-app form/gu) || []).length, 1);
  assert.match(attachmentPreviews["zh-Hant"][1], /應用程式內表格；1–1 份；必須提供/u);
  assert.match(attachmentPreviews["zh-Hans"][1], /应用内表单；1–1 份；必须提供/u);
  const smallerFile = [{ ...attachments[0], maximumFileSizeMb: 5 }];
  const largerFile = [{ ...attachments[0], maximumFileSizeMb: 25 }];
  for (const [locale, smallerPattern, largerPattern] of [
    ["en", /maximum 5 MB per file/u, /maximum 25 MB per file/u],
    ["zh-Hant", /每個檔案最多 5 MB/u, /每個檔案最多 25 MB/u],
    ["zh-Hans", /每个文件最多 5 MB/u, /每个文件最多 25 MB/u],
  ]) {
    const smaller = previewTemplateCopilotV2StructuredFact("attachments.requirements", smallerFile, locale)[0];
    const larger = previewTemplateCopilotV2StructuredFact("attachments.requirements", largerFile, locale)[0];
    assert.match(smaller, smallerPattern);
    assert.match(larger, largerPattern);
    assert.notEqual(smaller, larger);
  }
  const contains = [{ ...conditions[1], field: "Country", operator: "contains", value: "Hong Kong", unit: undefined }];
  assert.match(previewTemplateCopilotV2StructuredFact("workflow.conditions", contains, "en")[0], /contains/u);
  assert.match(previewTemplateCopilotV2StructuredFact("workflow.conditions", contains, "zh-Hant")[0], /包含/u);
  assert.match(previewTemplateCopilotV2StructuredFact("workflow.conditions", contains, "zh-Hans")[0], /包含/u);
  assert.match(previewTemplateCopilotV2StructuredFact("notifications.rules", notifications, "zh-Hant")[1], /即將到期/u);
  assert.match(previewTemplateCopilotV2StructuredFact("notifications.rules", notifications, "zh-Hans")[1], /即将到期/u);
  const preview = previewTemplateCopilotV2StructuredFact("workflow.conditions", conditions, "en").join(" ");
  assert.throws(() => compileTemplateCopilotV2StructuredFacts({ ...current, facts: { ...current.facts, "workflow.conditions": { ...current.facts["workflow.conditions"], canonicalValue: preview } } }));
});

test("changing stages cannot strand strict attachment, condition, or notification references", () => {
  let before = ledger();
  before = commit(before, "attachments.requirements", attachments);
  before = commit(before, "workflow.conditions", conditions);
  before = commit(before, "notifications.rules", notifications);
  const after = commit(before, "workflow.stages", [
    { label: "Manager review", kind: "approval", participant: { mode: "directory_position", value: "Manager" }, sequence: 1 },
  ]);
  const issues = validateTemplateCopilotV2StructuredMutation({ before, after, factId: "workflow.stages" });
  assert.ok(issues.some((issue) => issue.code === "dangling_stage"));
  assert.ok(issues.some((issue) => issue.factId === "workflow.conditions" && issue.code === "dangling_route"));
});

test("changing request fields cannot strand a strict condition source", () => {
  let before = ledger();
  before = commit(before, "workflow.conditions", conditions);
  const after = commit(before, "request.fields", [
    { label: "Country", type: "text", required: true, options: [] },
  ]);
  const issues = validateTemplateCopilotV2StructuredMutation({
    before,
    after,
    factId: "request.fields",
  });
  assert.ok(issues.some((item) =>
    item.factId === "workflow.conditions"
    && item.code === "dangling_field"));
});

test("changing the due-time policy cannot strand an existing due-soon notification", () => {
  let before = ledger();
  before = commit(before, "notifications.rules", notifications);
  const after = commit(before, "timing.rules", { defaultDueHours: 12 });
  const issues = validateTemplateCopilotV2StructuredMutation({
    before,
    after,
    factId: "timing.rules",
  });
  assert.ok(issues.some((item) =>
    item.factId === "notifications.rules"
    && item.code === "invalid_timing_offset"));
});

test("structured references reject ambiguous duplicate workflow step names", () => {
  const current = commit(ledger(), "workflow.stages", [
    { label: "Finance review", kind: "approval", participant: { mode: "directory_position", value: "Finance reviewer" }, sequence: 1 },
    { label: "finance REVIEW", kind: "review", participant: { mode: "directory_position", value: "Finance reviewer" }, sequence: 2 },
  ]);
  const issues = validateTemplateCopilotV2StructuredFacts(current, {
    attachments: [{ ...attachments[0], stage: "stage:Finance review" }],
    conditions: undefined,
    notifications: undefined,
  });
  assert.ok(issues.some((issue) => issue.code === "ambiguous_stage"));
});

test("structured validation guidance is readable in all three supported languages", () => {
  const item = {
    factId: "workflow.conditions",
    path: "0.currency",
    code: "missing_currency",
    message: "Choose the currency for this amount.",
  };
  assert.equal(formatTemplateCopilotV2StructuredIssue(item, "en"), item.message);
  assert.match(formatTemplateCopilotV2StructuredIssue(item, "zh-Hant"), /貨幣/u);
  assert.match(formatTemplateCopilotV2StructuredIssue(item, "zh-Hans"), /货币/u);
});

test("legacy Step 5 values are retained visibly and upgraded without guessing unknown references", () => {
  assert.deepEqual(
    prepareTemplateCopilotV2StructuredEditorValue("attachments.requirements", [
      { label: "Invoice", required: true, formats: ["pdf"], stage: "Finance review" },
    ]),
    [{
      id: "attachment-1",
      label: "Invoice",
      kind: "attachment",
      required: true,
      formats: ["pdf"],
      minimumQuantity: 1,
      maximumQuantity: 1,
      maximumFileSizeMb: 20,
      stage: "stage:Finance review",
      contributorPolicy: "requester_only",
      confirmationPolicy: "none",
    }],
  );
  const upgradedCondition = prepareTemplateCopilotV2StructuredEditorValue("workflow.conditions", [{
    field: "Amount", operator: ">", value: 100, matchingRoute: "Unknown stage", otherwiseRoute: "Manager review",
  }]);
  assert.equal(upgradedCondition[0].matchingRoute, "stage:Unknown stage");
  const upgradedNotification = prepareTemplateCopilotV2StructuredEditorValue("notifications.rules", [{
    event: "When Bob says so", recipients: ["bob@example.com"], channel: "email",
  }]);
  assert.equal(upgradedNotification[0].event, "When Bob says so");
  assert.deepEqual(upgradedNotification[0].recipients, ["bob@example.com"]);
});
