import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTemplateCopilotV2FactTransition,
  createTemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";
import { getTemplateCopilotV2InterviewState } from "./template-copilot-question-library.ts";
import {
  normalizeTemplateCopilotV2Candidates,
  projectTemplateCopilotV2Candidates,
  resolveTemplateCopilotV2CommittedExtractionConflict,
} from "./template-copilot-v2-candidates.ts";

const flag = { enabled: true };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Finance",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Accounts",
};
const actor = "33333333-3333-4333-8333-333333333333";

function codePointsBefore(text, offset) {
  return Array.from(text.slice(0, offset)).length;
}

function span(text, exactText, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(exactText, offset + 1);
  }
  assert.ok(offset >= 0, `missing fixture text: ${exactText}`);
  return {
    startCodePoint: codePointsBefore(text, offset),
    endCodePoint: codePointsBefore(text, offset + exactText.length),
    exactText,
  };
}

function candidate({ factId, valueType, value, message, originalWording = message, evidence, more = {} }) {
  return {
    factId,
    valueType,
    value,
    originalWording,
    evidence,
    confidence: "medium",
    ambiguity: "none",
    ...more,
  };
}

function normalized(output, message) {
  return normalizeTemplateCopilotV2Candidates({ output: { candidates: output }, messages: { m1: message } });
}

test("Step 3 accepts a typed simple candidate only with exact Unicode leaf evidence", () => {
  const message = "😀 Ｐｕｒｃｈａｓｅ　Ａｐｐｒｏｖａｌ";
  const wording = "Ｐｕｒｃｈａｓｅ　Ａｐｐｒｏｖａｌ";
  const result = normalized([candidate({
    factId: "workflow.name",
    valueType: "text",
    value: "Purchase Approval",
    message,
    originalWording: wording,
    evidence: [{ path: "/", messageId: "m1", ...span(message, wording), normalizationRule: "nfkc_trim_collapse_whitespace" }],
  })], message);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].value, "Purchase Approval");
  assert.deepEqual(result.candidates[0].evidence, [{ path: "/", messageId: "m1", ...span(message, wording), normalizationRule: "nfkc_trim_collapse_whitespace" }]);
  const forgedWording = normalized([candidate({
    factId: "workflow.name", valueType: "text", value: "Purchase Approval", message, originalWording: "Invented workflow name",
    evidence: [{ path: "/", messageId: "m1", ...span(message, wording), normalizationRule: "nfkc_trim_collapse_whitespace" }],
  })], message);
  assert.equal(forgedWording.candidates.length, 0, "original wording must be an exact substring of a cited message");
});

test("Step 3 fails closed for forged, UTF-16, overlapping, reused, missing, and extra leaf evidence", () => {
  const message = "😀 採購 approval directory_position Accounts Payable Manager first";
  const wording = "採購 approval directory_position Accounts Payable Manager first";
  const valid = candidate({
    factId: "workflow.stages",
    valueType: "stages",
    value: [{ label: "採購", kind: "approval", participant: { mode: "directory_position", value: "Accounts Payable Manager" }, sequence: 1 }],
    message,
    originalWording: wording,
    evidence: [
      { path: "/0/label", messageId: "m1", ...span(message, "採購") },
      { path: "/0/kind", messageId: "m1", ...span(message, "approval"), normalizationRule: "approval_word_to_kind" },
      { path: "/0/participant/mode", messageId: "m1", ...span(message, "directory_position") },
      { path: "/0/participant/value", messageId: "m1", ...span(message, "Accounts Payable Manager") },
      { path: "/0/sequence", messageId: "m1", ...span(message, "first"), normalizationRule: "ordinal_to_sequence" },
    ],
  });
  const variants = [
    { name: "UTF-16 offset", mutate: (input) => ({ ...input, evidence: [{ ...input.evidence[0], startCodePoint: 3 }] }) },
    { name: "out of range", mutate: (input) => ({ ...input, evidence: [{ ...input.evidence[0], endCodePoint: 9999 }] }) },
    { name: "forged exact text", mutate: (input) => ({ ...input, evidence: [{ ...input.evidence[0], exactText: "CEO" }] }) },
    { name: "missing leaf", mutate: (input) => ({ ...input, evidence: input.evidence.filter((item) => item.path !== "/0/participant/value") }) },
    { name: "extra pointer", mutate: (input) => ({ ...input, evidence: [...input.evidence, { path: "/0/invented", messageId: "m1", ...span(message, "first") }] }) },
    { name: "overlapping sibling spans", mutate: (input) => ({ ...input, evidence: input.evidence.map((item) => item.path === "/0/participant/value" ? { ...item, ...span(message, "approval") } : item) }) },
    { name: "reused span", mutate: (input) => ({ ...input, evidence: input.evidence.map((item) => item.path === "/0/sequence" ? { ...item, ...span(message, "approval") } : item) }) },
  ];
  assert.equal(normalized([valid], message).candidates.length, 1, "the fully cited typed stage is valid");
  for (const variant of variants) {
    const result = normalized([variant.mutate(valid)], message);
    assert.equal(result.candidates.length, 0, variant.name);
  }
});

test("Step 3 rejects structurally complete but source-incomplete typed configuration", () => {
  const message = "Finance approval";
  const result = normalized([candidate({
    factId: "workflow.stages",
    valueType: "stages",
    value: [{ label: "Finance approval", kind: "approval", participant: { mode: "fixed_email", value: "ceo@example.com" }, sequence: 1 }],
    message,
    evidence: [
      { path: "/0/label", messageId: "m1", ...span(message, "Finance approval") },
      { path: "/0/kind", messageId: "m1", ...span(message, "approval"), normalizationRule: "approval_word_to_kind" },
      { path: "/0/sequence", messageId: "m1", ...span(message, "Finance"), normalizationRule: "array_position_to_sequence" },
    ],
  })], message);
  assert.equal(result.candidates.length, 0, "a missing participant/e-mail citation must not be filled by a model");
});

test("Step 3 rejects lexical invention and a reused span cannot justify two typed leaves", () => {
  const fieldMessage = "Expense code email yes";
  const forgedField = candidate({
    factId: "request.fields", valueType: "fields", value: [{ label: "Expense code", type: "email", required: true }], message: fieldMessage,
    evidence: [
      { path: "/0/label", messageId: "m1", ...span(fieldMessage, "Expense code") },
      { path: "/0/type", messageId: "m1", ...span(fieldMessage, "Expense code"), normalizationRule: "enum_lexical" },
      { path: "/0/required", messageId: "m1", ...span(fieldMessage, "yes"), normalizationRule: "boolean_lexical" },
    ],
  });
  assert.equal(normalized([forgedField], fieldMessage).candidates.length, 0, "an unrelated label cannot invent email");

  const timingMessage = "immediately";
  const forgedTiming = candidate({ factId: "timing.rules", valueType: "timing_rules", value: { defaultDueHours: 8760 }, message: timingMessage, evidence: [{ path: "/defaultDueHours", messageId: "m1", ...span(timingMessage, timingMessage), normalizationRule: "duration_hours" }] });
  assert.equal(normalized([forgedTiming], timingMessage).candidates.length, 0, "immediately cannot invent a year-long due time");

  const initiatorMessage = "Employees may submit";
  const forgedInitiator = candidate({ factId: "request.initiator_policy", valueType: "initiator_policy", value: { mode: "directory_role", description: "may submit" }, message: initiatorMessage, evidence: [{ path: "/mode", messageId: "m1", ...span(initiatorMessage, "Employees"), normalizationRule: "enum_lexical" }, { path: "/description", messageId: "m1", ...span(initiatorMessage, "may submit") }] });
  assert.equal(normalized([forgedInitiator], initiatorMessage).candidates.length, 0, "employees cannot invent directory_role");

  const reusedMessage = "Email yes";
  const reused = candidate({ factId: "request.fields", valueType: "fields", value: [{ label: "Email", type: "email", required: true }], message: reusedMessage, evidence: [{ path: "/0/label", messageId: "m1", ...span(reusedMessage, "Email") }, { path: "/0/type", messageId: "m1", ...span(reusedMessage, "Email"), normalizationRule: "enum_lexical" }, { path: "/0/required", messageId: "m1", ...span(reusedMessage, "yes"), normalizationRule: "boolean_lexical" }] });
  assert.equal(normalized([reused], reusedMessage).candidates.length, 0, "one span cannot justify both label and field type");
});

test("Step 3 accepts closed English, Traditional Chinese, and Simplified Chinese lexical stage evidence", () => {
  const cases = [
    { message: "Finance approval directory position Finance Manager first", label: "Finance", kind: "approval", mode: "directory position", participant: "Finance Manager", sequence: "first" },
    { message: "財務 審批 目錄職位 財務經理 第一", label: "財務", kind: "審批", mode: "目錄職位", participant: "財務經理", sequence: "第一" },
    { message: "财务 审批 目录职位 财务经理 第一", label: "财务", kind: "审批", mode: "目录职位", participant: "财务经理", sequence: "第一" },
  ];
  for (const entry of cases) {
    const result = normalized([candidate({
      factId: "workflow.stages", valueType: "stages", value: [{ label: entry.label, kind: "approval", participant: { mode: "directory_position", value: entry.participant }, sequence: 1 }], message: entry.message,
      evidence: [
        { path: "/0/label", messageId: "m1", ...span(entry.message, entry.label) },
        { path: "/0/kind", messageId: "m1", ...span(entry.message, entry.kind), normalizationRule: "approval_word_to_kind" },
        { path: "/0/participant/mode", messageId: "m1", ...span(entry.message, entry.mode), normalizationRule: "enum_lexical" },
        { path: "/0/participant/value", messageId: "m1", ...span(entry.message, entry.participant) },
        { path: "/0/sequence", messageId: "m1", ...span(entry.message, entry.sequence), normalizationRule: "ordinal_to_sequence" },
      ],
    })], entry.message);
    assert.equal(result.candidates.length, 1, entry.message);
  }
});

test("Step 3 uses fact-specific equality: attachments/formats are sets, stages remain ordered, identities retain case", () => {
  const message = "Invoice is required. PDF and image. First Finance approval; second Director review.";
  const attachments = candidate({
    factId: "attachments.requirements",
    valueType: "attachments",
    value: [{ label: "Invoice", required: true, formats: ["image", "pdf"] }],
    message,
    originalWording: "Invoice is required. PDF and image",
    evidence: [
      { path: "/0/label", messageId: "m1", ...span(message, "Invoice") },
      { path: "/0/required", messageId: "m1", ...span(message, "required"), normalizationRule: "named_attachment_is_required" },
      { path: "/0/formats/0", messageId: "m1", ...span(message, "image") },
      { path: "/0/formats/1", messageId: "m1", ...span(message, "PDF"), normalizationRule: "enum_lexical" },
    ],
  });
  const equivalent = { ...attachments, value: [{ ...attachments.value[0], formats: ["pdf", "image"] }] };
  const attachmentResult = normalized([attachments, equivalent], message);
  assert.equal(attachmentResult.candidates.length, 1, "format order must not create a second semantic attachment candidate");
  assert.deepEqual(attachmentResult.candidates[0].value[0].formats, ["image", "pdf"]);

  const nameMessage = "CEO";
  const nameResult = normalized([candidate({
    factId: "governance.owner", valueType: "text", value: "CEO", message: nameMessage,
    evidence: [{ path: "/", messageId: "m1", ...span(nameMessage, "CEO") }],
  })], nameMessage);
  assert.equal(nameResult.candidates[0].value, "CEO", "identity display casing is evidence, not a normalization side effect");
});

test("an evidence-backed candidate cannot skip the interview; only an explicit human commit can", () => {
  const message = "Purchase Approval";
  const extracted = normalized([candidate({
    factId: "workflow.name", valueType: "text", value: "Purchase Approval", message,
    evidence: [{ path: "/", messageId: "m1", ...span(message, message) }],
  })], message);
  const projected = projectTemplateCopilotV2Candidates({ ledger: createTemplateCopilotV2Ledger(scope, flag), candidates: extracted.candidates });
  assert.equal(getTemplateCopilotV2InterviewState(projected.ledger).nextQuestion.targetFactId, "workflow.name");
  const committed = applyTemplateCopilotV2FactTransition({
    ledger: projected.ledger,
    factId: "workflow.name",
    transition: { operation: "human_commit", payload: { canonicalValue: "Purchase Approval", provenance: projected.ledger.facts["workflow.name"].provenance } },
    actorId: actor,
    confirmedAt: "2026-07-27T00:00:00Z",
    flag,
  });
  assert.equal(getTemplateCopilotV2InterviewState(committed).nextQuestion.targetFactId, "workflow.purpose");
});

test("committed extraction conflict requires a human choice and preserves immutable typed alternatives, evidence, and rationale history", () => {
  const original = applyTemplateCopilotV2FactTransition({
    ledger: createTemplateCopilotV2Ledger(scope, flag),
    factId: "workflow.name",
    transition: { operation: "human_commit", payload: { canonicalValue: "Invoice Approval", provenance: [{ kind: "human_editor", sourceId: "manual:invoice", sourceMessageIds: [] }] } },
    actorId: actor,
    confirmedAt: "2026-07-27T00:00:00Z",
    flag,
  });
  const message = "Purchase Approval";
  const incoming = normalized([candidate({
    factId: "workflow.name", valueType: "text", value: "Purchase Approval", message,
    evidence: [{ path: "/", messageId: "m1", ...span(message, message) }],
  })], message);
  const conflicted = projectTemplateCopilotV2Candidates({ ledger: original, candidates: incoming.candidates }).ledger;
  const conflict = conflicted.extractionEvidence.conflicts[0];
  assert.ok(conflict);
  const resolved = resolveTemplateCopilotV2CommittedExtractionConflict({
    ledger: conflicted,
    conflictId: conflict.conflictId,
    resolution: "commit_incoming",
    rationale: "The process owner confirmed the renamed workflow.",
    actorId: actor,
    confirmedAt: "2026-07-27T00:01:00Z",
  });
  assert.equal(resolved.facts["workflow.name"].canonicalValue, "Purchase Approval");
  const history = resolved.extractionEvidence.history;
  assert.equal(history.length, 1);
  assert.equal(history[0].conflictId, conflict.conflictId);
  assert.equal(history[0].choice, "commit_incoming");
  assert.equal(history[0].rationale, "The process owner confirmed the renamed workflow.");
  assert.equal(history[0].before.value, "Invoice Approval");
  assert.equal(history[0].incoming.value, "Purchase Approval");
});
