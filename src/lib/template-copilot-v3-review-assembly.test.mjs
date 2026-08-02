import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleTemplateCopilotV3Review,
  templateCopilotV3ReviewItemId,
  templateCopilotV3SemanticProjectionId,
} from "./template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3SourceSpanId,
  validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority,
} from "./template-copilot-v3-evidence.ts";
import { templateCopilotQualificationScenarios } from "../../scripts/template-copilot-qualification-scenarios.mjs";

function span(messageId, text, quote, occurrence = 0) {
  let startCodeUnit = -1;
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    startCodeUnit = text.indexOf(quote, cursor);
    assert.notEqual(startCodeUnit, -1, `Missing quote: ${quote}`);
    cursor = startCodeUnit + quote.length;
  }
  const startCodePoint = Array.from(text.slice(0, startCodeUnit)).length;
  const endCodePoint = startCodePoint + Array.from(quote).length;
  const supplied = { messageId, startCodePoint, endCodePoint, exactText: quote };
  return Object.freeze({ spanId: templateCopilotV3SourceSpanId(supplied), ...supplied });
}

const slotByKind = {
  workflow_name: "identity_scope",
  governance_policy: "governance",
  request_field: "initiators_fields",
  attachment: "attachments",
  stage: "stages_participants",
  condition: "conditions_exceptions",
  notification: "visibility_notifications",
};

function located({ itemIndex, kind, messageId, text, anchorQuote = text, leaves, confidence = "high", ambiguity = "none", slot = slotByKind[kind], anchorExpanded = false, sameLocalClauseRecoveredLeafCount = 0 }) {
  return Object.freeze({
    itemIndex,
    kind,
    slot,
    anchor: span(messageId, text, anchorQuote),
    leaves: Object.freeze(leaves.map((leaf) => Object.freeze({ role: leaf.role, hint: leaf.hint ?? null, sourceSpan: span(messageId, text, leaf.quote, leaf.occurrence ?? 0), sameLocalClauseRecovered: leaf.sameLocalClauseRecovered ?? false }))),
    confidence,
    ambiguity,
    anchorExpanded,
    sameLocalClauseRecoveredLeafCount,
  });
}

function conditionAuthoritySymbols({
  caseId,
  field,
  route,
  itemIndexBase = 900_000,
}) {
  const fieldMessageId = `condition-symbol:${caseId}:field`;
  const stageMessageId = `condition-symbol:${caseId}:stage`;
  const fieldText = `必填${field}`;
  const stageText = `${route}审批申请人`;
  return Object.freeze({
    sourceMessages: Object.freeze({
      [fieldMessageId]: fieldText,
      [stageMessageId]: stageText,
    }),
    items: Object.freeze([
      located({
        itemIndex: itemIndexBase,
        kind: "request_field",
        messageId: fieldMessageId,
        text: fieldText,
        leaves: [
          { role: "label", quote: field },
          { role: "required", quote: "必填", hint: "true" },
        ],
      }),
      located({
        itemIndex: itemIndexBase + 1,
        kind: "stage",
        messageId: stageMessageId,
        text: stageText,
        leaves: [
          { role: "label", quote: route },
          { role: "kind", quote: "审批", hint: "approval" },
          {
            role: "participant_mode",
            quote: "申请人",
            hint: "requester",
          },
        ],
      }),
    ]),
  });
}

test("preserves a partial multilingual field without compiler defaults", () => {
  const messageId = "message-field-001";
  const text = "欄位：總額；必須；數字。";
  const messages = { [messageId]: text };
  const result = assembleTemplateCopilotV3Review({
    items: [located({ itemIndex: 0, kind: "request_field", messageId, text, leaves: [
      { role: "label", quote: "總額" },
      { role: "required", quote: "必須", hint: "true" },
      { role: "type", quote: "數字", hint: "number" },
    ] })],
    sourceMessages: messages,
  });
  const item = result.review.items[0];
  assert.deepEqual(item.value, { label: "總額", required: true, type: "number" });
  assert.deepEqual(item.missingPaths, ["/options"]);
  assert.equal(item.complete, false);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.defaulted, false);
  assert.equal(item.executable, false);
  assert.equal(result.envelope.fragments.length, 1);
  assert.ok(validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(result.envelope, messages));
});

test("distinguishes a complete review-only item from an open durable fragment", () => {
  const messageId = "message-field-002";
  const text = "Employee name text required no options";
  const result = assembleTemplateCopilotV3Review({
    items: [located({ itemIndex: 0, kind: "request_field", messageId, text, leaves: [
      { role: "label", quote: "Employee name" },
      { role: "type", quote: "text", hint: "text" },
      { role: "required", quote: "required", hint: "true" },
      { role: "option", quote: "no options" },
    ] })],
    sourceMessages: { [messageId]: text },
  });
  const item = result.review.items[0];
  assert.deepEqual(item.value, { label: "Employee name", options: [], required: true, type: "text" });
  assert.deepEqual(item.missingPaths, []);
  assert.equal(item.complete, true);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.fragmentId, null);
  assert.equal(item.persisted, false);
  assert.equal(result.envelope.fragments.length, 0);
});

test("groups only co-located complements, deduplicates evidence, and retains stable conflicting alternatives", () => {
  const messageId = "message-stage-001";
  const text = "Finance Review approve review requester first in parallel";
  const first = located({ itemIndex: 0, kind: "stage", messageId, text, leaves: [
    { role: "label", quote: "Finance Review" },
    { role: "kind", quote: "approve", hint: "approval" },
    { role: "participant_mode", quote: "requester", hint: "requester" },
    { role: "sequence", quote: "first" },
    { role: "relationship", quote: "in parallel", hint: "parallel" },
  ] });
  const second = located({ itemIndex: 1, kind: "stage", messageId, text, leaves: [
    { role: "label", quote: "Finance Review" },
    { role: "kind", quote: "review", hint: "review" },
    { role: "participant_mode", quote: "requester", hint: "requester" },
    { role: "sequence", quote: "first" },
    { role: "relationship", quote: "in parallel", hint: "parallel" },
  ] });
  const messages = { [messageId]: text };
  const assemble = (items) => assembleTemplateCopilotV3Review({ items, sourceMessages: messages });
  const result = assemble([first, { ...first, itemIndex: 2 }, second]);
  const reordered = assemble([
    { ...second, itemIndex: 41 },
    { ...first, itemIndex: 42 },
    { ...first, itemIndex: 40 },
  ]);

  assert.equal(result.review.items.length, 2);
  assert.equal(result.review.conflicts.length, 1);
  assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
  assert.deepEqual(new Set(result.review.items.map((item) => item.value.kind)), new Set(["approval", "review"]));
  assert.ok(result.review.items.every((item) => item.relationships.some((entry) => entry.relationship === "parallel")));
  assert.ok(result.review.items.every((item) => !item.semanticComplete));
  assert.ok(result.review.items.every((item) => item.ambiguity === "ambiguous"));
  assert.deepEqual(
    result.review.items.map((item) => item.reviewItemId).sort(),
    reordered.review.items.map((item) => item.reviewItemId).sort(),
  );
  assert.equal(result.review.conflicts[0].conflictId, reordered.review.conflicts[0].conflictId);
  assert.deepEqual(result.review.conflicts[0].reviewItemIds, reordered.review.conflicts[0].reviewItemIds);
});

test("keeps underspecified shared evidence separate from every conflicting alternative under all permutations", () => {
  const messageId = "message-stage-abc-conflict-001";
  const text = "Finance Review approve review requester in parallel";
  const alternatives = [
    located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "approve", hint: "approval" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ],
    }),
    located({
      itemIndex: 1,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "review", hint: "review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ],
    }),
    located({
      itemIndex: 2,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
        { role: "relationship", quote: "in parallel", hint: "parallel" },
      ],
    }),
  ];
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let baseline;
  for (const order of orders) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: text },
      items: order.map((sourceIndex, position) => ({
        ...alternatives[sourceIndex],
        itemIndex: 900 + position * 17,
      })),
    });
    assert.equal(result.review.items.length, 3);
    assert.equal(result.review.conflicts.length, 1);
    assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
    assert.ok(result.review.items.every((item) => item.ambiguity === "ambiguous"));
    assert.ok(result.review.items.every(
      (item) => templateCopilotV3ReviewItemId(item) === item.reviewItemId,
    ));

    const shared = result.review.items.find((item) => item.value.kind === undefined);
    assert.ok(shared);
    assert.deepEqual(
      shared.relationships.map((entry) => entry.relationship),
      ["parallel"],
    );
    assert.ok(
      result.review.items
        .filter((item) => item.value.kind !== undefined)
        .every((item) => item.relationships.length === 0),
    );

    const snapshot = {
      ids: result.review.items.map((item) => item.reviewItemId).sort(),
      conflictId: result.review.conflicts[0].conflictId,
      conflictPaths: result.review.conflicts[0].paths,
      conflictReviewItemIds: result.review.conflicts[0].reviewItemIds,
    };
    baseline ??= snapshot;
    assert.deepEqual(snapshot, baseline);
  }
});

test("keeps later-stage attachments, native forms, inflected FYI stages, grouped amounts, and raw Chinese thresholds", () => {
  const attachmentId = "message-attach-001";
  const attachmentText = "Supplier invoice PDF required up to 10 MB at Legal Review; invited colleagues may contribute; requester confirms";
  const formId = "message-attach-002";
  const formText = "Expense details native form optional";
  const stageId = "message-stage-003";
  const stageText = "Board FYI to Board members in parallel";
  const conditionId = "message-cond-001";
  const conditionText = "Total at least 50,000 routes to Legal Review otherwise complete the workflow";
  const chineseId = "message-cond-002";
  const chineseText = "總額大於一億元時配對財務審批，否則完成流程";
  const messages = { [attachmentId]: attachmentText, [formId]: formText, [stageId]: stageText, [conditionId]: conditionText, [chineseId]: chineseText };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: messages,
    sourceMessageOrder: Object.keys(messages),
    items: [
      located({ itemIndex: 0, kind: "attachment", messageId: attachmentId, text: attachmentText, leaves: [
        { role: "label", quote: "Supplier invoice" }, { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" }, { role: "format", quote: "PDF", hint: "pdf" },
        { role: "maximum_file_size_mb", quote: "10" }, { role: "stage", quote: "Legal Review", hint: "stage_reference" },
        { role: "contributor_policy", quote: "invited colleagues may contribute", hint: "allow_invited_contributors" }, { role: "confirmation_policy", quote: "requester confirms", hint: "requester_confirms" },
      ] }),
      located({ itemIndex: 1, kind: "attachment", messageId: formId, text: formText, leaves: [
        { role: "label", quote: "Expense details" }, { role: "kind", quote: "native form", hint: "form" }, { role: "required", quote: "optional", hint: "false" },
      ] }),
      located({ itemIndex: 2, kind: "stage", messageId: stageId, text: stageText, leaves: [
        { role: "label", quote: "Board FYI" }, { role: "kind", quote: "FYI", hint: "for_information" },
        { role: "participant", quote: "Board members" }, { role: "relationship", quote: "in parallel", hint: "parallel" },
      ] }),
      located({ itemIndex: 3, kind: "condition", messageId: conditionId, text: conditionText, leaves: [
        { role: "field", quote: "Total" }, { role: "operator", quote: "at least", hint: ">=" }, { role: "value", quote: "50,000" },
        { role: "matching_route", quote: "Legal Review", hint: "stage_reference" }, { role: "otherwise_route", quote: "complete the workflow", hint: "complete" },
      ] }),
      located({ itemIndex: 4, kind: "condition", messageId: chineseId, text: chineseText, leaves: [
        { role: "field", quote: "總額" }, { role: "operator", quote: "大於", hint: ">" }, { role: "value", quote: "一億元" },
        { role: "matching_route", quote: "財務審批", hint: "stage_reference" }, { role: "otherwise_route", quote: "完成流程", hint: "complete" },
      ] }),
    ],
  });
  const attachments = result.review.items.filter((item) => item.factId === "attachments.requirements");
  assert.equal(attachments.length, 2, JSON.stringify(result.review.rejections));
  assert.ok(attachments.every((item) => item.semanticComplete));
  const invoice = attachments.find((item) => item.semanticValue.kind?.includes("PDF"));
  assert.equal(invoice?.value.stage, "stage:Legal Review");
  assert.deepEqual(invoice?.semanticValue.format, ["PDF"]);
  assert.deepEqual(invoice?.semanticValue.maximum_file_size_mb, ["10"]);
  assert.deepEqual(invoice?.semanticValue.contributor_policy, ["invited colleagues may contribute"]);
  assert.deepEqual(invoice?.semanticValue.confirmation_policy, ["requester confirms"]);
  assert.equal(attachments.find((item) => item.semanticValue.kind?.includes("native form"))?.value.kind, undefined);
  const stage = result.review.items.find((item) => item.factId === "workflow.stages");
  assert.equal(stage?.semanticComplete, true);
  assert.deepEqual(stage?.semanticValue.kind, ["FYI"]);
  assert.equal(stage?.relationships[0].relationship, "parallel");
  const conditions = result.review.items.filter((item) => item.factId === "workflow.conditions");
  assert.equal(conditions.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(conditions.find((item) => item.semanticValue.value?.includes("50,000"))?.value.value, 50000);
  const chinese = conditions.find((item) => item.semanticValue.value?.includes("一億元"));
  assert.equal(chinese?.semanticComplete, true);
  assert.equal(chinese?.value.value, undefined);
  assert.deepEqual(chinese?.semanticValue.matching_route, ["財務審批"]);
});

test("isolates malformed spans while retaining notifications and review-only scalar and policy facts", () => {
  const notificationId = "message-note-001";
  const notificationText = "overdue notify requester";
  const nameId = "message-name-001";
  const nameText = "Supplier Onboarding";
  const policyId = "message-policy-001";
  const policyText = "Keep legitimate quoted requirements";
  const validNotification = located({ itemIndex: 0, kind: "notification", messageId: notificationId, text: notificationText, leaves: [
    { role: "event", quote: "overdue", hint: "overdue" }, { role: "recipient", quote: "requester", hint: "requester" },
  ] });
  const validName = located({ itemIndex: 1, kind: "workflow_name", messageId: nameId, text: nameText, leaves: [{ role: "description", quote: nameText }] });
  const validPolicy = located({ itemIndex: 2, kind: "governance_policy", messageId: policyId, text: policyText, leaves: [{ role: "rule", quote: policyText }] });
  const malformed = { ...validNotification, itemIndex: 3, anchor: { ...validNotification.anchor, endCodePoint: validNotification.anchor.endCodePoint + 1 } };
  const messages = { [notificationId]: notificationText, [nameId]: nameText, [policyId]: policyText };
  const result = assembleTemplateCopilotV3Review({ items: [malformed, validPolicy, validNotification, validName], sourceMessages: messages });
  assert.equal(result.review.items.filter((item) => item.factId === "notifications.rules").length, 1);
  assert.equal(result.review.items.find((item) => item.factId === "notifications.rules")?.semanticComplete, true);
  assert.equal(result.review.scalarFacts[0].factId, "workflow.name");
  assert.equal(result.review.policyItems[0].factId, "governance.policies");
  assert.equal(result.review.scalarFacts[0].executable, false);
  assert.ok(result.review.rejections.some((entry) => entry.itemIndex === 3 && entry.code === "untraceable_span"));
});

test("keeps a named-role stage semantically complete without inventing an explicit relationship or sequence", () => {
  const messageId = "message-stage-004";
  const text = "Manager Approval approves Finance Director";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex: 0, kind: "stage", messageId, text, leaves: [
      { role: "label", quote: "Manager Approval" },
      { role: "kind", quote: "approves", hint: "approval" },
      { role: "participant", quote: "Finance Director" },
    ] })],
  });
  const item = result.review.items[0];
  assert.equal(item.semanticComplete, true);
  assert.equal(item.complete, false);
  assert.equal(item.executable, false);
  assert.equal(item.persisted, false);
  assert.deepEqual(item.semanticValue.participant, ["Finance Director"]);
  assert.deepEqual(item.relationships, []);
  assert.ok(item.missingPaths.includes("/sequence"));
});
test("accepts an explicit matching condition route while leaving an unstated ordinary path unresolved", () => {
  const messageId = "message-cond-003";
  const text = "Amount greater than 100 routes to Manager Approval";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex: 0, kind: "condition", messageId, text, leaves: [
      { role: "field", quote: "Amount" },
      { role: "operator", quote: "greater than", hint: ">" },
      { role: "value", quote: "100" },
      { role: "matching_route", quote: "Manager Approval", hint: "stage_reference" },
    ] })],
  });
  const item = result.review.items[0];
  assert.equal(item.semanticComplete, true);
  assert.equal(item.executable, false);
  assert.ok(item.missingPaths.includes("/otherwiseRoute"));
  assert.equal(item.semanticValue.otherwise_route, undefined);
});
test("keeps identical labels from distinct source anchors isolated", () => {
  const firstId = "message-stage-isolated-001";
  const secondId = "message-stage-isolated-002";
  const firstText = "Finance Review approves requester";
  const secondText = "Finance Review audits requester";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [firstId]: firstText, [secondId]: secondText },
    items: [
      located({ itemIndex: 0, kind: "stage", messageId: firstId, text: firstText, leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "approves", hint: "approval" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ] }),
      located({ itemIndex: 1, kind: "stage", messageId: secondId, text: secondText, leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "kind", quote: "audits", hint: "review" },
        { role: "participant_mode", quote: "requester", hint: "requester" },
      ] }),
    ],
  });

  assert.equal(result.review.items.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(result.review.conflicts.length, 0);
  assert.deepEqual(new Set(result.review.items.map((entry) => entry.semanticValue.kind?.[0])), new Set(["approves", "audits"]));
  assert.ok(result.review.items.every((entry) => entry.providerItemIndexes.length === 1));
});

test("rejects each internally conflicting provider item independent of leaf order while retaining a valid sibling", () => {
  const optionId = "message-field-conflict-001";
  const optionText = "Choice none Alpha";
  const stageId = "message-stage-conflict-001";
  const stageText = "Decision approve review Finance";
  const siblingId = "message-field-sibling-001";
  const siblingText = "Purpose text required no options";
  const messages = { [optionId]: optionText, [stageId]: stageText, [siblingId]: siblingText };
  const run = (reverse) => assembleTemplateCopilotV3Review({
    sourceMessages: messages,
    items: [
      located({ itemIndex: 0, kind: "request_field", messageId: optionId, text: optionText, leaves: [
        { role: "label", quote: "Choice" },
        ...(reverse
          ? [{ role: "option", quote: "Alpha" }, { role: "option", quote: "none" }]
          : [{ role: "option", quote: "none" }, { role: "option", quote: "Alpha" }]),
      ] }),
      located({ itemIndex: 1, kind: "stage", messageId: stageId, text: stageText, leaves: [
        { role: "label", quote: "Decision" },
        ...(reverse
          ? [{ role: "kind", quote: "review", hint: "review" }, { role: "kind", quote: "approve", hint: "approval" }]
          : [{ role: "kind", quote: "approve", hint: "approval" }, { role: "kind", quote: "review", hint: "review" }]),
        { role: "participant", quote: "Finance" },
      ] }),
      located({ itemIndex: 2, kind: "request_field", messageId: siblingId, text: siblingText, leaves: [
        { role: "label", quote: "Purpose" },
        { role: "type", quote: "text", hint: "text" },
        { role: "required", quote: "required", hint: "true" },
        { role: "option", quote: "no options" },
      ] }),
    ],
  });

  const forward = run(false);
  const reversed = run(true);
  for (const result of [forward, reversed]) {
    assert.equal(result.review.items.length, 1);
    assert.equal(result.review.items[0].value.label, "Purpose");
    assert.deepEqual(
      result.review.rejections.filter((entry) => entry.code === "conflicting_leaf").map(({ itemIndex, kind, code, detail }) => ({ itemIndex, kind, code, detail })),
      [
        { itemIndex: 0, kind: "request_field", code: "conflicting_leaf", detail: "request_field:/options" },
        { itemIndex: 1, kind: "stage", code: "conflicting_leaf", detail: "stage:/kind" },
      ],
    );
  }
  assert.deepEqual(forward.review.rejections, reversed.review.rejections);
});

test("canonicalizes and deduplicates semantic projection leaves before identity", () => {
  const messageId = "message-policy-canonical-001";
  const text = "Keep legitimate quotations and preserve exact requirements";
  const firstLeaf = { role: "rule", quote: "Keep legitimate quotations" };
  const secondLeaf = { role: "rule", quote: "preserve exact requirements" };
  const assemble = (itemIndex, leaves) => assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({ itemIndex, kind: "governance_policy", messageId, text, leaves })],
  }).review.policyItems[0];
  const forward = assemble(0, [secondLeaf, firstLeaf, secondLeaf]);
  const reversed = assemble(99, [firstLeaf, secondLeaf, firstLeaf]);

  assert.equal(forward.projectionId, reversed.projectionId);
  assert.equal(
    templateCopilotV3SemanticProjectionId(forward),
    forward.projectionId,
  );
  assert.equal(templateCopilotV3SemanticProjectionId(reversed), reversed.projectionId);
  assert.equal(forward.leaves.length, 2);
  assert.deepEqual(forward.leaves, reversed.leaves);
});

test("keeps unconditional optional uploads and safely holds conditional optional uploads", () => {
  const cases = [
    {
      scenarioId: "TC-05",
      anchorQuote: "可選擇上載變更指示 PDF",
      label: "變更指示",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選擇上載",
      blockingReason: null,
    },
    {
      scenarioId: "TC-06",
      anchorQuote: "可選上載法律意見 PDF",
      label: "法律意見",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選上載",
      blockingReason: null,
    },
    {
      scenarioId: "SC-07",
      anchorQuote: "申请签证时可选上传护照资料页",
      label: "护照资料页",
      kindQuote: "上传",
      kindOccurrence: 2,
      requiredQuote: "可选上传",
      blockingReason: "unsupported_semantics_not_executable",
    },
  ];

  for (const entry of cases) {
    const scenario = templateCopilotQualificationScenarios.find(
      (candidate) => candidate.id === entry.scenarioId,
    );
    assert.ok(scenario, entry.scenarioId);
    assert.ok(
      scenario.attachments.includes(entry.anchorQuote),
      `${entry.scenarioId}:anchor`,
    );
    const messageId = `optional-upload:${entry.scenarioId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: scenario.attachments },
      items: [located({
        itemIndex: 0,
        kind: "attachment",
        messageId,
        text: scenario.attachments,
        anchorQuote: entry.anchorQuote,
        leaves: [
          { role: "label", quote: entry.label },
          {
            role: "kind",
            quote: entry.kindQuote,
            occurrence: entry.kindOccurrence,
            hint: "attachment",
          },
          {
            role: "required",
            quote: entry.requiredQuote,
            hint: "false",
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, JSON.stringify(result.review.rejections));
    assert.equal(
      item.semanticComplete,
      entry.blockingReason === null,
      entry.scenarioId,
    );
    assert.equal(
      item.blockingReason,
      entry.blockingReason ?? undefined,
      entry.scenarioId,
    );
    if (entry.blockingReason !== null) {
      assert.equal(item.fragmentId, null, entry.scenarioId);
      assert.equal(result.envelope.fragments.length, 0, entry.scenarioId);
    }
    assert.equal(item.complete, false, entry.scenarioId);
    assert.equal(item.persisted, false, entry.scenarioId);
    assert.equal(item.executable, false, entry.scenarioId);
    assert.equal(item.defaulted, false, entry.scenarioId);
    assert.deepEqual(item.value, { label: entry.label }, entry.scenarioId);
    assert.ok(item.missingPaths.includes("/kind"), entry.scenarioId);
    assert.ok(item.missingPaths.includes("/required"), entry.scenarioId);
    assert.deepEqual(
      result.review.rejections.map(({ code, detail }) => ({ code, detail })),
      [
        { code: "unverifiable_leaf", detail: "attachment:kind" },
        { code: "unverifiable_leaf", detail: "attachment:required" },
      ],
      entry.scenarioId,
    );
  }
});

test("treats Go/No-Go as a review-only approval decision without granting durable kind authority", () => {
  const messageId = "message-stage-go-no-go-001";
  const text = "投標總監先作 Go/No-Go";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "投標總監" },
        { role: "kind", quote: "Go/No-Go", hint: "approval" },
        { role: "participant", quote: "投標總監" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.complete, false);
  assert.equal(item.value.kind, undefined);
  assert.ok(item.missingPaths.includes("/kind"));
  assert.equal(item.persisted, false);
  assert.equal(item.executable, false);
  assert.deepEqual(
    result.review.rejections.map(({ code, detail }) => ({ code, detail })),
    [{ code: "unverifiable_leaf", detail: "stage:kind" }],
  );
});

test("blocks explicitly negated core semantics in English, Traditional Chinese, and Simplified Chinese without durable fragments", () => {
  const cases = [
    {
      caseId: "EN-attachment",
      kind: "attachment",
      text: "Do not upload the passport page.",
      leaves: [
        { role: "label", quote: "passport page" },
        { role: "kind", quote: "upload", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
    },
    {
      caseId: "EN-stage",
      kind: "stage",
      text: "Finance does not approve this request.",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "approve", hint: "approval" },
        { role: "participant", quote: "Finance" },
      ],
    },
    {
      caseId: "EN-notification",
      kind: "notification",
      text: "Do not notify the requester on completion.",
      leaves: [
        { role: "event", quote: "completion", hint: "request_completed" },
        { role: "recipient", quote: "requester", hint: "requester" },
      ],
    },
    {
      caseId: "TC-attachment",
      kind: "attachment",
      text: "不要上載護照資料頁。",
      leaves: [
        { role: "label", quote: "護照資料頁" },
        { role: "kind", quote: "上載", hint: "attachment" },
        { role: "required", quote: "上載", hint: "true" },
      ],
    },
    {
      caseId: "TC-stage",
      kind: "stage",
      text: "財務不批准此申請。",
      leaves: [
        { role: "label", quote: "財務" },
        { role: "kind", quote: "批准", hint: "approval" },
        { role: "participant", quote: "財務" },
      ],
    },
    {
      caseId: "TC-notification",
      kind: "notification",
      text: "不要通知申請人完成結果。",
      leaves: [
        { role: "event", quote: "完成", hint: "request_completed" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    },
    {
      caseId: "SC-attachment",
      kind: "attachment",
      text: "不要上传护照资料页。",
      leaves: [
        { role: "label", quote: "护照资料页" },
        { role: "kind", quote: "上传", hint: "attachment" },
        { role: "required", quote: "上传", hint: "true" },
      ],
    },
    {
      caseId: "SC-stage",
      kind: "stage",
      text: "财务不批准此申请。",
      leaves: [
        { role: "label", quote: "财务" },
        { role: "kind", quote: "批准", hint: "approval" },
        { role: "participant", quote: "财务" },
      ],
    },
    {
      caseId: "SC-notification",
      kind: "notification",
      text: "不要通知申请人完成结果。",
      leaves: [
        { role: "event", quote: "完成", hint: "request_completed" },
        { role: "recipient", quote: "申请人", hint: "requester" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`negation:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `negation:${entry.caseId}`,
        ...entry,
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("bare native and notification words cannot authorize context-dependent durable leaves", () => {
  const cases = [
    {
      caseId: "native-cad",
      kind: "attachment",
      text: "请上传原生 CAD 文件",
      leaves: [
        { role: "label", quote: "CAD 文件" },
        { role: "kind", quote: "原生", hint: "form" },
      ],
      path: "/kind",
      valueKey: "kind",
      rejectionDetail: "attachment:kind",
    },
    ...[
      ["not-completed", "申请未完成时通知直接相关人员", "完成", "request_completed"],
      ["not-rejected", "申请未被拒绝时通知直接相关人员", "拒绝", "request_rejected"],
      ["no-correction", "申请无需补正时通知直接相关人员", "补正", "correction_requested"],
      ["not-overdue", "申请未逾期时通知直接相关人员", "逾期", "overdue"],
      ["not-assigned", "申请未分配时通知直接相关人员", "分配", "stage_assigned"],
    ].map(([caseId, text, event, hint]) => ({
      caseId,
      kind: "notification",
      text,
      leaves: [
        { role: "event", quote: event, hint },
        { role: "recipient", quote: "直接相关人员", hint: "source_named_group" },
      ],
      path: "/event",
      valueKey: "event",
      rejectionDetail: "notification:event",
    })),
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`context-authority:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `context-authority:${entry.caseId}`,
        ...entry,
      }),
    ),
  });

  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.value[entry.valueKey], undefined, entry.caseId);
    assert.equal(
      item.bindings.some((binding) => binding.path === entry.path),
      false,
      entry.caseId,
    );
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === itemIndex &&
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === entry.rejectionDetail,
      ),
      entry.caseId,
    );
  }
});

test("rejects cross-sentence core splicing while preserving coordinated same-clause requirements", () => {
  const splicedMessageId = "message-field-spliced-001";
  const splicedText = "Purpose is optional. Amount is required.";
  const spliced = assembleTemplateCopilotV3Review({
    sourceMessages: { [splicedMessageId]: splicedText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: splicedMessageId,
      text: splicedText,
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  const splicedItem = spliced.review.items[0];
  assert.ok(splicedItem);
  assert.equal(splicedItem.semanticComplete, false);
  assert.equal(splicedItem.complete, false);
  assert.equal(splicedItem.fragmentId, null);
  assert.equal(spliced.envelope.fragments.length, 0);

  const coordinatedMessageId = "message-field-coordinated-001";
  const coordinatedText = "Purpose and amount are required";
  const coordinated = assembleTemplateCopilotV3Review({
    sourceMessages: { [coordinatedMessageId]: coordinatedText },
    items: ["Purpose", "amount"].map((label, itemIndex) =>
      located({
        itemIndex,
        kind: "request_field",
        messageId: coordinatedMessageId,
        text: coordinatedText,
        leaves: [
          { role: "label", quote: label },
          { role: "required", quote: "required", hint: "true" },
        ],
      })
    ),
  });
  assert.equal(coordinated.review.items.length, 2);
  assert.ok(
    coordinated.review.items.every((item) => item.semanticComplete === true),
  );
});

test("fails semantic completeness closed for same-anchor required conflicts and provider ambiguity", () => {
  const conflictMessageId = "message-field-required-conflict-001";
  const conflictText =
    "Purpose may be optional or required pending confirmation";
  const shared = {
    kind: "request_field",
    messageId: conflictMessageId,
    text: conflictText,
  };
  const conflicted = assembleTemplateCopilotV3Review({
    sourceMessages: { [conflictMessageId]: conflictText },
    items: [
      located({
        itemIndex: 0,
        ...shared,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "optional", hint: "false" },
        ],
      }),
      located({
        itemIndex: 1,
        ...shared,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
    ],
  });
  assert.equal(conflicted.review.items.length, 2);
  assert.equal(conflicted.review.conflicts.length, 1);
  assert.deepEqual(conflicted.review.conflicts[0].paths, ["/required"]);
  assert.ok(
    conflicted.review.items.every(
      (item) =>
        item.semanticComplete === false && item.ambiguity === "ambiguous",
    ),
  );

  const ambiguousMessageId = "message-field-ambiguous-001";
  const ambiguousText = "Purpose is required";
  const ambiguous = assembleTemplateCopilotV3Review({
    sourceMessages: { [ambiguousMessageId]: ambiguousText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: ambiguousMessageId,
      text: ambiguousText,
      ambiguity: "possible",
      leaves: [
        { role: "label", quote: "Purpose" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  assert.equal(ambiguous.review.items[0]?.semanticComplete, false);
  assert.equal(ambiguous.review.items[0]?.ambiguity, "possible");
});

test("does not let an unverifiable participant-mode hint satisfy stage completeness", () => {
  const messageId = "message-stage-participant-mode-unverified-001";
  const text = "Finance approves banana";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "approves", hint: "approval" },
        { role: "participant_mode", quote: "banana", hint: "requester" },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item);
  assert.equal(item.semanticComplete, false);
  assert.equal(item.value.participant, undefined);
  assert.ok(item.missingPaths.includes("/participant/mode"));
  assert.ok(
    result.review.rejections.some(
      ({ code, detail }) =>
        code === "unverifiable_leaf" && detail === "stage:participant_mode",
    ),
  );
});

test("preserves legitimate negative condition operators and the does-not-skip approval route", () => {
  const cases = [
    {
      caseId: "not-equal",
      text: "country not equal Hong Kong routes to Legal",
      field: "country",
      operator: "not equal",
      operatorHint: "!=",
      value: "Hong Kong",
      route: "Legal",
    },
    {
      caseId: "does-not-exceed",
      text: "amount does not exceed 100 routes to Finance",
      field: "amount",
      operator: "does not exceed",
      operatorHint: "<=",
      value: "100",
      route: "Finance",
      blockingReason: null,
    },
    {
      caseId: "does-not-skip",
      text: "Retrospective status does not skip approval",
      field: "Retrospective status",
      operator: "Retrospective",
      operatorHint: "=",
      value: "Retrospective status",
      route: "does not skip approval",
      blockingReason: "unsupported_semantics_not_executable",
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`legitimate-negative:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "condition",
        messageId: `legitimate-negative:${entry.caseId}`,
        text: entry.text,
        leaves: [
          { role: "field", quote: entry.field },
          {
            role: "operator",
            quote: entry.operator,
            hint: entry.operatorHint,
          },
          { role: "value", quote: entry.value },
          {
            role: "matching_route",
            quote: entry.route,
            hint: "stage_reference",
          },
        ],
      })
    ),
  });
  assert.equal(result.review.items.length, cases.length);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      item.semanticComplete,
      expectedBlockingReason === null,
      entry.caseId,
    );
    assert.equal(
      item.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
  }
});

test("verifies closed semantic aliases exercised by the fixed English, Traditional Chinese, and Simplified Chinese corpus", () => {
  const fieldCase = (caseId, text, label, required, requiredHint) => ({
    caseId, kind: "request_field", text, leaves: [
      { role: "label", quote: label },
      { role: "required", quote: required, hint: requiredHint },
    ],
  });
  const attachmentCase = (caseId, text, label, kind, kindHint, required, requiredHint) => ({
    caseId, kind: "attachment", text, leaves: [
      { role: "label", quote: label },
      { role: "kind", quote: kind, hint: kindHint },
      { role: "required", quote: required, hint: requiredHint },
    ],
  });
  const stageCase = (caseId, text, label, kind, kindHint) => ({
    caseId, kind: "stage", text, leaves: [
      { role: "label", quote: label },
      { role: "kind", quote: kind, hint: kindHint },
      { role: "participant", quote: label },
    ],
  });
  const conditionCase = (caseId, text, field, operator, operatorHint, value, route) => ({
    caseId, kind: "condition", text, leaves: [
      { role: "field", quote: field },
      { role: "operator", quote: operator, hint: operatorHint },
      { role: "value", quote: value },
      { role: "matching_route", quote: route, hint: "stage_reference" },
    ],
  });
  const notificationCase = (caseId, text, recipient, event, eventHint) => ({
    caseId, kind: "notification", text, leaves: [
      { role: "recipient", quote: recipient, hint: "source_named_group" },
      { role: "event", quote: event, hint: eventHint },
    ],
  });
  const cases = [
    fieldCase("EN-01-required", "Require purpose", "purpose", "Require", "true"),
    attachmentCase("EN-02-excel", "Allow an optional Excel line-item schedule", "line-item schedule", "Excel", "attachment", "optional", "false"),
    attachmentCase("EN-07-csv", "Require a data inventory CSV", "data inventory", "CSV", "attachment", "Require", "true"),
    attachmentCase("EN-03-image", "An optional image may show the proposed asset", "proposed asset", "image", "attachment", "optional", "false"),
    attachmentCase("EN-05-text", "Require one editable contract file as text", "editable contract file", "text", "attachment", "Require", "true"),
    {
      ...attachmentCase("EN-08-proof", "A retrospective request must also include proof of instruction", "proof of instruction", "proof", "attachment", "must also include", "true"),
      blockingReason: "unsupported_semantics_not_executable",
    },
    attachmentCase("EN-01-native", "Add a native justification form", "justification form", "native", "form", "Add", "true"),
    stageCase("EN-03-endorses", "Department Head endorses", "Department Head", "endorses", "approval"),
    stageCase("EN-02-compares", "the system compares invoice totals", "system", "compares", "review"),
    stageCase("EN-04-audits", "Finance audits receipts", "Finance", "audits", "review"),
    stageCase("EN-06-confirms", "Host confirms", "Host", "confirms", "approval"),
    conditionCase("EN-04-exceeds", "total exceeds 100 routes to Department Head", "total", "exceeds", ">", "100", "Department Head"),
    conditionCase("EN-08-over", "amount over 100000 routes to CEO", "amount", "over", ">", "100000", "CEO"),
    conditionCase("EN-05-boolean", "personal-data choice is Yes routes to Data Protection", "personal-data choice", "is Yes", "=", "Yes", "Data Protection"),
    conditionCase("EN-07-not-equal", "country other than Hong Kong routes to Legal", "country", "other than", "!=", "Hong Kong", "Legal"),
    notificationCase("EN-assignment", "directly involved people assignment", "directly involved people", "assignment", "stage_assigned"),
    notificationCase("EN-rejection", "directly involved people rejection", "directly involved people", "rejection", "request_rejected"),
    notificationCase("EN-correction", "directly involved people correction", "directly involved people", "correction", "correction_requested"),
    notificationCase("EN-completion", "directly involved people completion", "directly involved people", "completion", "request_completed"),

    fieldCase("TC-01-required", "必填公司中英文名稱", "公司中英文名稱", "必填", "true"),
    attachmentCase("TC-02-no-attachment", "一般年假毋須附件", "一般年假", "附件", "attachment", "毋須", "false"),
    attachmentCase("TC-01-native", "必須上載原生利益衝突聲明表", "利益衝突聲明表", "原生", "form", "必須上載", "true"),
    attachmentCase("TC-02-image", "要上載醫生證明圖片", "醫生證明", "圖片", "attachment", "要上載", "true"),
    attachmentCase("TC-05-photo", "必須上載進度照片", "進度", "照片", "attachment", "必須上載", "true"),
    stageCase("TC-review", "合規主任審查", "合規主任", "審查", "review"),
    stageCase("TC-panel-review", "質量主任評審", "質量主任", "評審", "review"),
    stageCase("TC-check", "HR 核對假期結餘", "HR", "核對", "review"),
    stageCase("TC-endorse", "商務總監認可", "商務總監", "認可", "approval"),
    stageCase("TC-confirm", "地盤工程師確認完成量", "地盤工程師", "確認", "approval"),
    { ...conditionCase("TC-over", "差異超過百分之五退回補正", "差異", "超過", ">", "百分之五", "補正"), blockingReason: "unsupported_semantics_not_executable" },
    conditionCase("TC-not-over", "總額不超過港幣二萬元完成", "總額", "不超過", "<=", "二萬元", "完成"),
    notificationCase("TC-assignment", "直接相關人士獲指派", "直接相關人士", "獲指派", "stage_assigned"),
    notificationCase("TC-rejection", "直接相關人士拒絕", "直接相關人士", "拒絕", "request_rejected"),
    notificationCase("TC-correction", "直接相關人士補正", "直接相關人士", "補正", "correction_requested"),
    notificationCase("TC-completion", "直接相關人士完成", "直接相關人士", "完成", "request_completed"),
    notificationCase("TC-overdue", "直接相關人士逾期", "直接相關人士", "逾期", "overdue"),

    fieldCase("SC-01-required", "必填項目", "項目", "必填", "true"),
    attachmentCase("SC-no-attachment", "一般申請毋须附件", "一般申請", "附件", "attachment", "毋须", "false"),
    attachmentCase("SC-native", "必须填写原生成本与工期影响表", "成本与工期影响表", "原生", "form", "必须填写", "true"),
    attachmentCase("SC-image", "必须上传文案和设计稿图片", "设计稿", "图片", "attachment", "必须上传", "true"),
    attachmentCase("SC-photo", "必须上传资产照片", "资产", "照片", "attachment", "必须上传", "true"),
    stageCase("SC-review", "品牌经理审查", "品牌经理", "审查", "review"),
    stageCase("SC-panel-review", "工程和安全并行评审", "工程和安全", "评审", "review"),
    stageCase("SC-check", "财务经理核对预算", "财务经理", "核对", "review"),
    stageCase("SC-endorse", "销售总监认可", "销售总监", "认可", "approval"),
    stageCase("SC-confirm", "部门主管确认事实", "部门主管", "确认", "approval"),
    { ...conditionCase("SC-over", "成本增加超过港币一百万元走额外审批", "成本增加", "超过", ">", "一百万元", "额外审批"), blockingReason: "unsupported_semantics_not_executable" },
    conditionCase("SC-not-over", "申请额度不超过港币一百万元由财务经理批准", "申请额度", "不超过", "<=", "一百万元", "财务经理"),
    notificationCase("SC-assignment", "直接相关人员分配", "直接相关人员", "分配", "stage_assigned"),
    notificationCase("SC-rejection", "直接相关人员拒绝", "直接相关人员", "拒绝", "request_rejected"),
    notificationCase("SC-correction", "直接相关人员补正", "直接相关人员", "补正", "correction_requested"),
    notificationCase("SC-completion", "直接相关人员完成", "直接相关人员", "完成", "request_completed"),
    notificationCase("SC-overdue", "直接相关人员逾期", "直接相关人员", "逾期", "overdue"),
  ];

  const sourceMessages = Object.fromEntries(cases.map((entry) => [`corpus:${entry.caseId}`, entry.text]));
  const items = cases.map((entry, itemIndex) => located({
    itemIndex,
    kind: entry.kind,
    messageId: `corpus:${entry.caseId}`,
    text: entry.text,
    leaves: entry.leaves,
  }));
  const result = assembleTemplateCopilotV3Review({ items, sourceMessages });
  for (const [itemIndex, entry] of cases.entries()) {
    const assembled = result.review.items.find((item) => item.providerItemIndexes.includes(itemIndex));
    assert.ok(assembled, `${entry.caseId}: ${JSON.stringify(result.review.rejections.filter((rejection) => rejection.itemIndex === itemIndex))}`);
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      assembled.semanticComplete,
      expectedBlockingReason === null,
      entry.caseId,
    );
    assert.equal(
      assembled.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
    if (expectedBlockingReason !== null) {
      assert.equal(assembled.fragmentId, null, entry.caseId);
    }
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
});

test("audits a bounded semantic operator for every fixed condition corpus entry without invented values", () => {
  const scenariosById = new Map(templateCopilotQualificationScenarios.map((scenario) => [scenario.id, scenario]));
  const audit = [
    { scenarioId: "EN-01", field: "total amount", operator: "below", operatorHint: "<", value: "HKD 50,000", route: "complete", routeHint: "complete" },
    { scenarioId: "EN-02", field: "invoice total", operator: "equals", operatorHint: "=", value: "PO total", route: "Finance Manager", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-03", field: "Board FYI", operator: "above", operatorHint: ">", value: "HKD 2,000,000", route: "Board FYI", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-04", field: "total", operator: "exceeds", operatorHint: ">", value: "HKD 10,000", route: "Department Head", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "EN-05", field: "personal-data choice", operator: "is Yes", operatorHint: "=", value: "Yes", route: "Data Protection" },
    { scenarioId: "EN-06", field: "High-risk visits", operator: "High-risk", operatorHint: "=", value: "High-risk", route: "Site Manager" },
    { scenarioId: "EN-07", field: "country", operator: "other than", operatorHint: "!=", value: "Hong Kong", valueOccurrence: 1, route: "Legal" },
    { scenarioId: "EN-08", field: "amount", operator: "at most", operatorHint: "<=", value: "HKD 100,000", route: "General Manager" },
    { scenarioId: "TC-01", field: "註冊地或銀行所在地", operator: "註冊地或銀行所在地", operatorHint: "unsupported_predicate", value: "註冊地或銀行所在地", route: "法務審查", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-02", field: "病假日數", operator: "三日或以上", operatorHint: ">=", value: "三日", route: "醫生證明", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-03", field: "估算合約額", operator: "超過", operatorHint: ">", value: "港幣一億元", route: "董事會主席" },
    { scenarioId: "TC-04", field: "高風險工序", operator: "高風險", operatorHint: "=", value: "高風險", route: "公司安全主管" },
    { scenarioId: "TC-05", field: "差異", operator: "超過", operatorHint: ">", value: "百分之五", route: "退回分判商", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-06", field: "高風險或期限超過九十日", operator: "高風險或期限超過九十日", operatorHint: "unsupported_predicate", value: "高風險或期限超過九十日", route: "行政總裁批准", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "TC-07", field: "費用", operator: "超過", operatorHint: ">", value: "港幣一萬元", route: "部門主管" },
    { scenarioId: "TC-08", field: "受限制區域", operator: "受限制區域", operatorHint: "=", value: "受限制區域", route: "資訊保安" },
    { scenarioId: "SC-01", field: "安全影响", operator: "为是", operatorHint: "=", value: "是", route: "安全评审" },
    { scenarioId: "SC-02", field: "生产数据库", operator: "生产数据库", operatorHint: "=", value: "生产数据库", route: "数据负责人", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-03", field: "客户名称", operator: "为是", operatorHint: "=", value: "是", route: "客户经理" },
    { scenarioId: "SC-04", field: "申请额度", operator: "不超过", operatorHint: "<=", value: "港币一百万元", route: "财务经理", blockingReason: "compound_predicate_not_executable" },
    { scenarioId: "SC-05", field: "含数据设备", operator: "含数据设备", operatorHint: "=", value: "含数据设备", route: "安全审批和清除证明", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-06", field: "严重程度为高或需要监管报告", operator: "严重程度为高或需要监管报告", operatorHint: "unsupported_predicate", value: "严重程度为高或需要监管报告", route: "高级管理层批准", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-07", field: "国际", operator: "国际", operatorHint: "=", value: "国际", route: "HR 和安全", blockingReason: "unsupported_semantics_not_executable" },
    { scenarioId: "SC-08", field: "有关联人士", operator: "有关联人士", operatorHint: "=", value: "有关联人士", route: "独立高管" },
  ];
  assert.deepEqual(
    audit.map((entry) => entry.scenarioId).sort(),
    templateCopilotQualificationScenarios.map((scenario) => scenario.id).sort(),
  );

  const variants = [
    { caseId: "EN-not-in", text: "country not in Hong Kong routes to Legal", field: "country", operator: "not in", operatorHint: "!=", value: "Hong Kong", route: "Legal" },
    { caseId: "TC-or-above", text: scenariosById.get("TC-02").conditions, field: "病假日數", operator: "或以上", operatorHint: ">=", value: "三日", route: "醫生證明", blockingReason: "unsupported_semantics_not_executable" },
    { caseId: "TC-declared-conflict", text: scenariosById.get("TC-01").conditions, field: "利益衝突", operator: "申報有利益衝突", operatorHint: "=", value: "利益衝突", route: "高級管理層" },
    { caseId: "SC-declared-conflict", text: "申报有利益冲突时增加高级管理层审批", field: "利益冲突", operator: "有利益冲突", operatorHint: "=", value: "利益冲突", route: "高级管理层" },
    { caseId: "TC-related-party", text: "有關聯人士時增加獨立高管審批", field: "關聯人士", operator: "有關聯人士", operatorHint: "=", value: "關聯人士", route: "獨立高管" },
    { caseId: "TC-risk-high", text: "嚴重程度為高時增加高級管理層批准", field: "嚴重程度", operator: "為高", operatorHint: "=", value: "高", route: "高級管理層" },
  ];
  const cases = [
    ...audit.map((entry) => ({
      ...entry,
      caseId: entry.scenarioId,
      text: scenariosById.get(entry.scenarioId).conditions,
    })),
    ...variants,
  ];
  for (const entry of cases) {
    for (const quote of [entry.field, entry.operator, entry.value, entry.route]) {
      assert.ok(entry.text.includes(quote), `${entry.caseId}: missing source quote ${quote}`);
    }
  }

  const sourceMessages = Object.fromEntries(cases.map((entry) => [`operator-audit:${entry.caseId}`, entry.text]));
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) => located({
      itemIndex,
      kind: "condition",
      messageId: `operator-audit:${entry.caseId}`,
      text: entry.text,
      leaves: [
        { role: "field", quote: entry.field },
        { role: "operator", quote: entry.operator, hint: entry.operatorHint },
        { role: "value", quote: entry.value, occurrence: entry.valueOccurrence ?? 0 },
        { role: "matching_route", quote: entry.route, hint: entry.routeHint ?? "stage_reference" },
      ],
    })),
  });

  assert.equal(result.review.items.length, cases.length, JSON.stringify(result.review.rejections));
  for (const [itemIndex, entry] of cases.entries()) {
    const assembled = result.review.items.find((item) => item.providerItemIndexes.includes(itemIndex));
    assert.ok(assembled, entry.caseId);
    const expectedBlockingReason = entry.blockingReason ?? null;
    if (expectedBlockingReason !== null) {
      assert.equal(assembled.semanticComplete, false, entry.caseId);
      assert.equal(assembled.complete, false, entry.caseId);
      assert.equal(assembled.fragmentId, null, entry.caseId);
      assert.equal(
        assembled.blockingReason,
        expectedBlockingReason,
        entry.caseId,
      );
    } else {
      assert.equal(assembled.semanticComplete, true, entry.caseId);
    }
    assert.deepEqual(assembled.semanticValue.field, [entry.field], entry.caseId);
    assert.deepEqual(assembled.semanticValue.operator, [entry.operator], entry.caseId);
    assert.deepEqual(assembled.semanticValue.value, [entry.value], entry.caseId);
    assert.deepEqual(assembled.semanticValue.matching_route, [entry.route], entry.caseId);
    assert.equal(assembled.defaulted, false, entry.caseId);
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
});

test("closes only a structurally authoritative exact simplified CJK yes compound", () => {
  const positives = [
    {
      caseId: "leading-copula",
      text: "安全影响为是时安全评审必须阻塞流程",
      operator: "为",
    },
    {
      caseId: "overlapping-value",
      text: "安全影响为是时安全评审必须阻塞流程",
      operator: "是",
    },
    {
      caseId: "declarative-terminal",
      text: "安全影响为是时安全评审必须阻塞流程。",
      operator: "为",
    },
    {
      caseId: "governing-cjk-colon-payload",
      text: "引用并执行以下要求：安全影响为是时安全评审必须阻塞流程",
      operator: "为",
    },
    {
      caseId: "governing-cjk-quoted-payload",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”",
      operator: "为",
    },
    {
      caseId: "governing-english-ascii-quote",
      text:
        'Enforce the following quoted requirement: "安全影响为是时安全评审必须阻塞流程"',
      operator: "为",
    },
    {
      caseId: "quote-aware-terminal-inside-payload",
      text: "引用并执行以下要求：「安全影响为是时安全评审必须阻塞流程。」",
      operator: "为",
    },
  ];
  for (const [itemIndex, entry] of positives.entries()) {
    const messageId = "closed-cjk-yes:" + entry.caseId;
    const symbols = conditionAuthoritySymbols({
      caseId: entry.caseId,
      field: "安全影响",
      route: "安全评审",
    });
    const messages = {
      [messageId]: entry.text,
      ...symbols.sourceMessages,
    };
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: messages,
      items: [
        ...symbols.items,
        located({
          itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: entry.operator, hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(
      item,
      entry.caseId + ": " + JSON.stringify(result.review.rejections),
    );
    assert.equal(item.value.operator, "=", entry.caseId);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.deepEqual(
      new Set(item.semanticValue.operator),
      new Set([entry.operator, "为是"]),
      entry.caseId,
    );
    const operatorBinding = item.bindings.find(
      (binding) => binding.path === "/operator",
    );
    assert.ok(operatorBinding, entry.caseId);
    assert.deepEqual(
      operatorBinding.spanIds.map((spanId) =>
        item.sourceSpans.find((candidate) => candidate.spanId === spanId)
          ?.exactText
      ),
      ["为是"],
      entry.caseId,
    );
    assert.ok(
      validateTemplateCopilotV3ExtractionEnvelopeSourceAuthority(
        result.envelope,
        messages,
      ),
      entry.caseId,
    );
  }

  const rejected = [
    {
      caseId: "traditional-contract-not-authorized",
      text: "安全影響為是時安全評審必須阻塞流程",
      field: "安全影響",
      operator: "為",
      value: "是",
      route: "安全評審",
    },
    {
      caseId: "negated",
      text: "安全影响不为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "question-form",
      text: "安全影响为是否需要安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "question-terminator",
      text: "安全影响为是时安全评审必须阻塞流程？",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "semicolon-terminator",
      text: "安全影响为是时安全评审必须阻塞流程；",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "compound-predicate",
      text: "安全影响为是且地区为欧盟时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "unrelated-predicate-route",
      text: "安全影响为是用于记录，地区为欧盟时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "hedged-route",
      text: "安全影响为是时预计走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "arbitrary-same-unit-prefix",
      text: "背景资料：安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "arbitrary-same-unit-suffix",
      text: "安全影响为是时安全评审必须阻塞流程供讨论",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-swallows-nonauthoritative-prefix",
      text: "仅供参考安全影响为是时走安全评审",
      field: "仅供参考安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-swallows-nonauthoritative-suffix",
      text: "安全影响仅供参考为是时走安全评审",
      field: "安全影响仅供参考",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "route-swallows-nonauthoritative-prefix",
      text: "安全影响为是时走仅供参考安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "仅供参考安全评审",
      trustedRoute: "安全评审",
    },
    {
      caseId: "route-swallows-nonauthoritative-suffix",
      text: "安全影响为是时走安全评审仅供参考",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审仅供参考",
      trustedRoute: "安全评审",
    },
    {
      caseId: "extra-cross-kind-role",
      text: "安全影响为是时走安全评审",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
      extraLeaves: [
        { role: "participant", quote: "安全评审" },
      ],
    },
    {
      caseId: "inconsistent-recovered-leaf-metadata",
      text: "安全影响为是时走安全评审",
      field: "安全影响",
      operator: "为",
      operatorRecovered: true,
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "single-quotes-swallowed-at-edges",
      text: "'安全影响为是时走安全评审'",
      field: "'安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审'",
      trustedRoute: "安全评审",
    },
    {
      caseId: "backticks-swallowed-at-edges",
      text: "`安全影响为是时走安全评审`",
      field: "`安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审`",
      trustedRoute: "安全评审",
    },
    {
      caseId: "fullwidth-quotes-swallowed-at-edges",
      text: "＂安全影响为是时走安全评审＂",
      field: "＂安全影响",
      trustedField: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审＂",
      trustedRoute: "安全评审",
    },
    {
      caseId: "bare-quote",
      text: "“安全影响为是时安全评审必须阻塞流程”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "unknown-wrapper",
      text: "Retain this text: 安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "prohibited-wrapper",
      text:
        "Do not execute the following requirement: 安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "mismatched-governing-quotes",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程」",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "governing-question-payload",
      text: "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程？”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-adjacent-prefix",
      text: "任意说明。安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-adjacent-suffix",
      text: "安全影响为是时安全评审必须阻塞流程。任意说明",
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "cropped-governing-outside-suffix",
      text:
        "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”。任意说明",
      anchorQuote:
        "引用并执行以下要求：“安全影响为是时安全评审必须阻塞流程”",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "duplicate-comparator",
      text: "安全影响为是用于记录，安全影响为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "field-outside-anchor",
      text: "安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "为是时安全评审必须阻塞流程",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
    {
      caseId: "route-outside-anchor",
      text: "安全影响为是时安全评审必须阻塞流程",
      anchorQuote: "安全影响为是",
      field: "安全影响",
      operator: "为",
      value: "是",
      route: "安全评审",
    },
  ];
  for (const [itemIndex, entry] of rejected.entries()) {
    const messageId = "closed-cjk-yes-reject:" + entry.caseId;
    const symbols = conditionAuthoritySymbols({
      caseId: "reject:" + entry.caseId,
      field: entry.trustedField ?? entry.field,
      route: entry.trustedRoute ?? entry.route,
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 100 + itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: entry.anchorQuote ?? entry.text,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: "=",
              sameLocalClauseRecovered: entry.operatorRecovered ?? false,
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
            },
            ...(entry.extraLeaves ?? []),
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(100 + itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.value.operator, undefined, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "condition:operator",
      ),
      entry.caseId + ": " + JSON.stringify(result.review.rejections),
    );
  }
});

test("same-local recovered condition evidence stays semantic review-only and fail closed", () => {
  const accepted = [
    {
      caseId: "en-operator",
      text: "If risk equals high, route to Safety Review",
      field: "risk",
      operator: "equals",
      operatorHint: "=",
      value: "high",
      route: "Safety Review",
      recoveredRoles: ["operator"],
    },
    {
      caseId: "tc-both",
      text: "若安全影響為是，則交由安全評審",
      field: "安全影響",
      operator: "為是",
      operatorHint: "=",
      value: "是",
      route: "安全評審",
      recoveredRoles: ["operator", "matching_route"],
    },
    {
      caseId: "sc-route",
      text: "如果成本增加超过一百万元则走财务总监",
      field: "成本增加",
      operator: "超过",
      operatorHint: ">",
      value: "一百万元",
      route: "财务总监",
      recoveredRoles: ["matching_route"],
    },
  ];
  for (const [itemIndex, entry] of accepted.entries()) {
    const messageId = `condition-local-recovery:${entry.caseId}`;
    const symbols = conditionAuthoritySymbols({
      caseId: entry.caseId,
      field: entry.field,
      route: entry.route,
      itemIndexBase: 910_000 + itemIndex * 10,
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorExpanded: true,
          sameLocalClauseRecoveredLeafCount: entry.recoveredRoles.length,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: entry.operatorHint,
              sameLocalClauseRecovered:
                entry.recoveredRoles.includes("operator"),
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
              sameLocalClauseRecovered:
                entry.recoveredRoles.includes("matching_route"),
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    const diagnostics = `${entry.caseId}:${JSON.stringify({
      item,
      rejections: result.review.rejections,
    })}`;
    assert.equal(item.semanticComplete, true, diagnostics);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
    if (entry.recoveredRoles.includes("operator")) {
      assert.equal(item.value.operator, undefined, entry.caseId);
    }
    if (entry.recoveredRoles.includes("matching_route")) {
      assert.equal(item.value.matchingRoute, undefined, entry.caseId);
    }
    assert.equal(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === itemIndex &&
          rejection.code === "unverifiable_leaf",
      ),
      false,
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }

  for (const [itemIndex, entry] of [
    {
      caseId: "ambiguous",
      text: "If risk equals high, route to Safety Review",
      field: "risk",
      operator: "equals",
      value: "high",
      route: "Safety Review",
      ambiguity: "possible",
    },
    {
      caseId: "compound",
      text:
        "If risk equals high and cost exceeds 100, route to Safety Review",
      field: "risk",
      operator: "equals",
      value: "high",
      route: "Safety Review",
      ambiguity: "none",
    },
  ].entries()) {
    const messageId = `condition-local-recovery-reject:${entry.caseId}`;
    const symbols = conditionAuthoritySymbols({
      caseId: `reject-${entry.caseId}`,
      field: entry.field,
      route: entry.route,
      itemIndexBase: 920_000 + itemIndex * 10,
    });
    const conditionIndex = 100 + itemIndex;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: conditionIndex,
          kind: "condition",
          messageId,
          text: entry.text,
          ambiguity: entry.ambiguity,
          anchorExpanded: true,
          sameLocalClauseRecoveredLeafCount: 1,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator,
              hint: "=",
              sameLocalClauseRecovered: true,
            },
            { role: "value", quote: entry.value },
            {
              role: "matching_route",
              quote: entry.route,
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(conditionIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.value.operator, undefined, entry.caseId);
    assert.ok(
      result.review.rejections.some(
        (rejection) =>
          rejection.itemIndex === conditionIndex &&
          rejection.code === "unverifiable_leaf" &&
          rejection.detail === "condition:operator",
      ),
      `${entry.caseId}:${JSON.stringify(result.review.rejections)}`,
    );
  }
});

test("recovered condition evidence preserves unsupported semantic holds", () => {
  const messageId = "condition-local-recovery:unsupported";
  const text =
    "If retrospective status equals yes, no approval may be bypassed";
  const field = "retrospective status";
  const route = "no approval may be bypassed";
  const symbols = conditionAuthoritySymbols({
    caseId: "unsupported-recovery",
    field,
    route,
    itemIndexBase: 930_000,
  });
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [messageId]: text,
      ...symbols.sourceMessages,
    },
    items: [
      ...symbols.items,
      located({
        itemIndex: 930_002,
        kind: "condition",
        messageId,
        text,
        anchorExpanded: true,
        sameLocalClauseRecoveredLeafCount: 1,
        leaves: [
          { role: "field", quote: field },
          {
            role: "operator",
            quote: "equals",
            hint: "=",
            sameLocalClauseRecovered: true,
          },
          { role: "value", quote: "yes" },
          {
            role: "matching_route",
            quote: route,
            hint: "unsupported_outcome",
          },
        ],
      }),
    ],
  });
  const item = result.review.items.find((candidate) =>
    candidate.providerItemIndexes.includes(930_002)
  );
  assert.ok(item);
  assert.equal(item.value.operator, undefined);
  assert.equal(item.complete, false);
  assert.equal(item.executable, false);
  assert.equal(item.blockingReason, "unsupported_semantics_not_executable");
});

test("requires clean unique first-pass field and stage symbols for split operator recovery", () => {
  const messageId = "condition-symbol-gate:condition";
  const text = "安全影响为是时走安全评审";
  const condition = located({
    itemIndex: 777,
    kind: "condition",
    messageId,
    text,
    leaves: [
      { role: "field", quote: "安全影响" },
      { role: "operator", quote: "为", hint: "=" },
      { role: "value", quote: "是" },
      {
        role: "matching_route",
        quote: "安全评审",
        hint: "stage_reference",
      },
    ],
  });
  const symbols = conditionAuthoritySymbols({
    caseId: "symbol-gate",
    field: "安全影响",
    route: "安全评审",
  });
  const [fieldSymbol, stageSymbol] = symbols.items;
  assert.ok(fieldSymbol);
  assert.ok(stageSymbol);
  const sourceMessages = {
    [messageId]: text,
    ...symbols.sourceMessages,
  };
  const assemble = (symbolItems, extraMessages = {}) =>
    assembleTemplateCopilotV3Review({
      sourceMessages: { ...sourceMessages, ...extraMessages },
      items: [...symbolItems, condition],
    });
  const recoveredOperator = (result) =>
    result.review.items.find((item) =>
      item.providerItemIndexes.includes(777)
    )?.value.operator;
  assert.equal(recoveredOperator(assemble(symbols.items)), "=");

  const unrelatedMessageId = "condition-symbol-gate:unrelated-rejection";
  const unrelatedText = "unrelated";
  const unrelatedRejectedItem = located({
    itemIndex: fieldSymbol.itemIndex,
    kind: "notification",
    messageId: unrelatedMessageId,
    text: unrelatedText,
    leaves: [{ role: "label", quote: unrelatedText }],
  });
  assert.equal(
    recoveredOperator(
      assemble(
        [unrelatedRejectedItem, ...symbols.items],
        { [unrelatedMessageId]: unrelatedText },
      ),
    ),
    "=",
    "a rejection with a colliding batch-local item index",
  );

  const recoveredFieldSymbol = Object.freeze({
    ...fieldSymbol,
    sameLocalClauseRecoveredLeafCount: 1,
    leaves: Object.freeze(fieldSymbol.leaves.map((leaf, index) =>
      Object.freeze({
        ...leaf,
        sameLocalClauseRecovered: index === 0,
      })
    )),
  });
  const rejectedFieldSymbol = Object.freeze({
    ...fieldSymbol,
    leaves: Object.freeze([
      ...fieldSymbol.leaves,
      Object.freeze({
        ...fieldSymbol.leaves[0],
        role: "event",
      }),
    ]),
  });
  const duplicateMessageId = "condition-symbol-gate:duplicate-field";
  const duplicateText = "必填安全影响";
  const duplicateField = located({
    itemIndex: 900_002,
    kind: "request_field",
    messageId: duplicateMessageId,
    text: duplicateText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  const unsafeSymbolSets = [
    [stageSymbol],
    [fieldSymbol],
    [{ ...fieldSymbol, slot: "conditions_exceptions" }, stageSymbol],
    [fieldSymbol, { ...stageSymbol, slot: "conditions_exceptions" }],
    [{ ...fieldSymbol, ambiguity: "possible" }, stageSymbol],
    [fieldSymbol, { ...stageSymbol, anchorExpanded: true }],
    [recoveredFieldSymbol, stageSymbol],
    [rejectedFieldSymbol, stageSymbol],
  ];
  for (const [index, symbolItems] of unsafeSymbolSets.entries()) {
    assert.equal(
      recoveredOperator(assemble(symbolItems)),
      undefined,
      "unsafe symbol set " + index,
    );
  }
  const duplicateResult = assemble(
    [...symbols.items, duplicateField],
    { [duplicateMessageId]: duplicateText },
  );
  assert.equal(
    recoveredOperator(duplicateResult),
    undefined,
    "duplicate field definition: " + JSON.stringify({
      rejections: duplicateResult.review.rejections,
      fields: duplicateResult.review.items.filter(
        (item) => item.factId === "request.fields",
      ).map((item) => ({
        value: item.value,
        semanticComplete: item.semanticComplete,
        ambiguity: item.ambiguity,
        sourceAnchors: item.sourceAnchors.map((span) => span.exactText),
      })),
    }),
  );

  const trailingRequiredId = "condition-symbol-gate:trailing-required";
  const trailingRequiredText = "安全影响必填";
  const trailingRequiredField = located({
    itemIndex: 900_003,
    kind: "request_field",
    messageId: trailingRequiredId,
    text: trailingRequiredText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  assert.equal(
    recoveredOperator(assemble(
      [trailingRequiredField, stageSymbol],
      { [trailingRequiredId]: trailingRequiredText },
    )),
    "=",
    "an exact label followed immediately by its required marker",
  );

  const neutralPrefixId = "condition-symbol-gate:neutral-field-prefix";
  const neutralPrefixText = "系统说明安全影响必填";
  const neutralPrefixField = located({
    itemIndex: 900_004,
    kind: "request_field",
    messageId: neutralPrefixId,
    text: neutralPrefixText,
    leaves: [
      { role: "label", quote: "安全影响" },
      { role: "required", quote: "必填", hint: "true" },
    ],
  });
  assert.equal(
    recoveredOperator(assemble(
      [neutralPrefixField, stageSymbol],
      { [neutralPrefixId]: neutralPrefixText },
    )),
    undefined,
    "neutral prose before a field cannot seed condition authority",
  );

  for (const [index, [opening, closing]] of [
    ['"', '"'],
    ["“", "”"],
    ["《", "》"],
    ["【", "】"],
    ["`", "`"],
    ["'", "'"],
    ["[", "]"],
    ["«", "»"],
    ["〝", "〞"],
    ["❝", "❞"],
    ["❛", "❜"],
    ["｟", "｠"],
    ["⟪", "⟫"],
    ["﹁", "﹂"],
    ["<", ">"],
    ["＜", "＞"],
    ["> ", ""],
    ["′", "′"],
    ["″", "″"],
    ["‵", "‵"],
    ["‶", "‶"],
  ].entries()) {
    for (const cropped of [false, true]) {
      const quotedFieldId =
        `condition-symbol-gate:quoted-field:${index}:${cropped}`;
      const quotedFieldInner = "必填安全影响";
      const quotedFieldText = opening + quotedFieldInner + closing;
      const quotedField = located({
        itemIndex: 910_000 + index * 10 + Number(cropped),
        kind: "request_field",
        messageId: quotedFieldId,
        text: quotedFieldText,
        anchorQuote: cropped ? quotedFieldInner : quotedFieldText,
        leaves: [
          { role: "label", quote: "安全影响" },
          { role: "required", quote: "必填", hint: "true" },
        ],
      });
      assert.equal(
        recoveredOperator(
          assemble(
            [quotedField, stageSymbol],
            { [quotedFieldId]: quotedFieldText },
          ),
        ),
        undefined,
        `quoted field ${index}:${cropped}`,
      );

      const quotedStageId =
        `condition-symbol-gate:quoted-stage:${index}:${cropped}`;
      const quotedStageInner = "安全评审审批申请人";
      const quotedStageText = opening + quotedStageInner + closing;
      const quotedStage = located({
        itemIndex: 920_000 + index * 10 + Number(cropped),
        kind: "stage",
        messageId: quotedStageId,
        text: quotedStageText,
        anchorQuote: cropped ? quotedStageInner : quotedStageText,
        leaves: [
          { role: "label", quote: "安全评审" },
          { role: "kind", quote: "审批", hint: "approval" },
          {
            role: "participant_mode",
            quote: "申请人",
            hint: "requester",
          },
        ],
      });
      assert.equal(
        recoveredOperator(
          assemble(
            [fieldSymbol, quotedStage],
            { [quotedStageId]: quotedStageText },
          ),
        ),
        undefined,
        `quoted stage ${index}:${cropped}`,
      );
    }
  }


  const metaPrefixes = [...new Set([
    "示例",
    "例子",
    "例如",
    "历史",
    "歷史",
    "供参考",
    "供參考",
    "参考资料",
    "參考資料",
    "背景资料",
    "背景資料",
    "示意",
    "摘录",
    "摘錄",
    "原文",
    "以下为引述",
    "以下為引述",
    "草稿",
    "旧版",
    "舊版",
    "存档",
    "存檔",
    "演示",
    "样本",
    "樣本",
    "假设",
    "假設",
    "备忘",
    "備忘",
    "转述",
    "轉述",
    "节选",
    "節選",
    "摘自",
  ].flatMap((prefix) => [
    "",
    " ",
    "\u200B",
    "\u2060",
    "\uFE00",
    "\u0301",
    "\u20DD",
    "\u00AD",
    "\t",
  ].map((joiner) => Array.from(prefix).join(joiner))))];
  for (const [index, prefix] of metaPrefixes.entries()) {
    for (const [variantIndex, fieldText] of [
      `${prefix}安全影响必填`,
      `必填${prefix}、安全影响`,
    ].entries()) {
      const fieldId =
        `condition-symbol-gate:meta-field:${index}:${variantIndex}`;
      const metaField = located({
        itemIndex: 930_000 + index * 10 + variantIndex,
        kind: "request_field",
        messageId: fieldId,
        text: fieldText,
        leaves: [
          { role: "label", quote: "安全影响" },
          { role: "required", quote: "必填", hint: "true" },
        ],
      });
      assert.equal(
        recoveredOperator(assemble(
          [metaField, stageSymbol],
          { [fieldId]: fieldText },
        )),
        undefined,
        `meta field ${index}:${variantIndex}`,
      );
    }

    const exactStageId = `condition-symbol-gate:meta-stage-exact:${index}`;
    const exactStageText = `${prefix}：安全评审审批申请人`;
    const exactStage = located({
      itemIndex: 940_000 + index,
      kind: "stage",
      messageId: exactStageId,
      text: exactStageText,
      leaves: [
        { role: "label", quote: "安全评审" },
        { role: "kind", quote: "审批", hint: "approval" },
        { role: "participant_mode", quote: "申请人", hint: "requester" },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, exactStage],
        { [exactStageId]: exactStageText },
      )),
      undefined,
      `meta exact stage ${index}`,
    );

    const compositeStageId =
      `condition-symbol-gate:meta-stage-composite:${index}`;
    const compositeStageText =
      `${prefix}：工程、商务和安全并行评审各自影响`;
    const compositeStage = located({
      itemIndex: 950_000 + index,
      kind: "stage",
      messageId: compositeStageId,
      text: compositeStageText,
      leaves: [
        { role: "label", quote: "安全" },
        { role: "kind", quote: "评审", hint: "review" },
        { role: "participant", quote: "安全" },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, compositeStage],
        { [compositeStageId]: compositeStageText },
      )),
      undefined,
      `meta composite stage ${index}`,
    );
  }

  for (const [index, entry] of [
    {
      text: "工程、商务和安 全并行评审各自影响",
      label: "安 全",
      kind: "评审",
    },
    {
      text: "工程、商务和安\u200B全并行评审各自影响",
      label: "安\u200B全",
      kind: "评审",
    },
    {
      text: "工程、商务和安全并行评 审各自影响",
      label: "安全",
      kind: "评 审",
    },
    {
      text: "工程、商务和安全并行评\u200B审各自影响",
      label: "安全",
      kind: "评\u200B审",
    },
  ].entries()) {
    const stageId = `condition-symbol-gate:obscured-stage-part:${index}`;
    const obscuredStage = located({
      itemIndex: 960_000 + index,
      kind: "stage",
      messageId: stageId,
      text: entry.text,
      leaves: [
        { role: "label", quote: entry.label },
        { role: "kind", quote: entry.kind, hint: "review" },
        { role: "participant", quote: entry.label },
      ],
    });
    assert.equal(
      recoveredOperator(assemble(
        [fieldSymbol, obscuredStage],
        { [stageId]: entry.text },
      )),
      undefined,
      `obscured stage part ${index}`,
    );
  }
});

test("requires independently compiled adjacent authority units for the real SC-01 and SC-03 split conditions", () => {
  const sc01Id = "condition-authority:sc01";
  const sc01Text =
    "安全影响为是时安全评审必须阻塞流程。成本增加超过港币一百万元走额外审批。紧急选项不能跳过审批。任何拒绝退回修改。";
  const sc01Symbols = conditionAuthoritySymbols({
    caseId: "sc01",
    field: "安全影响",
    route: "安全评审",
  });
  const sc01Items = [
    ...sc01Symbols.items,
    located({
      itemIndex: 0,
      kind: "condition",
      messageId: sc01Id,
      text: sc01Text,
      anchorQuote: "安全影响为是时安全评审必须阻塞流程",
      leaves: [
        { role: "field", quote: "安全影响" },
        { role: "operator", quote: "为", hint: "=" },
        { role: "value", quote: "是" },
        {
          role: "matching_route",
          quote: "安全评审",
          hint: "stage_reference",
        },
      ],
    }),
    located({
      itemIndex: 1,
      kind: "condition",
      messageId: sc01Id,
      text: sc01Text,
      anchorQuote: "成本增加超过港币一百万元走额外审批",
      leaves: [
        { role: "field", quote: "成本增加" },
        { role: "operator", quote: "超过", hint: ">" },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "unsupported_outcome",
        },
      ],
    }),
  ];
  for (const items of [sc01Items, [...sc01Items].reverse()]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc01Id]: sc01Text,
        ...sc01Symbols.sourceMessages,
      },
      items,
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(0)
    );
    assert.equal(split?.value.operator, "=", "SC-01 item order");
    assert.equal(split?.semanticComplete, true, "SC-01 item order");
  }

  const sc03Id = "condition-authority:sc03";
  const sc03Text =
    "性能声明必须经过法务和产品审批。客户名称为是时增加客户经理。若目标地区不是香港，增加当地合规审查。拒绝退回修改。";
  const sc03Symbols = conditionAuthoritySymbols({
    caseId: "sc03",
    field: "客户名称",
    route: "客户经理",
  });
  const sc03StageSymbolId = "condition-authority:sc03:stage-symbol";
  const sc03StageSymbolText = "涉及客户名称时客户经理也审批";
  const sc03StageSymbol = located({
    itemIndex: 900_020,
    kind: "stage",
    messageId: sc03StageSymbolId,
    text: sc03StageSymbolText,
    leaves: [
      { role: "label", quote: "客户经理" },
      { role: "kind", quote: "审批", hint: "approval" },
      { role: "participant", quote: "客户经理" },
    ],
  });
  const sc03SymbolItems = [sc03Symbols.items[0], sc03StageSymbol];
  const sc03Items = [
    ...sc03SymbolItems,
    located({
      itemIndex: 10,
      kind: "condition",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "客户名称为是时增加客户经理",
      leaves: [
        { role: "field", quote: "客户名称" },
        { role: "operator", quote: "为", hint: "=" },
        { role: "value", quote: "是" },
        {
          role: "matching_route",
          quote: "客户经理",
          hint: "stage_reference",
        },
      ],
    }),
    located({
      itemIndex: 11,
      kind: "stage",
      slot: "conditions_exceptions",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "性能声明必须经过法务和产品审批",
      leaves: [
        { role: "label", quote: "法务和产品" },
        { role: "kind", quote: "审批", hint: "approval" },
        { role: "participant", quote: "法务和产品" },
      ],
    }),
    located({
      itemIndex: 12,
      kind: "condition",
      messageId: sc03Id,
      text: sc03Text,
      anchorQuote: "若目标地区不是香港，增加当地合规审查",
      leaves: [
        { role: "field", quote: "目标地区" },
        { role: "operator", quote: "不是", hint: "!=" },
        { role: "value", quote: "香港" },
        {
          role: "matching_route",
          quote: "当地合规审查",
          hint: "stage_reference",
        },
      ],
    }),
  ];
  for (const items of [sc03Items, [...sc03Items].reverse()]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc03Id]: sc03Text,
        [sc03StageSymbolId]: sc03StageSymbolText,
        ...sc03Symbols.sourceMessages,
      },
      items,
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(10)
    );
    assert.equal(split?.value.operator, "=", "SC-03 item order");
    assert.equal(split?.semanticComplete, true, "SC-03 item order");
  }
  for (const omittedItemIndex of [11, 12]) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [sc03Id]: sc03Text,
        [sc03StageSymbolId]: sc03StageSymbolText,
        ...sc03Symbols.sourceMessages,
      },
      items: sc03Items.filter(
        (item) => item.itemIndex !== omittedItemIndex,
      ),
    });
    const split = result.review.items.find((item) =>
      item.providerItemIndexes.includes(10)
    );
    assert.equal(
      split?.value.operator,
      undefined,
      "SC-03 missing " + omittedItemIndex,
    );
    assert.equal(split?.semanticComplete, false);
  }
});

test("does not let incomplete, unsafe, remote, connector-led, or deferred siblings provide condition authority", () => {
  const baseId = "condition-authority:unsafe-neighbor";
  const baseText =
    "安全影响为是时走安全评审。成本增加超过一百万元走额外审批";
  const baseSymbols = conditionAuthoritySymbols({
    caseId: "unsafe-neighbor",
    field: "安全影响",
    route: "安全评审",
  });
  const split = located({
    itemIndex: 20,
    kind: "condition",
    messageId: baseId,
    text: baseText,
    anchorQuote: "安全影响为是时走安全评审",
    leaves: [
      { role: "field", quote: "安全影响" },
      { role: "operator", quote: "为", hint: "=" },
      { role: "value", quote: "是" },
      {
        role: "matching_route",
        quote: "安全评审",
        hint: "stage_reference",
      },
    ],
  });
  const neighbor = (overrides = {}) =>
    located({
      itemIndex: 21,
      kind: "condition",
      messageId: baseId,
      text: baseText,
      anchorQuote: "成本增加超过一百万元走额外审批",
      leaves: [
        { role: "field", quote: "成本增加" },
        { role: "operator", quote: "超过", hint: ">" },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "stage_reference",
        },
      ],
      ...overrides,
    });

  const incomplete = neighbor({
    leaves: [
      { role: "field", quote: "成本增加" },
      { role: "operator", quote: "超过", hint: ">" },
      { role: "value", quote: "一百万元" },
    ],
  });
  const unsafeNeighbors = [
    incomplete,
    neighbor({ ambiguity: "possible" }),
    neighbor({ anchorExpanded: true }),
    neighbor({
      sameLocalClauseRecoveredLeafCount: 1,
      leaves: [
        { role: "field", quote: "成本增加" },
        {
          role: "operator",
          quote: "超过",
          hint: ">",
          sameLocalClauseRecovered: true,
        },
        { role: "value", quote: "一百万元" },
        {
          role: "matching_route",
          quote: "额外审批",
          hint: "stage_reference",
        },
      ],
    }),
  ];
  for (const [index, unsafeNeighbor] of unsafeNeighbors.entries()) {
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [baseId]: baseText,
        ...baseSymbols.sourceMessages,
      },
      items: [...baseSymbols.items, split, unsafeNeighbor],
    });
    const splitItem = result.review.items.find((item) =>
      item.providerItemIndexes.includes(20)
    );
    assert.equal(splitItem?.value.operator, undefined, "unsafe " + index);
    assert.equal(splitItem?.semanticComplete, false, "unsafe " + index);
  }

  for (const [index, entry] of [
    {
      text:
        "安全影响为是时走安全评审。背景资料：成本增加超过一百万元走额外审批",
      neighborAnchor: "背景资料：成本增加超过一百万元走额外审批",
    },
    {
      text:
        "安全影响为是时走安全评审。“成本增加超过一百万元走额外审批”",
      neighborAnchor: "“成本增加超过一百万元走额外审批”",
    },
  ].entries()) {
    const messageId = "condition-authority:meta-neighbor:" + index;
    const symbols = conditionAuthoritySymbols({
      caseId: "meta-neighbor:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: entry.text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 40 + index * 2,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 41 + index * 2,
          kind: "condition",
          messageId,
          text: entry.text,
          anchorQuote: entry.neighborAnchor,
          leaves: [
            { role: "field", quote: "成本增加" },
            { role: "operator", quote: "超过", hint: ">" },
            { role: "value", quote: "一百万元" },
            {
              role: "matching_route",
              quote: "额外审批",
              hint: "stage_reference",
            },
          ],
        }),
      ],
    });
    const splitItem = result.review.items.find((item) =>
      item.providerItemIndexes.includes(40 + index * 2)
    );
    assert.equal(splitItem?.value.operator, undefined, "meta " + index);
    assert.equal(splitItem?.semanticComplete, false, "meta " + index);
  }

  const stageMetaId = "condition-authority:stage-meta-neighbor";
  const stageMetaText =
    "背景资料：性能声明必须经过法务和产品审批。客户名称为是时增加客户经理";
  const stageMetaSymbols = conditionAuthoritySymbols({
    caseId: "stage-meta-neighbor",
    field: "客户名称",
    route: "客户经理",
  });
  const stageMetaResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [stageMetaId]: stageMetaText,
      ...stageMetaSymbols.sourceMessages,
    },
    items: [
      ...stageMetaSymbols.items,
      located({
        itemIndex: 50,
        kind: "condition",
        messageId: stageMetaId,
        text: stageMetaText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 51,
        kind: "stage",
        slot: "conditions_exceptions",
        messageId: stageMetaId,
        text: stageMetaText,
        anchorQuote: "背景资料：性能声明必须经过法务和产品审批",
        leaves: [
          { role: "label", quote: "法务和产品" },
          { role: "kind", quote: "审批", hint: "approval" },
          { role: "participant", quote: "法务和产品" },
        ],
      }),
    ],
  });
  const stageMetaSplit = stageMetaResult.review.items.find((item) =>
    item.providerItemIndexes.includes(50)
  );
  assert.equal(stageMetaSplit?.value.operator, undefined);
  assert.equal(stageMetaSplit?.semanticComplete, false);

  for (const [index, stageUnit] of [
    "法务仅供参考审批",
    "仅供参考但必须经过法务审批",
    "这是示例但必须经过法务审批",
    "不要执行但必须经过法务审批",
  ].entries()) {
    const messageId = "condition-authority:stage-laundering:" + index;
    const text = "安全影响为是时走安全评审。" + stageUnit;
    const symbols = conditionAuthoritySymbols({
      caseId: "stage-laundering:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 60 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 61 + index * 2,
          kind: "stage",
          slot: "conditions_exceptions",
          messageId,
          text,
          anchorQuote: stageUnit,
          leaves: [
            { role: "label", quote: "法务" },
            { role: "kind", quote: "审批", hint: "approval" },
            { role: "participant", quote: "法务" },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(60 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "stage " + index);
    assert.equal(target?.semanticComplete, false, "stage " + index);
  }

  for (const [index, entry] of [
    {
      neighbor: "仅供参考成本增加超过100走额外审批",
      field: "仅供参考成本增加",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加仅供参考超过100走额外审批",
      field: "成本增加仅供参考",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过100走仅供参考额外审批",
      field: "成本增加",
      route: "仅供参考额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过100走额外审批仅供参考",
      field: "成本增加",
      route: "额外审批仅供参考",
      routeHint: "unsupported_outcome",
    },
    {
      neighbor: "成本增加背景资料100走额外审批",
      field: "成本增加",
      operator: "背景资料",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加背 景 资 料100走额外审批",
      field: "成本增加",
      operator: "背 景 资 料",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加草稿100走额外审批",
      field: "成本增加",
      operator: "草稿",
      operatorHint: "unsupported_predicate",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过背景资料100走额外审批",
      field: "成本增加",
      value: "背景资料100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过背景资料100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过草稿100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "成本增加超过任意说明100走额外审批",
      field: "成本增加",
      value: "100",
      route: "额外审批",
      routeHint: "stage_reference",
    },
    {
      neighbor: "[成本增加超过100走额外审批]",
      field: "[成本增加",
      route: "额外审批]",
      routeHint: "stage_reference",
    },
    {
      neighbor: "«成本增加超过100走额外审批»",
      field: "«成本增加",
      route: "额外审批»",
      routeHint: "stage_reference",
    },
  ].entries()) {
    const messageId = "condition-authority:swallowed-neighbor:" + index;
    const text = "安全影响为是时走安全评审。" + entry.neighbor;
    const symbols = conditionAuthoritySymbols({
      caseId: "swallowed-neighbor:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 200 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 201 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: entry.neighbor,
          leaves: [
            { role: "field", quote: entry.field },
            {
              role: "operator",
              quote: entry.operator ?? "超过",
              hint: entry.operatorHint ?? ">",
            },
            { role: "value", quote: entry.value ?? "100" },
            {
              role: "matching_route",
              quote: entry.route,
              hint: entry.routeHint,
            },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(200 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "condition " + index);
    assert.equal(target?.semanticComplete, false, "condition " + index);
  }

  for (const [index, entry] of [
    { unit: "法务仅供参考审批", actor: "法务仅供参考" },
    { unit: "仅供参考法务审批", actor: "仅供参考法务" },
    { unit: "示例法务审批", actor: "示例法务" },
  ].entries()) {
    const messageId = "condition-authority:swallowed-stage:" + index;
    const text = "安全影响为是时走安全评审。" + entry.unit;
    const symbols = conditionAuthoritySymbols({
      caseId: "swallowed-stage:" + index,
      field: "安全影响",
      route: "安全评审",
    });
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: {
        [messageId]: text,
        ...symbols.sourceMessages,
      },
      items: [
        ...symbols.items,
        located({
          itemIndex: 300 + index * 2,
          kind: "condition",
          messageId,
          text,
          anchorQuote: "安全影响为是时走安全评审",
          leaves: [
            { role: "field", quote: "安全影响" },
            { role: "operator", quote: "为", hint: "=" },
            { role: "value", quote: "是" },
            {
              role: "matching_route",
              quote: "安全评审",
              hint: "stage_reference",
            },
          ],
        }),
        located({
          itemIndex: 301 + index * 2,
          kind: "stage",
          slot: "conditions_exceptions",
          messageId,
          text,
          anchorQuote: entry.unit,
          leaves: [
            { role: "label", quote: entry.actor },
            { role: "kind", quote: "审批", hint: "approval" },
            { role: "participant", quote: entry.actor },
          ],
        }),
      ],
    });
    const target = result.review.items.find((item) =>
      item.providerItemIndexes.includes(300 + index * 2)
    );
    assert.equal(target?.value.operator, undefined, "stage swallow " + index);
    assert.equal(target?.semanticComplete, false, "stage swallow " + index);
  }

  const remoteId = "condition-authority:remote-neighbor";
  const remoteText = "成本增加超过一百万元走额外审批";
  const remoteNeighbor = located({
    itemIndex: 22,
    kind: "condition",
    messageId: remoteId,
    text: remoteText,
    leaves: [
      { role: "field", quote: "成本增加" },
      { role: "operator", quote: "超过", hint: ">" },
      { role: "value", quote: "一百万元" },
      {
        role: "matching_route",
        quote: "额外审批",
        hint: "stage_reference",
      },
    ],
  });
  const remoteResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [baseId]: baseText,
      [remoteId]: remoteText,
      ...baseSymbols.sourceMessages,
    },
    items: [...baseSymbols.items, split, remoteNeighbor],
  });
  const remoteSplit = remoteResult.review.items.find((item) =>
    item.providerItemIndexes.includes(20)
  );
  assert.equal(remoteSplit?.value.operator, undefined);
  assert.equal(remoteSplit?.semanticComplete, false);

  const connectorId = "condition-authority:connector";
  const connectorText =
    "安全影响为是时走安全评审。且成本增加超过一百万元走额外审批";
  const connectorSymbols = conditionAuthoritySymbols({
    caseId: "connector",
    field: "安全影响",
    route: "安全评审",
  });
  const connectorResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [connectorId]: connectorText,
      ...connectorSymbols.sourceMessages,
    },
    items: [
      ...connectorSymbols.items,
      located({
        itemIndex: 23,
        kind: "condition",
        messageId: connectorId,
        text: connectorText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 24,
        kind: "condition",
        messageId: connectorId,
        text: connectorText,
        anchorQuote: "且成本增加超过一百万元走额外审批",
        leaves: [
          { role: "field", quote: "成本增加" },
          { role: "operator", quote: "超过", hint: ">" },
          { role: "value", quote: "一百万元" },
          {
            role: "matching_route",
            quote: "额外审批",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const connectorSplit = connectorResult.review.items.find((item) =>
    item.providerItemIndexes.includes(23)
  );
  assert.equal(connectorSplit?.value.operator, undefined);
  assert.equal(connectorSplit?.semanticComplete, false);

  const circularId = "condition-authority:circular";
  const circularText =
    "安全影响为是时走安全评审。客户名称为是时增加客户经理。成本增加超过一百万元走额外审批";
  const circularFirstSymbols = conditionAuthoritySymbols({
    caseId: "circular:first",
    field: "安全影响",
    route: "安全评审",
  });
  const circularSecondSymbols = conditionAuthoritySymbols({
    caseId: "circular:second",
    field: "客户名称",
    route: "客户经理",
    itemIndexBase: 900_010,
  });
  const circularResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [circularId]: circularText,
      ...circularFirstSymbols.sourceMessages,
      ...circularSecondSymbols.sourceMessages,
    },
    items: [
      ...circularFirstSymbols.items,
      ...circularSecondSymbols.items,
      located({
        itemIndex: 25,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是", occurrence: 0 },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 26,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          { role: "operator", quote: "为", hint: "=", occurrence: 1 },
          { role: "value", quote: "是", occurrence: 1 },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 27,
        kind: "condition",
        messageId: circularId,
        text: circularText,
        anchorQuote: "成本增加超过一百万元走额外审批",
        leaves: [
          { role: "field", quote: "成本增加" },
          { role: "operator", quote: "超过", hint: ">" },
          { role: "value", quote: "一百万元" },
          {
            role: "matching_route",
            quote: "额外审批",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  for (const itemIndex of [25, 26]) {
    const item = circularResult.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.equal(item?.value.operator, undefined, "circular " + itemIndex);
    assert.equal(item?.semanticComplete, false, "circular " + itemIndex);
  }

  const disguisedId = "condition-authority:disguised-circular";
  const disguisedText =
    "安全影响为是时走安全评审。客户名称为是时增加客户经理";
  const disguisedSymbols = conditionAuthoritySymbols({
    caseId: "disguised-circular",
    field: "安全影响",
    route: "安全评审",
  });
  const disguisedResult = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [disguisedId]: disguisedText,
      ...disguisedSymbols.sourceMessages,
    },
    items: [
      ...disguisedSymbols.items,
      located({
        itemIndex: 80,
        kind: "condition",
        messageId: disguisedId,
        text: disguisedText,
        anchorQuote: "安全影响为是时走安全评审",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是", occurrence: 0 },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 81,
        kind: "condition",
        messageId: disguisedId,
        text: disguisedText,
        anchorQuote: "客户名称为是时增加客户经理",
        leaves: [
          { role: "field", quote: "客户名称" },
          {
            role: "operator",
            quote: "为",
            hint: "unsupported_predicate",
            occurrence: 1,
          },
          { role: "value", quote: "是", occurrence: 1 },
          {
            role: "matching_route",
            quote: "客户经理",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const disguisedTarget = disguisedResult.review.items.find((item) =>
    item.providerItemIndexes.includes(80)
  );
  assert.equal(disguisedTarget?.value.operator, undefined);
  assert.equal(disguisedTarget?.semanticComplete, false);
});

test("treats a blank line as an authority block boundary", () => {
  const messageId = "condition-authority:blank-block";
  const text =
    "任意非权威说明\n\n安全影响为是时安全评审必须阻塞流程";
  const symbols = conditionAuthoritySymbols({
    caseId: "blank-block",
    field: "安全影响",
    route: "安全评审",
  });
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [messageId]: text,
      ...symbols.sourceMessages,
    },
    items: [
      ...symbols.items,
      located({
        itemIndex: 30,
        kind: "condition",
        messageId,
        text,
        anchorQuote: "安全影响为是时安全评审必须阻塞流程",
        leaves: [
          { role: "field", quote: "安全影响" },
          { role: "operator", quote: "为", hint: "=" },
          { role: "value", quote: "是" },
          {
            role: "matching_route",
            quote: "安全评审",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });
  const item = result.review.items.find((candidate) =>
    candidate.providerItemIndexes.includes(30)
  );
  assert.equal(item?.value.operator, "=");
  assert.equal(item?.semanticComplete, true);
});


test("keeps semantic aliases closed and advisory hints non-authoritative", () => {
  const cases = [
    { kind: "request_field", text: "purpose prerequisite", leaves: [
      { role: "label", quote: "purpose" }, { role: "required", quote: "prerequisite", hint: "true" },
    ] },
    { kind: "attachment", text: "photographic evidence required", leaves: [
      { role: "label", quote: "evidence" }, { role: "kind", quote: "photographic", hint: "attachment" }, { role: "required", quote: "required", hint: "true" },
    ] },
    { kind: "stage", text: "Finance previews requester", leaves: [
      { role: "label", quote: "Finance" }, { role: "kind", quote: "previews", hint: "review" }, { role: "participant_mode", quote: "requester", hint: "requester" },
    ] },
    { kind: "condition", text: "turnover 100 routes to Finance", leaves: [
      { role: "field", quote: "turnover" }, { role: "operator", quote: "turnover", hint: ">" }, { role: "value", quote: "100" }, { role: "matching_route", quote: "Finance", hint: "stage_reference" },
    ] },
    { kind: "notification", text: "team reassignment", leaves: [
      { role: "recipient", quote: "team", hint: "source_named_group" }, { role: "event", quote: "reassignment", hint: "stage_assigned" },
    ] },
    { kind: "condition", text: "status is Yes routes to Finance", leaves: [
      { role: "field", quote: "status" }, { role: "operator", quote: "is", hint: "=" }, { role: "value", quote: "Yes" }, { role: "matching_route", quote: "Finance", hint: "stage_reference" },
    ] },
    { kind: "condition", text: "申報有利益衝突增加審批", leaves: [
      { role: "field", quote: "利益衝突" }, { role: "operator", quote: "有", hint: "=" }, { role: "value", quote: "利益衝突" }, { role: "matching_route", quote: "審批", hint: "stage_reference" },
    ] },
    { kind: "condition", text: "状态是高时增加审批", leaves: [
      { role: "field", quote: "状态" }, { role: "operator", quote: "是", hint: "=" }, { role: "value", quote: "高" }, { role: "matching_route", quote: "审批", hint: "stage_reference" },
    ] },
  ];
  const sourceMessages = Object.fromEntries(cases.map((entry, index) => [`closed:${index}`, entry.text]));
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) => located({ itemIndex, messageId: `closed:${itemIndex}`, ...entry })),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.ok(result.review.items.every((entry) => entry.semanticComplete === false));
});

test("blocks no-need-to-upload wording in all supported locales without leaking open fragments", () => {
  const cases = [
    {
      caseId: "EN",
      text: "No need to upload the passport page.",
      label: "passport page",
      action: "upload",
    },
    {
      caseId: "zh-Hant",
      text: "無需上載護照資料頁。",
      label: "護照資料頁",
      action: "上載",
    },
    {
      caseId: "zh-Hans",
      text: "无需上传护照资料页。",
      label: "护照资料页",
      action: "上传",
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`no-upload:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "attachment",
        messageId: `no-upload:${entry.caseId}`,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: entry.action, hint: "attachment" },
          { role: "required", quote: entry.action, hint: "true" },
        ],
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
  }
});

test("treats semicolons as entity boundaries while preserving an adjacent standalone field marker", () => {
  const splicedId = "message-field-semicolon-spliced-001";
  const splicedText = "Field A is optional; Field B is required";
  const spliced = assembleTemplateCopilotV3Review({
    sourceMessages: { [splicedId]: splicedText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: splicedId,
      text: splicedText,
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
      ],
    })],
  });
  assert.equal(spliced.review.items[0]?.semanticComplete, false);
  assert.equal(spliced.review.items[0]?.complete, false);
  assert.equal(spliced.review.items[0]?.fragmentId, null);
  assert.equal(spliced.envelope.fragments.length, 0);

  const structuredId = "message-field-semicolon-structured-001";
  const structuredText = "Field: Field A; required; text";
  const structured = assembleTemplateCopilotV3Review({
    sourceMessages: { [structuredId]: structuredText },
    items: [located({
      itemIndex: 0,
      kind: "request_field",
      messageId: structuredId,
      text: structuredText,
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
        { role: "type", quote: "text", hint: "text" },
      ],
    })],
  });
  assert.equal(structured.review.items[0]?.semanticComplete, true);
  assert.equal(structured.review.items[0]?.fragmentId !== null, true);
  assert.equal(structured.envelope.fragments.length, 1);
});

test("suppresses every open fragment for provider ambiguity and source conflicts", () => {
  const conflictId = "message-field-fragment-conflict-001";
  const conflictText = "Purpose may be optional or required";
  const ambiguousId = "message-field-fragment-ambiguous-001";
  const ambiguousText = "Amount is required";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [conflictId]: conflictText,
      [ambiguousId]: ambiguousText,
    },
    items: [
      located({
        itemIndex: 0,
        kind: "request_field",
        messageId: conflictId,
        text: conflictText,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "optional", hint: "false" },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "request_field",
        messageId: conflictId,
        text: conflictText,
        leaves: [
          { role: "label", quote: "Purpose" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "request_field",
        messageId: ambiguousId,
        text: ambiguousText,
        ambiguity: "possible",
        leaves: [
          { role: "label", quote: "Amount" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
    ],
  });

  assert.equal(result.review.conflicts.length, 1);
  assert.equal(result.review.items.length, 3);
  assert.equal(result.envelope.fragments.length, 0);
  assert.ok(
    result.review.items.every(
      (item) =>
        item.semanticComplete === false &&
        item.complete === false &&
        item.fragmentId === null,
    ),
  );
});

test("detects semantic-only stage-kind alternatives as a conflict and emits no fragments", () => {
  const messageId = "message-stage-semantic-kind-conflict-001";
  const text = "Finance Review approves requester and audits requester";
  const common = {
    kind: "stage",
    messageId,
    text,
  };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [
      located({
        itemIndex: 0,
        ...common,
        leaves: [
          { role: "label", quote: "Finance Review" },
          { role: "kind", quote: "approves", hint: "approval" },
          { role: "participant_mode", quote: "requester", hint: "requester" },
        ],
      }),
      located({
        itemIndex: 1,
        ...common,
        leaves: [
          { role: "label", quote: "Finance Review" },
          { role: "kind", quote: "audits", hint: "review" },
          {
            role: "participant_mode",
            quote: "requester",
            occurrence: 1,
            hint: "requester",
          },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 2, JSON.stringify(result.review.rejections));
  assert.equal(result.review.conflicts.length, 1);
  assert.deepEqual(result.review.conflicts[0].paths, ["/kind"]);
  assert.equal(result.envelope.fragments.length, 0);
  assert.ok(result.review.items.every((item) => item.value.kind === undefined));
  assert.ok(
    result.review.items.every(
      (item) =>
        item.semanticComplete === false &&
        item.complete === false &&
        item.fragmentId === null &&
        item.ambiguity === "ambiguous",
    ),
  );
});

test("rejects role-specific cross-entity splicing for every governed core item kind", () => {
  const cases = [
    {
      caseId: "request-field",
      kind: "request_field",
      text: "Field A is optional; Field B is required",
      leaves: [
        { role: "label", quote: "Field A" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      caseId: "attachment",
      kind: "attachment",
      text: "Invoice PDF is listed. Passport upload is required.",
      leaves: [
        { role: "label", quote: "Invoice" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      caseId: "stage",
      kind: "stage",
      text: "Finance Review uses Finance team. Legal approves.",
      leaves: [
        { role: "label", quote: "Finance Review" },
        { role: "participant", quote: "Finance team" },
        { role: "kind", quote: "approves", hint: "approval" },
      ],
    },
    {
      caseId: "condition",
      kind: "condition",
      text: "Amount exceeds the threshold. Budget is 100. Route to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
    },
    {
      caseId: "notification",
      kind: "notification",
      text: "Requester is listed. Completion sends an email.",
      leaves: [
        { role: "recipient", quote: "Requester", hint: "requester" },
        { role: "event", quote: "Completion", hint: "request_completed" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`cross-entity:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        messageId: `cross-entity:${entry.caseId}`,
        ...entry,
      })
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(result.envelope.fragments.length, 0);
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, entry.caseId);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
  }
});

test("requires an exact entity phrase for supplemental attachment requirements", () => {
  const cases = [
    {
      caseId: "sibling-en",
      text: "Receipt PDF. The receipt log is required.",
      label: "Receipt",
      required: "required",
      expectedSemanticComplete: false,
    },
    {
      caseId: "exact-en",
      text: "Receipt PDF. Receipt is required.",
      label: "Receipt",
      required: "required",
      expectedSemanticComplete: true,
    },
    {
      caseId: "sibling-tc",
      text: "收據 PDF。收據記錄為必須。",
      label: "收據",
      required: "必須",
      expectedSemanticComplete: false,
    },
    {
      caseId: "exact-sc",
      text: "收据 PDF。收据是必须。",
      label: "收据",
      required: "必须",
      expectedSemanticComplete: true,
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [entry.caseId, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    sourceMessageOrder: cases.map((entry) => entry.caseId),
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "attachment",
        messageId: entry.caseId,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.label },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: entry.required, hint: "true" },
        ],
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(
    result.envelope.fragments.length,
    cases.filter((entry) => entry.expectedSemanticComplete).length,
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(
      item.semanticComplete,
      entry.expectedSemanticComplete,
      entry.caseId,
    );
    assert.equal(item.complete, false, entry.caseId);
    if (entry.expectedSemanticComplete) {
      assert.ok(item.fragmentId, entry.caseId);
    } else {
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("blocks English do-not-need-to-upload attachment semantics without weakening optional attachments or negative conditions", () => {
  const cases = [
    {
      caseId: "does-not-need",
      kind: "attachment",
      text: "The requester does not need to upload the Receipt PDF.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
      expectedSemanticComplete: false,
    },
    {
      caseId: "do-not-need",
      kind: "attachment",
      text: "Requesters do not need to upload the Receipt PDF.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "upload", hint: "true" },
      ],
      expectedSemanticComplete: false,
    },
    {
      caseId: "optional",
      kind: "attachment",
      text: "The Receipt PDF is optional.",
      leaves: [
        { role: "label", quote: "Receipt" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "optional", hint: "false" },
      ],
      expectedSemanticComplete: true,
    },
    {
      caseId: "negative-condition",
      kind: "condition",
      text: "amount does not exceed 100 routes to Finance",
      leaves: [
        { role: "field", quote: "amount" },
        { role: "operator", quote: "does not exceed", hint: "<=" },
        { role: "value", quote: "100" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
      expectedSemanticComplete: true,
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [entry.caseId, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    sourceMessageOrder: cases.map((entry) => entry.caseId),
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: entry.caseId,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length);
  assert.equal(
    result.envelope.fragments.length,
    cases.filter((entry) => entry.expectedSemanticComplete).length,
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(item, entry.caseId);
    assert.equal(
      item.semanticComplete,
      entry.expectedSemanticComplete,
      entry.caseId,
    );
    assert.equal(item.complete, false, entry.caseId);
    if (entry.expectedSemanticComplete) {
      assert.ok(item.fragmentId, entry.caseId);
    } else {
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("blocks condition routes spliced from unrelated clauses", () => {
  const cases = [
    {
      caseId: "independent-predicate",
      text:
        "Amount exceeds 100 routes to Finance; Country equals US routes to Legal.",
      route: "Legal",
    },
    {
      caseId: "unrelated-statement",
      text:
        "Amount exceeds 100. Country policy sends the file to Legal approval.",
      route: "Legal",
    },
    {
      caseId: "same-hard-cross-predicate",
      text:
        "Amount exceeds 100 routes to Finance, if Country equals US routes to Legal.",
      route: "Legal",
    },
  ];
  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `message-condition-route-affinity-${entry.caseId}`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "condition",
        messageId,
        text: entry.text,
        leaves: [
          { role: "field", quote: "Amount" },
          { role: "operator", quote: "exceeds", hint: ">" },
          { role: "value", quote: "100" },
          {
            role: "matching_route",
            quote: entry.route,
            hint: "stage_reference",
          },
        ],
      })],
    });
    const item = result.review.items[0];
    assert.ok(item, `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`);
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(result.envelope.fragments.length, 0, entry.caseId);
  }
});

test("blocks otherwise routes from unrelated lexical default entities", () => {
  const messageId = "message-condition-otherwise-entity-affinity-001";
  const text =
    "Amount exceeds 100 routes to Finance. Other countries route to Legal.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a delayed unrelated outcome from completing a decision branch", () => {
  const messageId = "message-condition-decision-delayed-outcome-001";
  const text =
    "Amount exceeds 100. If either Finance approver rejects the invitation, unrelated HR policy returns applications for correction.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance approver",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a lexical default from a different high-risk entity", () => {
  const messageId = "message-condition-default-high-risk-entity-001";
  const text =
    "High-risk expenses exceed 100 routes to Finance. Normal visits route to Legal.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "High-risk expenses" },
        { role: "operator", quote: "exceed", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks participant decision wording without a workflow outcome", () => {
  const messageId = "message-condition-decision-no-outcome-001";
  const text =
    "Amount exceeds 100. If either Finance approver rejects the invitation.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance approver",
          hint: "stage_reference",
        },
      ],
    })],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("keeps source-bound condition route forms valid", () => {
  const cases = [
    {
      caseId: "same-clause",
      text: "Amount exceeds 100 routes to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "route-only",
      text: "Amount exceeds 100. Route to Finance.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "route-first-conditional",
      text:
        "Data Protection is required only when personal-data choice is Yes.",
      leaves: [
        { role: "field", quote: "personal-data choice" },
        { role: "operator", quote: "is Yes", hint: "=" },
        { role: "value", quote: "Yes" },
        {
          role: "matching_route",
          quote: "Data Protection",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "decision-subject",
      text:
        "Use total amount at least 50,000 as the high-value branch. If either high-value approver rejects, return for correction.",
      leaves: [
        { role: "field", quote: "total amount" },
        { role: "operator", quote: "at least", hint: ">=" },
        { role: "value", quote: "50,000" },
        {
          role: "matching_route",
          quote: "high-value approver",
          hint: "stage_reference",
        },
      ],
      blockingReason: "unsupported_semantics_not_executable",
    },
    {
      caseId: "explicit-default",
      text:
        "Amount exceeds 100 routes to Finance. Otherwise route to Legal.",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
        {
          role: "otherwise_route",
          quote: "Legal",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "matching-only-threshold-branch",
      text:
        "If amount is at most 100, route to Manager; Above 100 route to CEO.",
      leaves: [
        { role: "field", quote: "amount" },
        { role: "operator", quote: "Above", hint: ">" },
        { role: "value", quote: "100", occurrence: 1 },
        {
          role: "matching_route",
          quote: "CEO",
          hint: "stage_reference",
        },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry) => [`condition-route-affinity:${entry.caseId}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: "condition",
        messageId: `condition-route-affinity:${entry.caseId}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });
  assert.equal(
    result.review.items.length,
    cases.length,
    JSON.stringify(result.review.rejections),
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex),
    );
    assert.ok(
      item,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    const expectedBlockingReason = entry.blockingReason ?? null;
    assert.equal(
      item.semanticComplete,
      expectedBlockingReason === null,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    assert.equal(
      item.blockingReason,
      expectedBlockingReason ?? undefined,
      entry.caseId,
    );
    if (expectedBlockingReason !== null) {
      assert.equal(item.complete, false, entry.caseId);
      assert.equal(item.fragmentId, null, entry.caseId);
    }
    assert.equal(item.persisted, false, entry.caseId);
    assert.equal(item.executable, false, entry.caseId);
  }
});

test("holds conditional attachments while retaining ordinary supplemental requirements and condition routes", () => {
  const receiptId = "message-attachment-entity-local-001";
  const receiptText =
    "The receipt document is required when the optional comments field is used";
  const conditionalId = "message-attachment-conditional-001";
  const conditionalText =
    "If the missing-receipt box is selected, require a native declaration form";
  const supplementalId = "message-attachment-supplemental-001";
  const supplementalText = "Receipt PDF. The receipt is required.";
  const conditionId = "message-condition-supplemental-route-001";
  const conditionText = "Amount exceeds 100. Matching requests route to Finance.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: {
      [receiptId]: receiptText,
      [conditionalId]: conditionalText,
      [supplementalId]: supplementalText,
      [conditionId]: conditionText,
    },
    items: [
      located({
        itemIndex: 0,
        kind: "attachment",
        messageId: receiptId,
        text: receiptText,
        leaves: [
          { role: "label", quote: "receipt document" },
          { role: "kind", quote: "document", hint: "attachment" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "attachment",
        messageId: conditionalId,
        text: conditionalText,
        leaves: [
          { role: "label", quote: "declaration form" },
          { role: "kind", quote: "native", hint: "form" },
          { role: "required", quote: "require", hint: "true" },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "attachment",
        messageId: supplementalId,
        text: supplementalText,
        leaves: [
          { role: "label", quote: "Receipt" },
          { role: "kind", quote: "PDF", hint: "attachment" },
          { role: "required", quote: "required", hint: "true" },
        ],
      }),
      located({
        itemIndex: 3,
        kind: "condition",
        messageId: conditionId,
        text: conditionText,
        leaves: [
          { role: "field", quote: "Amount" },
          { role: "operator", quote: "exceeds", hint: ">" },
          { role: "value", quote: "100" },
          { role: "matching_route", quote: "Finance", hint: "stage_reference" },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 4, JSON.stringify(result.review.rejections));
  const itemByProviderIndex = (itemIndex) =>
    result.review.items.find((item) =>
      item.providerItemIndexes.includes(itemIndex)
    );
  for (const itemIndex of [0, 1]) {
    const item = itemByProviderIndex(itemIndex);
    assert.ok(item, `conditional:${itemIndex}`);
    assert.equal(item.semanticComplete, false, `conditional:${itemIndex}`);
    assert.equal(
      item.blockingReason,
      "unsupported_semantics_not_executable",
      `conditional:${itemIndex}`,
    );
    assert.equal(item.fragmentId, null, `conditional:${itemIndex}`);
  }
  for (const itemIndex of [2, 3]) {
    const item = itemByProviderIndex(itemIndex);
    assert.ok(item, `retained:${itemIndex}`);
    assert.equal(item.semanticComplete, true, `retained:${itemIndex}`);
    assert.equal(item.blockingReason, undefined, `retained:${itemIndex}`);
  }
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
  assert.equal(result.envelope.fragments.length, 2);
});

test("keeps a Chinese route-only stage entity intact when its name begins with the character for local", () => {
  const messageId = "message-stage-local-compliance-001";
  const text = "若目标地区不是香港，增加当地合规审查";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "当地合规" },
        { role: "participant", quote: "当地合规" },
        { role: "kind", quote: "审查", hint: "review" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, true);
  assert.deepEqual(item.semanticValue.participant, ["当地合规"]);
  assert.deepEqual(item.semanticValue.kind, ["审查"]);
});

test("keeps a Traditional Chinese local stage entity intact", () => {
  const messageId = "message-stage-local-compliance-traditional-001";
  const text = "若目標地區不是香港，增加當地合規審查";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "stage",
      messageId,
      text,
      leaves: [
        { role: "label", quote: "當地合規" },
        { role: "participant", quote: "當地合規" },
        { role: "kind", quote: "審查", hint: "review" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, true);
  assert.deepEqual(item.semanticValue.participant, ["當地合規"]);
  assert.deepEqual(item.semanticValue.kind, ["審查"]);
});

test("keeps Chinese legitimate-process stage compounds intact", () => {
  const cases = [
    {
      caseId: "traditional",
      text: "正當程序團隊審查申請",
      participant: "正當程序團隊",
      kind: "審查",
    },
    {
      caseId: "simplified",
      text: "正当程序团队审查申请",
      participant: "正当程序团队",
      kind: "审查",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `message-stage-due-process-${entry.caseId}-001`;
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "stage",
        messageId,
        text: entry.text,
        leaves: [
          { role: "label", quote: entry.participant },
          { role: "participant", quote: entry.participant },
          { role: "kind", quote: entry.kind, hint: "review" },
        ],
      })],
    });

    const item = result.review.items[0];
    assert.ok(item, `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`);
    assert.equal(item.semanticComplete, true, entry.caseId);
    assert.deepEqual(item.semanticValue.participant, [entry.participant]);
    assert.deepEqual(item.semanticValue.kind, [entry.kind]);
  }
});

test("blocks a Traditional Chinese notification event-recipient splice at 當", () => {
  const messageId = "message-notification-traditional-when-splice-001";
  const text = "申請已提交時通知財務，當申請被拒絕時通知申請人";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "notification",
      messageId,
      text,
      leaves: [
        { role: "event", quote: "申請已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申請人", hint: "requester" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("blocks a Simplified Chinese notification event-recipient splice at 当", () => {
  const messageId = "message-notification-simplified-when-splice-001";
  const text = "申请已提交时通知财务，当申请被拒绝时通知申请人";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "notification",
      messageId,
      text,
      leaves: [
        { role: "event", quote: "申请已提交", hint: "request_submitted" },
        { role: "recipient", quote: "申请人", hint: "requester" },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("allows only exact-field or bounded operator-led threshold carry-forward", () => {
  const englishId = "message-condition-carry-en-001";
  const englishText =
    "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval.";
  const traditionalId = "message-condition-carry-tc-001";
  const traditionalText =
    "若申報金額與核實金額差異超過百分之五，退回確認。若核實金額超過港幣五百萬元，增加財務總監批准。";
  const simplifiedId = "message-condition-carry-sc-001";
  const simplifiedText =
    "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。";
  const localRiskId = "message-condition-carry-sc-002";
  const localRiskText =
    "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。";
  const sourceMessages = {
    [englishId]: englishText,
    [traditionalId]: traditionalText,
    [simplifiedId]: simplifiedText,
    [localRiskId]: localRiskText,
  };
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: [
      located({
        itemIndex: 0,
        kind: "condition",
        messageId: englishId,
        text: englishText,
        leaves: [
          { role: "field", quote: "amount" },
          { role: "operator", quote: "Above", hint: ">" },
          { role: "value", quote: "HKD 100,000", occurrence: 1 },
          {
            role: "matching_route",
            quote: "CEO approval",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 1,
        kind: "condition",
        messageId: traditionalId,
        text: traditionalText,
        leaves: [
          { role: "field", quote: "核實金額", occurrence: 1 },
          { role: "operator", quote: "超過", occurrence: 1, hint: ">" },
          { role: "value", quote: "五百萬元" },
          {
            role: "matching_route",
            quote: "財務總監批准",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 2,
        kind: "condition",
        messageId: simplifiedId,
        text: simplifiedText,
        leaves: [
          { role: "field", quote: "申请额度" },
          { role: "operator", quote: "超过", occurrence: 2, hint: ">" },
          { role: "value", quote: "五百万元" },
          {
            role: "matching_route",
            quote: "行政总裁批准",
            hint: "stage_reference",
          },
        ],
      }),
      located({
        itemIndex: 3,
        kind: "condition",
        messageId: localRiskId,
        text: localRiskText,
        leaves: [
          { role: "field", quote: "总额" },
          { role: "operator", quote: "超过", occurrence: 1, hint: ">" },
          { role: "value", quote: "二万元", occurrence: 1 },
          {
            role: "matching_route",
            quote: "部门主管",
            hint: "stage_reference",
          },
        ],
      }),
    ],
  });

  assert.equal(result.review.items.length, 4, JSON.stringify(result.review.rejections));
  for (const itemIndex of [0, 1, 2, 3]) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, `carry-forward:${itemIndex}`);
    assert.equal(
      item.semanticComplete,
      true,
      `carry-forward:${itemIndex}:${item.blockingReason ?? "unblocked"}:${JSON.stringify(result.review.rejections)}`,
    );
  }
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
});

test("direct assembly rejects malformed carried thresholds and invented otherwise routes", () => {
  const cases = [
    {
      caseId: "extra-first-subject",
      text:
        "申请额度不超过港币一百万元且国家额度超过二百万元由财务经理批准。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-first-policy",
      text:
        "申请额度不超过港币一百万元且国家政策已更新由财务经理批准。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-middle-comparison",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且超过二百万元由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 3,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "extra-middle-subject",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家额度超过二百万元由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 3,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "extra-target-tier-1-predicate",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家风险也低时由财务总监批准；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
    },
    {
      caseId: "extra-target-tier-2-predicate",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元且国家风险也低时再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "overbroad-value",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。",
      field: "申请额度",
      operator: "不超过",
      operatorHint: "<=",
      value: "一百万元且风险低时可在",
      route: "财务经理批准后完成",
    },
    {
      caseId: "overbroad-route",
      text:
        "申请额度超过港币一百万元由国家风险也低时由财务经理批准。",
      field: "申请额度",
      operator: "超过",
      value: "一百万元",
      route: "国家风险也低时由财务经理批准",
    },
    {
      caseId: "missing-tier-continuation",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "audit-gap",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；保留审计记录；超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "reporting-tail",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准被记录。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "duplicate-target-operator",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过且超过五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "duplicate-target-value",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元和五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "numeric-prefix",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过一千五百万元再由行政总裁批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 2,
      value: "五百万元",
      route: "行政总裁批准",
    },
    {
      caseId: "invented-otherwise-sc04",
      text:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准。",
      field: "申请额度",
      operator: "超过",
      operatorOccurrence: 1,
      value: "一百万元",
      valueOccurrence: 1,
      route: "财务总监批准",
      otherwise: "财务经理批准后完成",
    },
    {
      caseId: "invented-otherwise-sc07",
      text:
        "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。",
      field: "总额",
      operator: "超过",
      operatorOccurrence: 1,
      value: "二万元",
      valueOccurrence: 1,
      route: "部门主管",
      otherwise: "财务后完成",
    },
  ];

  for (const [itemIndex, entry] of cases.entries()) {
    const messageId = `condition-carry-attack:${entry.caseId}`;
    const leaves = [
      { role: "field", quote: entry.field },
      {
        role: "operator",
        quote: entry.operator,
        occurrence: entry.operatorOccurrence,
        hint: entry.operatorHint ?? ">",
      },
      {
        role: "value",
        quote: entry.value,
        occurrence: entry.valueOccurrence ?? 0,
      },
      {
        role: "matching_route",
        quote: entry.route,
        hint: "stage_reference",
      },
      ...(
        entry.otherwise
          ? [{
            role: "otherwise_route",
            quote: entry.otherwise,
            hint: "stage_reference",
          }]
          : []
      ),
    ];
    const result = assembleTemplateCopilotV3Review({
      sourceMessages: { [messageId]: entry.text },
      items: [located({
        itemIndex,
        kind: "condition",
        messageId,
        text: entry.text,
        leaves,
      })],
    });
    const item = result.review.items[0];
    assert.ok(
      item,
      `${entry.caseId}: ${JSON.stringify(result.review.rejections)}`,
    );
    assert.equal(item.semanticComplete, false, entry.caseId);
    assert.equal(item.complete, false, entry.caseId);
    assert.equal(item.fragmentId, null, entry.caseId);
    assert.equal(result.envelope.fragments.length, 0, entry.caseId);
  }
});

test("does not carry a threshold field into a clause that names a different entity", () => {
  const messageId = "message-condition-carry-adversarial-001";
  const text =
    "Amount is above 10. Budget exceeds 100 and routes to Finance.";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [located({
      itemIndex: 0,
      kind: "condition",
      messageId,
      text,
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "exceeds", hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: "Finance",
          hint: "stage_reference",
        },
      ],
    })],
  });

  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.semanticComplete, false);
  assert.equal(item.complete, false);
  assert.equal(item.fragmentId, null);
  assert.equal(result.envelope.fragments.length, 0);
});

test("retains only closed non-executable provider hints as semantic observations", () => {
  const cases = [
    {
      kind: "attachment",
      text: "Conditional document uploaded file when needed",
      leaves: [
        { role: "label", quote: "Conditional document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        { role: "required", quote: "when needed", hint: "conditional" },
      ],
    },
    {
      kind: "attachment",
      text: "Extended document uploaded file required with more proof for high risk",
      leaves: [
        { role: "label", quote: "Extended document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        {
          role: "required",
          quote: "required with more proof for high risk",
          hint: "required_with_conditional_extension",
        },
      ],
    },
    {
      kind: "attachment",
      text: "Optional document uploaded file optional for ordinary requests",
      leaves: [
        { role: "label", quote: "Optional document" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        {
          role: "required",
          quote: "optional for ordinary requests",
          hint: "optional_conditional",
        },
      ],
    },
    {
      kind: "condition",
      text: "High risk or overseas routes to Legal Review",
      leaves: [
        { role: "field", quote: "High risk or overseas" },
        {
          role: "operator",
          quote: "High risk or overseas",
          hint: "unsupported_predicate",
        },
        { role: "value", quote: "High risk" },
        {
          role: "matching_route",
          quote: "Legal Review",
          hint: "stage_reference",
        },
      ],
    },
    {
      kind: "condition",
      text: "Amount equals 10 adds executive review otherwise adds board review",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "equals", hint: "=" },
        { role: "value", quote: "10" },
        {
          role: "matching_route",
          quote: "executive review",
          hint: "unsupported_outcome",
        },
        {
          role: "otherwise_route",
          quote: "board review",
          hint: "unsupported_outcome",
        },
      ],
    },
    {
      kind: "notification",
      text: "Request submitted notifies Finance Team recipients only",
      leaves: [
        {
          role: "event",
          quote: "Request submitted",
          hint: "request_submitted",
        },
        {
          role: "recipient",
          quote: "Finance Team",
          hint: "source_named_group",
        },
        {
          role: "visibility",
          quote: "recipients only",
          hint: "recipients_only",
        },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry, index) => [`semantic-only:${index}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: `semantic-only:${itemIndex}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  assert.equal(result.review.items.length, cases.length, JSON.stringify(result.review.rejections));
  assert.equal(
    result.review.rejections.filter((entry) => entry.code === "unverifiable_leaf").length,
    0,
    JSON.stringify(result.review.rejections),
  );
  for (const [itemIndex, entry] of cases.entries()) {
    const item = result.review.items.find((candidate) =>
      candidate.providerItemIndexes.includes(itemIndex)
    );
    assert.ok(item, `${itemIndex}: ${JSON.stringify(result.review.rejections)}`);
    for (const leaf of entry.leaves.filter((candidate) =>
      [
        "conditional",
        "required_with_conditional_extension",
        "optional_conditional",
        "unsupported_predicate",
        "unsupported_outcome",
        "source_named_group",
      ].includes(candidate.hint)
    )) {
      assert.ok(
        item.semanticObservations.some((observation) =>
          observation.role === leaf.role &&
          observation.advisoryHint === leaf.hint &&
          observation.quote === leaf.quote
        ),
        `${itemIndex}:${leaf.role}:${leaf.hint}`,
      );
    }
  }
});

test("keeps ordinary required, kind, event, and stage leaves fail closed", () => {
  const cases = [
    {
      kind: "request_field",
      detail: "request_field:required",
      text: "Bad field sometimes",
      leaves: [
        { role: "label", quote: "Bad field" },
        { role: "required", quote: "sometimes", hint: "true" },
      ],
    },
    {
      kind: "attachment",
      detail: "attachment:required",
      text: "Bad requirement uploaded file sometimes",
      leaves: [
        { role: "label", quote: "Bad requirement" },
        { role: "kind", quote: "uploaded file", hint: "attachment" },
        { role: "required", quote: "sometimes", hint: "true" },
      ],
    },
    {
      kind: "stage",
      detail: "stage:kind",
      text: "Finance mystery",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "mystery", hint: "review" },
        { role: "participant", quote: "Finance" },
      ],
    },
    {
      kind: "stage",
      detail: "stage:sequence",
      text: "Finance review then",
      leaves: [
        { role: "label", quote: "Finance" },
        { role: "kind", quote: "review", hint: "review" },
        { role: "participant", quote: "Finance" },
        { role: "sequence", quote: "then" },
      ],
    },
    {
      kind: "condition",
      detail: "condition:operator",
      text: "Amount approximately 10 routes to Finance",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "approximately", hint: "=" },
        { role: "value", quote: "10" },
        { role: "matching_route", quote: "Finance", hint: "stage_reference" },
      ],
    },
    {
      kind: "condition",
      detail: "condition:matching_route",
      text: "Amount equals 10 does nothing",
      leaves: [
        { role: "field", quote: "Amount" },
        { role: "operator", quote: "equals", hint: "=" },
        { role: "value", quote: "10" },
        { role: "matching_route", quote: "does nothing", hint: "complete" },
      ],
    },
    {
      kind: "attachment",
      detail: "attachment:kind",
      text: "Bad kind mystery required",
      leaves: [
        { role: "label", quote: "Bad kind" },
        { role: "kind", quote: "mystery", hint: "attachment" },
        { role: "required", quote: "required", hint: "true" },
      ],
    },
    {
      kind: "notification",
      detail: "notification:event",
      text: "Something happened Finance Team recipients only",
      leaves: [
        { role: "event", quote: "Something happened", hint: "request_submitted" },
        { role: "recipient", quote: "Finance Team", hint: "source_named_group" },
        { role: "visibility", quote: "recipients only", hint: "recipients_only" },
      ],
    },
    {
      kind: "notification",
      detail: "notification:stage",
      text: "Request submitted Finance Team recipients only Finance Review",
      leaves: [
        { role: "event", quote: "Request submitted", hint: "request_submitted" },
        { role: "recipient", quote: "Finance Team", hint: "source_named_group" },
        { role: "visibility", quote: "recipients only", hint: "recipients_only" },
        { role: "stage", quote: "Finance Review" },
      ],
    },
  ];
  const sourceMessages = Object.fromEntries(
    cases.map((entry, index) => [`fail-closed:${index}`, entry.text]),
  );
  const result = assembleTemplateCopilotV3Review({
    sourceMessages,
    items: cases.map((entry, itemIndex) =>
      located({
        itemIndex,
        kind: entry.kind,
        messageId: `fail-closed:${itemIndex}`,
        text: entry.text,
        leaves: entry.leaves,
      }),
    ),
  });

  const rejectedDetails = new Set(
    result.review.rejections
      .filter((entry) => entry.code === "unverifiable_leaf")
      .map((entry) => entry.detail),
  );
  for (const entry of cases) {
    assert.ok(rejectedDetails.has(entry.detail), entry.detail);
  }
});
