import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleTemplateCopilotV3Review,
} from "./template-copilot-v3-review-assembly.ts";
import {
  templateCopilotV3SourceSpanId,
} from "./template-copilot-v3-evidence.ts";

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
  const supplied = {
    messageId,
    startCodePoint,
    endCodePoint,
    exactText: quote,
  };
  return Object.freeze({
    spanId: templateCopilotV3SourceSpanId(supplied),
    ...supplied,
  });
}

const slotByKind = {
  request_field: "initiators_fields",
  attachment: "attachments",
  condition: "conditions_exceptions",
};

function located({
  itemIndex = 0,
  kind,
  messageId,
  text,
  anchorQuote = text,
  leaves,
}) {
  return Object.freeze({
    itemIndex,
    kind,
    slot: slotByKind[kind],
    anchor: span(messageId, text, anchorQuote),
    leaves: Object.freeze(
      leaves.map((leaf) =>
        Object.freeze({
          role: leaf.role,
          hint: leaf.hint ?? null,
          sourceSpan: span(
            messageId,
            text,
            leaf.quote,
            leaf.occurrence ?? 0,
          ),
        })
      ),
    ),
    confidence: "high",
    ambiguity: "none",
  });
}

function assembleOne({
  caseId,
  kind,
  text,
  anchorQuote = text,
  leaves,
}) {
  const messageId = `semantic-fail-closed-v11:${caseId}`;
  return assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [
      located({
        kind,
        messageId,
        text,
        anchorQuote,
        leaves,
      }),
    ],
  });
}

function assertGovernedHold(result, expectedReason, caseId) {
  const item = result.review.items[0];
  assert.ok(item, `${caseId}:${JSON.stringify(result.review.rejections)}`);
  assert.equal(item.semanticComplete, false, caseId);
  assert.equal(item.complete, false, caseId);
  assert.equal(item.blockingReason, expectedReason, caseId);
  assert.equal(item.fragmentId, null, caseId);
  assert.equal(result.envelope.fragments.length, 0, caseId);
}

function assertUnblockedSemantic(result, caseId) {
  const item = result.review.items[0];
  assert.ok(item, `${caseId}:${JSON.stringify(result.review.rejections)}`);
  assert.equal(
    item.semanticComplete,
    true,
    `${caseId}:${item.blockingReason ?? "unblocked"}:${JSON.stringify(result.review.rejections)}`,
  );
  assert.equal(item.blockingReason, undefined, caseId);
}

test("conditional attachment meaning cannot be trimmed, downgraded, or hidden in an adjacent clause", () => {
  for (const requiredHint of ["true", "false", null]) {
    const caseId = `trimmed-method-statement-${requiredHint ?? "null"}`;
    const text =
      "If high-risk work is Yes, require a method statement PDF.";
    const result = assembleOne({
      caseId,
      kind: "attachment",
      text,
      anchorQuote: "require a method statement PDF",
      leaves: [
        { role: "label", quote: "method statement" },
        { role: "kind", quote: "PDF", hint: "attachment" },
        { role: "required", quote: "require", hint: requiredHint },
      ],
    });
    assertGovernedHold(
      result,
      "unsupported_semantics_not_executable",
      caseId,
    );
  }

  const adjacentText =
    "Require one supplier quotation PDF up to 20 MB. If the total is at least HKD 50,000 require two more supplier quotation PDFs.";
  const adjacent = assembleOne({
    caseId: "adjacent-conditional-extension",
    kind: "attachment",
    text: adjacentText,
    anchorQuote: "Require one supplier quotation PDF up to 20 MB",
    leaves: [
      { role: "label", quote: "supplier quotation" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "Require", hint: "true" },
    ],
  });
  assertGovernedHold(
    adjacent,
    "unsupported_semantics_not_executable",
    "adjacent-conditional-extension",
  );

  const postfix = assembleOne({
    caseId: "postfix-high-risk",
    kind: "attachment",
    text: "Require a method statement PDF for high-risk work.",
    leaves: [
      { role: "label", quote: "method statement" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "Require", hint: "true" },
    ],
  });
  assertGovernedHold(
    postfix,
    "unsupported_semantics_not_executable",
    "postfix-high-risk",
  );

  const classifiedPostfix = assembleOne({
    caseId: "postfix-classified-high-risk",
    kind: "attachment",
    text:
      "Require a method statement PDF for work classified as high risk.",
    leaves: [
      { role: "label", quote: "method statement" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "Require", hint: "true" },
    ],
  });
  assertGovernedHold(
    classifiedPostfix,
    "unsupported_semantics_not_executable",
    "postfix-classified-high-risk",
  );

  const durationPostfix = assembleOne({
    caseId: "postfix-duration-threshold",
    kind: "attachment",
    text:
      "A medical certificate attachment is required for absences lasting three days or more.",
    leaves: [
      { role: "label", quote: "medical certificate" },
      { role: "kind", quote: "attachment", hint: "attachment" },
      { role: "required", quote: "required", hint: "true" },
    ],
  });
  assertGovernedHold(
    durationPostfix,
    "unsupported_semantics_not_executable",
    "postfix-duration-threshold",
  );
});

test("ordinary attachment actors and lexical substrings do not invent conditional meaning", () => {
  const ordinary = assembleOne({
    caseId: "ordinary-supplier",
    kind: "attachment",
    text: "The supplier must upload a quotation PDF.",
    leaves: [
      { role: "label", quote: "quotation" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "must upload", hint: "true" },
    ],
  });
  assertUnblockedSemantic(ordinary, "ordinary-supplier");

  const boundaryText =
    "Require supplier attachment PDF. If high risk, require a nonsupplier record.";
  const boundary = assembleOne({
    caseId: "nonsupplier-boundary",
    kind: "attachment",
    text: boundaryText,
    anchorQuote: "Require supplier attachment PDF",
    leaves: [
      { role: "label", quote: "supplier attachment" },
      { role: "kind", quote: "PDF", hint: "attachment" },
      { role: "required", quote: "Require", hint: "true" },
    ],
  });
  assertUnblockedSemantic(boundary, "nonsupplier-boundary");
});

test("unsupported condition outcomes remain held with old hints or truncated routes", () => {
  const cases = [
    {
      caseId: "no-go-close-route-old-hint",
      text: "No-Go 直接結束並記錄原因。",
      leaves: [
        { role: "field", quote: "No-Go" },
        { role: "operator", quote: "No-Go", hint: "=" },
        { role: "value", quote: "No-Go" },
        {
          role: "matching_route",
          quote: "直接結束並記錄原因",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "attachment-outcome-old-hint",
      text: "Sick leave days >= 3 requires a medical certificate.",
      leaves: [
        { role: "field", quote: "Sick leave days" },
        { role: "operator", quote: ">=", hint: ">=" },
        { role: "value", quote: "3" },
        {
          role: "matching_route",
          quote: "a medical certificate",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "notification-outcome-old-hint",
      text: "Severity = high requires a notification to the requester.",
      leaves: [
        { role: "field", quote: "Severity" },
        { role: "operator", quote: "=", hint: "=" },
        { role: "value", quote: "high" },
        {
          role: "matching_route",
          quote: "a notification to the requester",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "board-fyi-old-hint",
      text:
        "The Board FYI applies only above HKD 2,000,000; otherwise complete after CFO.",
      anchorQuote:
        "The Board FYI applies only above HKD 2,000,000",
      leaves: [
        { role: "field", quote: "Board FYI" },
        { role: "operator", quote: "above", hint: ">" },
        { role: "value", quote: "HKD 2,000,000" },
        {
          role: "matching_route",
          quote: "Board FYI",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "extra-approval-old-hint",
      text: "成本增加超过港币一百万元走额外审批。",
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
    },
    {
      caseId: "targeted-return-old-hint",
      text:
        "若申報金額與核實金額差異超過百分之五，必須先退回分判商確認差異。",
      leaves: [
        { role: "field", quote: "申報金額與核實金額差異" },
        { role: "operator", quote: "超過", hint: ">" },
        { role: "value", quote: "百分之五" },
        {
          role: "matching_route",
          quote: "退回分判商",
          hint: "stage_reference",
        },
      ],
    },
    {
      caseId: "truncated-security-clearance",
      text: "含数据设备必须在处置前完成安全审批和清除证明。",
      anchorQuote: "含数据设备必须在处置前完成安全审批",
      leaves: [
        { role: "field", quote: "含数据设备" },
        { role: "operator", quote: "含数据设备", hint: "=" },
        { role: "value", quote: "含数据设备" },
        {
          role: "matching_route",
          quote: "安全审批",
          hint: "stage_reference",
        },
      ],
    },
  ];

  for (const entry of cases) {
    const result = assembleOne({
      ...entry,
      kind: "condition",
    });
    assertGovernedHold(
      result,
      "unsupported_semantics_not_executable",
      entry.caseId,
    );
  }
});

test("direct action-only routing connectors remain valid in English and Chinese", () => {
  const cases = [
    {
      caseId: "english-and-routes",
      text: "Amount > 100 and routes to Legal",
      field: "Amount",
      operator: ">",
      route: "Legal",
    },
    {
      caseId: "english-then-routes",
      text: "Amount > 100 then routes to Legal",
      field: "Amount",
      operator: ">",
      route: "Legal",
    },
    {
      caseId: "chinese-and-routes",
      text: "金额超过100及转至法务",
      field: "金额",
      operator: "超过",
      route: "法务",
    },
    {
      caseId: "chinese-parallel-routes",
      text: "金额超过100并转至法务",
      field: "金额",
      operator: "超过",
      route: "法务",
    },
  ];
  for (const entry of cases) {
    const result = assembleOne({
      caseId: entry.caseId,
      kind: "condition",
      text: entry.text,
      leaves: [
        { role: "field", quote: entry.field },
        { role: "operator", quote: entry.operator, hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: entry.route,
          hint: "stage_reference",
        },
      ],
    });
    assertUnblockedSemantic(result, entry.caseId);
  }
});

test("condition field authority requires complete lexical boundaries", () => {
  const cases = [
    ["discount-right-word-truncation", "Discount Amount > 100 routes to Finance", "Discount", ">", "Finance", false],
    ["discount-amount-substring", "Discount Amount exceeds 100 routes to Finance", "Amount", "exceeds", "Finance", false],
    ["discount-amount-full", "Discount Amount exceeds 100 routes to Finance", "Discount Amount", "exceeds", "Finance", true],
    ["netamount-prefix", "NetAmount > 100 and routes to Legal", "Net", ">", "Legal", false],
    ["netamount-full", "NetAmount > 100 and routes to Legal", "NetAmount", ">", "Legal", true],
    ["discount-cjk-substring", "折扣金额超过100及转至法务", "金额", "超过", "法务", false],
    ["discount-cjk-full", "折扣金额超过100及转至法务", "折扣金额", "超过", "法务", true],
    ["cjk-right-substring", "金额合计超过100及转至法务", "金额", "超过", "法务", false],
    ["cjk-right-full", "金额合计超过100及转至法务", "金额合计", "超过", "法务", true],
  ];

  for (const [caseId, text, field, operator, route, expected] of cases) {
    const result = assembleOne({
      caseId,
      kind: "condition",
      text,
      leaves: [
        { role: "field", quote: field },
        { role: "operator", quote: operator, hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: route,
          hint: "stage_reference",
        },
      ],
    });
    if (expected) {
      assertUnblockedSemantic(result, caseId);
    } else {
      const item = result.review.items[0];
      assert.ok(item, caseId);
      assert.equal(item.semanticComplete, false, caseId);
      assert.equal(item.blockingReason, undefined, caseId);
      assert.equal(item.fragmentId, null, caseId);
      assert.equal(result.envelope.fragments.length, 0, caseId);
    }
  }
});

test("leading and trailing compound predicates cannot be silently dropped", () => {
  const cases = [
    ["english-unlisted-adjective-or-leading", "Risk elevated or Amount > 100 then routes to Legal", "Amount", ">", "Legal"],
    ["chinese-or-field-leading", "收入或资产 > 100 转至法务", "收入", ">", "法务"],
    ["english-adjective-leading", "Risk high and Amount > 100 and routes to Legal", "Amount", ">", "Legal"],
    ["english-both-leading", "Both Risk high and Amount > 100 and routes to Legal", "Amount", ">", "Legal"],
    ["english-as-well-as-leading", "Risk is high as well as Amount > 100 and routes to Legal", "Amount", ">", "Legal"],
    ["english-belongs-leading", "Country belongs to a restricted list and Amount > 100 and routes to Legal", "Amount", ">", "Legal"],
    ["english-trailing-operand", "Amount > 100 and Risk high, then routes to Legal", "Amount", ">", "Legal"],
    ["chinese-adjective-leading", "风险高且金额超过100及转至法务", "金额", "超过", "法务"],
    ["chinese-belongs-leading", "国家属于受限名单及金额超过100及转至法务", "金额", "超过", "法务"],
  ];

  for (const [caseId, text, field, operator, route] of cases) {
    const result = assembleOne({
      caseId,
      kind: "condition",
      text,
      leaves: [
        { role: "field", quote: field },
        { role: "operator", quote: operator, hint: ">" },
        { role: "value", quote: "100" },
        {
          role: "matching_route",
          quote: route,
          hint: "stage_reference",
        },
      ],
    });
    assertGovernedHold(
      result,
      "compound_predicate_not_executable",
      caseId,
    );
  }
});

test("condition-only unsupported rules cannot block request fields", () => {
  const text =
    "生产数据库增加数据负责人 text required no options";
  const result = assembleOne({
    caseId: "request-field-condition-phrase",
    kind: "request_field",
    text,
    leaves: [
      { role: "label", quote: "生产数据库增加数据负责人" },
      { role: "type", quote: "text", hint: "text" },
      { role: "required", quote: "required", hint: "true" },
      { role: "option", quote: "no options" },
    ],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(item.complete, true);
  assert.equal(item.semanticComplete, true);
  assert.equal(item.blockingReason, undefined);
});
