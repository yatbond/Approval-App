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

function located({ itemIndex, kind, messageId, text, anchorQuote = text, leaves, confidence = "high", ambiguity = "none" }) {
  return Object.freeze({
    itemIndex,
    kind,
    slot: slotByKind[kind],
    anchor: span(messageId, text, anchorQuote),
    leaves: Object.freeze(leaves.map((leaf) => Object.freeze({ role: leaf.role, hint: leaf.hint ?? null, sourceSpan: span(messageId, text, leaf.quote, leaf.occurrence ?? 0) }))),
    confidence,
    ambiguity,
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

test("keeps fixed-corpus optional uploads semantically complete but strictly unresolved", () => {
  const cases = [
    {
      scenarioId: "TC-05",
      anchorQuote: "可選擇上載變更指示 PDF",
      label: "變更指示",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選擇上載",
    },
    {
      scenarioId: "TC-06",
      anchorQuote: "可選上載法律意見 PDF",
      label: "法律意見",
      kindQuote: "上載",
      kindOccurrence: 1,
      requiredQuote: "可選上載",
    },
    {
      scenarioId: "SC-07",
      anchorQuote: "申请签证时可选上传护照资料页",
      label: "护照资料页",
      kindQuote: "上传",
      kindOccurrence: 2,
      requiredQuote: "可选上传",
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
    assert.equal(item.semanticComplete, true, entry.scenarioId);
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
    },
    {
      caseId: "does-not-skip",
      text: "Retrospective status does not skip approval",
      field: "Retrospective status",
      operator: "Retrospective",
      operatorHint: "=",
      value: "Retrospective status",
      route: "does not skip approval",
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
  assert.ok(result.review.items.every((item) => item.semanticComplete));
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
    attachmentCase("EN-08-proof", "A retrospective request must also include proof of instruction", "proof of instruction", "proof", "attachment", "must also include", "true"),
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
    conditionCase("TC-over", "差異超過百分之五退回補正", "差異", "超過", ">", "百分之五", "補正"),
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
    conditionCase("SC-over", "成本增加超过港币一百万元走额外审批", "成本增加", "超过", ">", "一百万元", "额外审批"),
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
    assert.equal(assembled.semanticComplete, true, entry.caseId);
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
});

test("audits a bounded semantic operator for every fixed condition corpus entry without invented values", () => {
  const scenariosById = new Map(templateCopilotQualificationScenarios.map((scenario) => [scenario.id, scenario]));
  const audit = [
    { scenarioId: "EN-01", field: "total amount", operator: "below", operatorHint: "<", value: "HKD 50,000", route: "complete", routeHint: "complete" },
    { scenarioId: "EN-02", field: "invoice total", operator: "equals", operatorHint: "=", value: "PO total", route: "Finance Manager" },
    { scenarioId: "EN-03", field: "Board FYI", operator: "above", operatorHint: ">", value: "HKD 2,000,000", route: "CFO" },
    { scenarioId: "EN-04", field: "total", operator: "exceeds", operatorHint: ">", value: "HKD 10,000", route: "Department Head" },
    { scenarioId: "EN-05", field: "personal-data choice", operator: "is Yes", operatorHint: "=", value: "Yes", route: "Data Protection" },
    { scenarioId: "EN-06", field: "High-risk visits", operator: "High-risk", operatorHint: "=", value: "High-risk", route: "Site Manager" },
    { scenarioId: "EN-07", field: "country", operator: "other than", operatorHint: "!=", value: "Hong Kong", valueOccurrence: 1, route: "Legal" },
    { scenarioId: "EN-08", field: "amount", operator: "at most", operatorHint: "<=", value: "HKD 100,000", route: "General Manager" },
    { scenarioId: "TC-01", field: "註冊地", operator: "不在", operatorHint: "!=", value: "香港", route: "法務審查" },
    { scenarioId: "TC-02", field: "病假日數", operator: "三日或以上", operatorHint: ">=", value: "三日", route: "醫生證明" },
    { scenarioId: "TC-03", field: "估算合約額", operator: "超過", operatorHint: ">", value: "港幣一億元", route: "董事會主席" },
    { scenarioId: "TC-04", field: "高風險工序", operator: "高風險", operatorHint: "=", value: "高風險", route: "公司安全主管" },
    { scenarioId: "TC-05", field: "差異", operator: "超過", operatorHint: ">", value: "百分之五", route: "退回分判商" },
    { scenarioId: "TC-06", field: "期限", operator: "超過", operatorHint: ">", value: "九十日", route: "行政總裁" },
    { scenarioId: "TC-07", field: "費用", operator: "超過", operatorHint: ">", value: "港幣一萬元", route: "部門主管" },
    { scenarioId: "TC-08", field: "受限制區域", operator: "受限制區域", operatorHint: "=", value: "受限制區域", route: "資訊保安" },
    { scenarioId: "SC-01", field: "安全影响", operator: "为是", operatorHint: "=", value: "是", route: "安全评审" },
    { scenarioId: "SC-02", field: "生产数据库", operator: "生产数据库", operatorHint: "=", value: "生产数据库", route: "数据负责人" },
    { scenarioId: "SC-03", field: "客户名称", operator: "为是", operatorHint: "=", value: "是", route: "客户经理" },
    { scenarioId: "SC-04", field: "申请额度", operator: "不超过", operatorHint: "<=", value: "港币一百万元", route: "财务经理" },
    { scenarioId: "SC-05", field: "含数据设备", operator: "含数据设备", operatorHint: "=", value: "含数据设备", route: "安全审批" },
    { scenarioId: "SC-06", field: "严重程度", operator: "为高", operatorHint: "=", value: "高", route: "高级管理层" },
    { scenarioId: "SC-07", field: "国际", operator: "国际", operatorHint: "=", value: "国际", route: "HR" },
    { scenarioId: "SC-08", field: "有关联人士", operator: "有关联人士", operatorHint: "=", value: "有关联人士", route: "独立高管" },
  ];
  assert.deepEqual(
    audit.map((entry) => entry.scenarioId).sort(),
    templateCopilotQualificationScenarios.map((scenario) => scenario.id).sort(),
  );

  const variants = [
    { caseId: "EN-not-in", text: "country not in Hong Kong routes to Legal", field: "country", operator: "not in", operatorHint: "!=", value: "Hong Kong", route: "Legal" },
    { caseId: "TC-or-above", text: scenariosById.get("TC-02").conditions, field: "病假日數", operator: "或以上", operatorHint: ">=", value: "三日", route: "醫生證明" },
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
    assert.equal(assembled.semanticComplete, true, entry.caseId);
    assert.deepEqual(assembled.semanticValue.field, [entry.field], entry.caseId);
    assert.deepEqual(assembled.semanticValue.operator, [entry.operator], entry.caseId);
    assert.deepEqual(assembled.semanticValue.value, [entry.value], entry.caseId);
    assert.deepEqual(assembled.semanticValue.matching_route, [entry.route], entry.caseId);
    assert.equal(assembled.defaulted, false, entry.caseId);
    assert.equal(assembled.persisted, false, entry.caseId);
    assert.equal(assembled.executable, false, entry.caseId);
  }
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
      caseId: "threshold-complement",
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
        {
          role: "otherwise_route",
          quote: "Manager",
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
  assert.ok(result.review.items.every((item) => item.semanticComplete));
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
});

test("keeps entity-local optionality, conditional attachments, explicit supplemental requirements, and condition routes valid", () => {
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
  assert.ok(result.review.items.every((item) => item.semanticComplete));
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
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
    "If amount is at most HKD 100,000, General Manager is final. Above HKD 100,000 add CEO approval.";
  const traditionalId = "message-condition-carry-tc-001";
  const traditionalText =
    "若申報金額與核實金額差異超過百分之五，退回確認。若核實金額超過港幣五百萬元，增加財務總監批准。";
  const simplifiedId = "message-condition-carry-sc-001";
  const simplifiedText =
    "申请额度不超过港币一百万元时由财务经理批准。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。";
  const sourceMessages = {
    [englishId]: englishText,
    [traditionalId]: traditionalText,
    [simplifiedId]: simplifiedText,
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
          { role: "field", quote: "核實金額" },
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
    ],
  });

  assert.equal(result.review.items.length, 3, JSON.stringify(result.review.rejections));
  assert.ok(result.review.items.every((item) => item.semanticComplete));
  assert.ok(result.review.items.every((item) => item.persisted === false));
  assert.ok(result.review.items.every((item) => item.executable === false));
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
