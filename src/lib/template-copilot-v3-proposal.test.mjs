import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateCopilotV3Proposal,
  parseTemplateCopilotV3Number,
} from "./template-copilot-v3-proposal.ts";
import { templateCopilotCommittedValueSchemas } from "./template-copilot-v2-canonical-values.ts";

const leaf = (role, quote, advisoryHint = null, spanId = null) => ({ role, quote, advisoryHint, ...(spanId ? { sourceSpan: { spanId } } : {}) });
const item = (factId, semanticLeaves, extra = {}) => ({ factId, semanticLeaves, ...extra });
const sections = [
  { slot: "identity_scope", messageId: "describe:identity_scope:t", text: "Create a Supplier Payment workflow to pay suppliers safely." },
  { slot: "initiators_fields", messageId: "describe:initiators_fields:t", text: "Any employee may start it. Require supplier, total amount and a Goods or Services choice." },
  { slot: "timing_escalation", messageId: "describe:timing_escalation:t", text: "Approvals are due in 3 days and escalate to the head." },
  { slot: "governance", messageId: "describe:governance:t", text: "The finance head reviews yearly. Retain records for 2555 days." },
];

function propose(items, policyItems = []) {
  return buildTemplateCopilotV3Proposal({
    extraction: { assembly: { review: { items, policyItems } }, batches: [] },
    sections,
    locale: "en",
  });
}

test("numbers are read from digits, words and Chinese numerals without mistaking MB for millions", () => {
  assert.equal(parseTemplateCopilotV3Number("20 MB"), 20);
  assert.equal(parseTemplateCopilotV3Number("HKD 50,000"), 50_000);
  assert.equal(parseTemplateCopilotV3Number("twenty"), 20);
  assert.equal(parseTemplateCopilotV3Number("二十五"), 25);
  assert.equal(parseTemplateCopilotV3Number("五百万元"), 5_000_000);
  assert.equal(parseTemplateCopilotV3Number("一億元"), 100_000_000);
  assert.equal(parseTemplateCopilotV3Number("3 million"), 3_000_000);
  assert.equal(parseTemplateCopilotV3Number("no number here"), null);
});

test("request fields get suggested types and options, and every value satisfies its schema", () => {
  const proposal = propose([
    item("request.fields", [leaf("label", "supplier"), leaf("required", "Require", "true")]),
    item("request.fields", [leaf("label", "cost centre"), leaf("required", "Require", "true")]),
    item("request.fields", [leaf("label", "total amount"), leaf("required", "Require", "true")]),
    item("request.fields", [leaf("label", "Goods or Services choice"), leaf("required", "Require", "true")]),
    item("request.fields", [leaf("label", "notes"), leaf("required", "optional", "false")]),
  ]);
  const fields = proposal.facts["request.fields"].value;
  const byLabel = Object.fromEntries(fields.map((field) => [field.label, field]));
  assert.equal(byLabel["cost centre"].type, "text");
  assert.equal(byLabel["total amount"].type, "currency");
  assert.deepEqual([byLabel["Goods or Services choice"].type, byLabel["Goods or Services choice"].options], ["select", ["Goods", "Services"]]);
  assert.equal(byLabel.notes.required, false);
  assert.equal(proposal.facts["request.fields"].origin["/2/type"], "suggested");
  assert.equal(templateCopilotCommittedValueSchemas["request.fields"].safeParse(fields).success, true);
});

test("a requester's own submission is not a step; a parallel statement shares one phase", () => {
  const span = "same-parallel-statement";
  const proposal = propose([
    item("workflow.stages", [leaf("label", "Requester"), leaf("participant", "Requester"), leaf("kind", "submits", "submission")]),
    item("workflow.stages", [leaf("label", "Manager"), leaf("participant", "Manager"), leaf("kind", "approves", "approval")]),
    item("workflow.stages", [leaf("label", "Finance"), leaf("participant", "Finance"), leaf("kind", "approve", "approval"), leaf("relationship", "in parallel", "parallel", span)]),
    item("workflow.stages", [leaf("label", "Legal"), leaf("participant", "Legal"), leaf("kind", "approve", "approval"), leaf("relationship", "in parallel", "parallel", span)]),
    item("workflow.stages", [leaf("label", "Director"), leaf("participant", "Director"), leaf("kind", "approves", "approval")]),
  ]);
  const stages = proposal.facts["workflow.stages"].value;
  assert.deepEqual(stages.map((stage) => [stage.label, stage.sequence]), [["Manager", 1], ["Finance", 2], ["Legal", 2], ["Director", 3]]);
  assert.equal(templateCopilotCommittedValueSchemas["workflow.stages"].safeParse(stages).success, true);
});

test("native forms and conditional documents are held; a conditional document stays optional", () => {
  const proposal = propose([
    item("attachments.requirements", [leaf("label", "invoice"), leaf("required", "Require", "true"), leaf("format", "PDF", "pdf"), leaf("maximum_file_size_mb", "20 MB")]),
    item("attachments.requirements", [leaf("label", "quotation"), leaf("required", "if over 50,000, require", "conditional"), leaf("format", "PDF", "pdf")], { blockingReason: "unsupported_semantics_not_executable" }),
    item("attachments.requirements", [leaf("label", "justification form"), leaf("kind", "native form", "form"), leaf("required", "Fill", "true")]),
  ]);
  const documents = proposal.facts["attachments.requirements"].value;
  assert.deepEqual(documents.map((document) => [document.label, document.required, document.maximumFileSizeMb]), [["invoice", true, 20], ["quotation", false, 10]]);
  assert.deepEqual(proposal.held.map((held) => held.reason).sort(), ["conditional_document", "native_form"]);
  assert.equal(templateCopilotCommittedValueSchemas["attachments.requirements"].safeParse(documents).success, true);
});

test("a held threshold rule becomes a checked suggestion routed to the right stage", () => {
  const stages = [
    item("workflow.stages", [leaf("label", "Manager"), leaf("participant", "Manager"), leaf("kind", "approves", "approval")]),
    item("workflow.stages", [leaf("label", "CEO"), leaf("participant", "CEO"), leaf("kind", "approval", "approval")]),
  ];
  const proposal = propose([
    item("request.fields", [leaf("label", "total amount"), leaf("required", "Require", "true")]),
    ...stages,
    item("workflow.conditions", [
      leaf("field", "total amount"), leaf("operator", "above", ">"), leaf("value", "HKD 100,000"), leaf("currency", "HKD"),
      leaf("matching_route", "add CEO approval", "stage_reference"),
    ], { blockingReason: "unsupported_semantics_not_executable" }),
    item("workflow.conditions", [leaf("field", "Retrospective"), leaf("operator", "is", "unsupported_predicate"), leaf("value", "Yes"), leaf("matching_route", "no bypass", "unsupported_outcome")], { blockingReason: "unsupported_semantics_not_executable" }),
  ]);
  const conditions = proposal.facts["workflow.conditions"].value;
  assert.deepEqual(conditions, [{
    id: "rule-1", sequence: 1, field: "total amount", operator: ">", value: 100_000, currency: "HKD",
    matchingRoute: "stage:CEO", otherwiseRoute: "complete",
  }]);
  assert.deepEqual(proposal.held.map((held) => [held.reason, held.suggestion === null]), [["conditional_rule", false], ["unparsed_rule", true]]);
});

test("notifications expand per approval step, and due time, retention and name come from the text", () => {
  const proposal = propose([
    item("workflow.stages", [leaf("label", "Manager"), leaf("participant", "Manager"), leaf("kind", "approves", "approval")]),
    item("workflow.stages", [leaf("label", "Finance"), leaf("participant", "Finance"), leaf("kind", "reviews", "review")]),
    item("notifications.rules", [leaf("event", "assignment", "stage_assigned"), leaf("recipient", "involved people", "source_named_group"), leaf("visibility", "only", "recipients_only")]),
    item("notifications.rules", [leaf("event", "completion", "request_completed"), leaf("recipient", "requester", "requester")]),
    item("notifications.rules", [leaf("event", "overdue", "overdue"), leaf("recipient", "involved people", "source_named_group")]),
  ]);
  const rules = proposal.facts["notifications.rules"].value;
  assert.deepEqual(rules.map((rule) => [rule.event, rule.stage ?? null]), [
    ["stage_assigned", "stage:Manager"], ["stage_assigned", "stage:Finance"], ["request_completed", null],
    ["overdue", "stage:Manager"], ["overdue", "stage:Finance"],
  ]);
  assert.deepEqual(rules.find((rule) => rule.event === "overdue").timing, { mode: "after_due", offsetHours: 1 });
  assert.equal(templateCopilotCommittedValueSchemas["notifications.rules"].safeParse(rules).success, true);
  assert.equal(proposal.facts["workflow.name"].value, "Supplier Payment");
  assert.equal(proposal.facts["timing.rules"].value.defaultDueHours, 72);
  assert.deepEqual(proposal.facts["governance.retention"].value, { period: "2555 days" });
});

test("sections nobody wrote stay not described instead of being invented", () => {
  const proposal = propose([]);
  assert.equal(proposal.facts["workflow.stages"].status, "needs_input");
  assert.equal(proposal.facts["attachments.requirements"].status, "not_described");
  assert.equal(proposal.facts["workflow.conditions"].status, "not_described");
  assert.equal(proposal.facts["collaboration.policy"].value, null);
  assert.equal(proposal.facts["workflow.name"].status, "ready");
});
