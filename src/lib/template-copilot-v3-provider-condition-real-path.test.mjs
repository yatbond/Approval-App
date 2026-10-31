import assert from "node:assert/strict";
import test from "node:test";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  assembleTemplateCopilotV3Review,
} from "./template-copilot-v3-review-assembly.ts";

function structureSources(caseId, conditions) {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `real-path:${caseId}:${slot}`,
    text: slot === "conditions_exceptions"
      ? conditions
      : `No ${slot} requirements supplied.`,
  }));
}

function routingConditionSources(caseId, conditions) {
  return templateCopilotV3ProviderQuoteBatches.routing_conditions.slots.map(
    (slot) => ({
      slot,
      messageId: `real-path-formal:${caseId}:${slot}`,
      text: conditions,
    }),
  );
}

function conditionOutput(quote, leaves) {
  return {
    contractVersion: 1,
    items: [{
      kind: "condition",
      quote,
      leaves,
      confidence: "high",
      ambiguity: "none",
    }],
  };
}

function leaf(role, quote, hint = null) {
  return { role, quote, hint };
}

function locateCondition(caseId, source, quote, leaves) {
  const sourceSlots = structureSources(caseId, source);
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: conditionOutput(quote, leaves),
  });
  return { located, sourceSlots };
}

function locateFormalCondition(caseId, source, quote, leaves) {
  const sourceSlots = routingConditionSources(caseId, source);
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "routing_conditions",
    sourceSlots,
    output: conditionOutput(quote, leaves),
  });
  return { located, sourceSlots };
}

function locateFormalSc01ConditionSymbols(caseId) {
  const fieldSource =
    "设计经理、项目工程师或客户代表可以发起。必填项目、图纸编号、变更说明、变更原因、成本影响、工期影响天数、安全影响、客户指令编号和紧急选项。";
  const fieldAnchor =
    "必填项目、图纸编号、变更说明、变更原因、成本影响、工期影响天数、安全影响、客户指令编号和紧急选项";
  const intakeSources = templateCopilotV3ProviderQuoteBatches
    .intake_documents.slots.map((slot) => ({
      slot,
      messageId: `real-path-formal:${caseId}:field:${slot}`,
      text: slot === "initiators_fields"
        ? fieldSource
        : `No ${slot} requirements supplied.`,
    }));
  const fieldLocated = locateTemplateCopilotV3ProviderQuotes({
    batchId: "intake_documents",
    sourceSlots: intakeSources,
    output: {
      contractVersion: 1,
      items: [{
        kind: "request_field",
        quote: fieldAnchor,
        leaves: [
          leaf("label", "安全影响"),
          leaf("required", "必填", "true"),
        ],
        confidence: "high",
        ambiguity: "none",
      }],
    },
  });

  const stageSource =
    "设计经理先审查；工程、商务和安全并行评审各自影响；之后项目经理批准。成本增加超过港币一百万元时再由商业总监批准。每个评审人只看相关字段和文件。";
  const stageAnchor = "工程、商务和安全并行评审各自影响";
  const stageSources = templateCopilotV3ProviderQuoteBatches
    .routing_stages_participants.slots.map((slot) => ({
      slot,
      messageId: `real-path-formal:${caseId}:stage:${slot}`,
      text: slot === "stages_participants"
        ? stageSource
        : `No ${slot} requirements supplied.`,
    }));
  const stageLocated = locateTemplateCopilotV3ProviderQuotes({
    batchId: "routing_stages_participants",
    sourceSlots: stageSources,
    output: {
      contractVersion: 1,
      items: [{
        kind: "stage",
        quote: stageAnchor,
        leaves: [
          leaf("label", "安全"),
          leaf("kind", "评审", "review"),
          leaf("participant", "安全"),
        ],
        confidence: "high",
        ambiguity: "none",
      }],
    },
  });
  return {
    accepted: [
      ...fieldLocated.accepted.map((item) => ({ ...item, itemIndex: 100 })),
      ...stageLocated.accepted.map((item) => ({ ...item, itemIndex: 101 })),
    ],
    rejected: [...fieldLocated.rejected, ...stageLocated.rejected],
    sourceSlots: [...intakeSources, ...stageSources],
  };
}

function assembleLocated(located, sourceSlots) {
  const sourceMessages = Object.fromEntries(
    sourceSlots.map(({ messageId, text }) => [messageId, text]),
  );
  return assembleTemplateCopilotV3Review({
    items: located.accepted,
    sourceMessages,
    sourceMessageOrder: sourceSlots.map(({ messageId }) => messageId),
  });
}

function codePointOffset(text, codeUnitOffset) {
  return Array.from(text.slice(0, codeUnitOffset)).length;
}

function publicSpansWithinAnchor(value, anchor) {
  if (Array.isArray(value)) {
    return value.every((entry) => publicSpansWithinAnchor(entry, anchor));
  }
  if (!value || typeof value !== "object") return true;
  if (
    typeof value.messageId === "string" &&
    Number.isInteger(value.startCodePoint) &&
    Number.isInteger(value.endCodePoint) &&
    typeof value.exactText === "string" &&
    value.messageId === anchor.messageId
  ) {
    if (
      value.startCodePoint < anchor.startCodePoint ||
      value.endCodePoint > anchor.endCodePoint
    ) {
      return false;
    }
  }
  return Object.values(value).every((entry) =>
    publicSpansWithinAnchor(entry, anchor)
  );
}

const realPathCases = [
  {
    id: "EN01",
    source:
      "Use total amount below HKD 50,000 versus at least HKD 50,000 as complete branches. If either high-value approver rejects, return to the requester for correction. If both approve, complete.",
    quote:
      "total amount below HKD 50,000 versus at least HKD 50,000 as complete branches. If either high-value approver",
    leaves: [
      leaf("field", "total amount"),
      leaf("operator", "at least", ">="),
      leaf("value", "50,000"),
      leaf("matching_route", "high-value approver", "stage_reference"),
      leaf("otherwise_route", "complete", "complete"),
    ],
    field: "total amount",
    matchingRoute: "high-value approver",
    otherwiseRoute: "complete",
    repeatedRole: "value",
    repeatedQuote: "50,000",
    repeatedOccurrence: 1,
    compiledValue: 50_000,
    governedHold: true,
  },
  {
    id: "EN04",
    source:
      "If total exceeds HKD 10,000 or a receipt is missing, add Department Head approval before Finance. Otherwise go from line manager to Finance. Rejection returns for correction.",
    quote:
      "total exceeds HKD 10,000 or a receipt is missing, add Department Head approval before Finance. Otherwise go from line manager to Finance",
    leaves: [
      leaf("field", "total"),
      leaf("operator", "exceeds", ">"),
      leaf("value", "10,000"),
      leaf("matching_route", "Department Head", "stage_reference"),
      leaf("otherwise_route", "Finance", "stage_reference"),
    ],
    field: "total",
    matchingRoute: "Department Head",
    otherwiseRoute: "Finance",
    repeatedRole: "otherwise_route",
    repeatedQuote: "Finance",
    repeatedOccurrence: 1,
    compiledValue: 10_000,
    compoundBlocked: true,
  },
  {
    id: "EN06",
    source:
      "Normal visits complete after both Safety and Security approve. High-risk visits require Site Manager after both. Any rejection returns to the coordinator. Missing induction blocks submission.",
    quote:
      "complete after both Safety and Security approve. High-risk visits require Site Manager",
    leaves: [
      leaf("field", "High-risk visits"),
      leaf("operator", "High-risk", "="),
      leaf("value", "High-risk visits"),
      leaf("matching_route", "Site Manager", "stage_reference"),
      leaf("otherwise_route", "complete", "complete"),
    ],
    field: "High-risk visits",
    matchingRoute: "Site Manager",
    otherwiseRoute: "complete",
    identicalRoles: ["field", "value"],
  },
  {
    id: "TC02",
    source:
      "病假日數三日或以上才要求醫生證明。無薪假走額外部門主管路徑。其他假別在 HR 核對後完成。拒絕退回員工修改。",
    quote:
      "病假日數三日或以上才要求醫生證明。無薪假走額外部門主管路徑。其他假別在 HR 核對後完成",
    leaves: [
      leaf("field", "病假日數"),
      leaf("operator", "三日或以上", ">="),
      leaf("value", "三日"),
      leaf("matching_route", "醫生證明", "stage_reference"),
      leaf("otherwise_route", "HR 核對後完成", "stage_reference"),
    ],
    field: "病假日數",
    matchingRoute: "醫生證明",
    otherwiseRoute: "HR 核對後完成",
    governedHold: true,
  },
  {
    id: "TC04",
    source:
      "高風險工序必須增加公司安全主管批准。非高風險則項目經理後完成。任何拒絕退回編製人修正，舊版本保留於歷史。",
    quote:
      "高風險工序必須增加公司安全主管批准。非高風險則項目經理後完成",
    leaves: [
      leaf("field", "高風險工序"),
      leaf("operator", "高風險工序", "="),
      leaf("value", "高風險工序"),
      leaf("matching_route", "公司安全主管批准", "stage_reference"),
      leaf("otherwise_route", "項目經理後完成", "stage_reference"),
    ],
    field: "高風險工序",
    matchingRoute: "公司安全主管批准",
    otherwiseRoute: "項目經理後完成",
    identicalRoles: ["field", "operator", "value"],
  },
  {
    id: "TC08",
    source:
      "普通辦公室到訪在主管批准後完成。受限制區域必須再經資訊保安。拒絕退回申請人；到訪日期過後自動失效。",
    quote: "主管批准後完成。受限制區域必須再經資訊保安",
    leaves: [
      leaf("field", "受限制區域"),
      leaf("operator", "受限制區域", "="),
      leaf("value", "受限制區域"),
      leaf("matching_route", "資訊保安", "stage_reference"),
      leaf("otherwise_route", "主管批准後完成", "stage_reference"),
    ],
    field: "受限制區域",
    matchingRoute: "資訊保安",
    otherwiseRoute: "主管批准後完成",
    identicalRoles: ["field", "operator", "value"],
  },
];

test("minimal raw provider quotes compile or safely hold the six governed condition cases", () => {
  for (const entry of realPathCases) {
    const { located, sourceSlots } = locateCondition(
      entry.id,
      entry.source,
      entry.quote,
      entry.leaves,
    );
    assert.deepEqual(located.rejected, [], entry.id);
    assert.equal(located.accepted.length, 1, entry.id);
    const accepted = located.accepted[0];
    assert.equal(accepted.slot, "conditions_exceptions", entry.id);
    assert.equal(accepted.anchor.exactText, entry.quote, entry.id);

    const assembled = assembleLocated(located, sourceSlots);
    assert.equal(assembled.review.items.length, 1, entry.id);
    const review = assembled.review.items[0];
    assert.equal(review.factId, "workflow.conditions", entry.id);
    assert.equal(review.complete, false, entry.id);
    assert.equal(review.persisted, false, entry.id);
    assert.equal(review.executable, false, entry.id);
    if (entry.compoundBlocked || entry.governedHold) {
      assert.equal(review.semanticComplete, false, entry.id);
      assert.equal(review.fragmentId, null, entry.id);
      assert.equal(
        review.blockingReason,
        entry.compoundBlocked
          ? "compound_predicate_not_executable"
          : "unsupported_semantics_not_executable",
        entry.id,
      );
      assert.equal(assembled.envelope.fragments.length, 0, entry.id);
    } else {
      assert.equal(review.semanticComplete, true, entry.id);
      assert.notEqual(review.fragmentId, null, entry.id);
      assert.equal(assembled.envelope.fragments.length, 1, entry.id);
    }
    assert.deepEqual(
      review.sourceAnchors.map(({ exactText }) => exactText),
      [entry.quote],
      entry.id,
    );
    assert.ok(
      publicSpansWithinAnchor(
        { review, envelope: assembled.envelope },
        accepted.anchor,
      ),
      `${entry.id}: derived semantic context leaked into public evidence`,
    );
    assert.ok(review.semanticValue.field.includes(entry.field), entry.id);
    assert.ok(
      review.semanticValue.matching_route.includes(entry.matchingRoute),
      entry.id,
    );
    assert.ok(
      review.semanticValue.otherwise_route.includes(entry.otherwiseRoute),
      entry.id,
    );
    if (entry.compiledValue !== undefined) {
      assert.equal(review.value.value, entry.compiledValue, entry.id);
    }
    if (entry.identicalRoles) {
      const spanIds = entry.identicalRoles.map((role) =>
        accepted.leaves.find((candidate) => candidate.role === role)
          ?.sourceSpan.spanId
      );
      assert.equal(new Set(spanIds).size, 1, entry.id);
    }
    if (entry.repeatedRole) {
      const selected = accepted.leaves.find(
        (candidate) => candidate.role === entry.repeatedRole,
      );
      assert.ok(selected, entry.id);
      let occurrence = -1;
      let cursor = 0;
      for (let index = 0; index <= entry.repeatedOccurrence; index += 1) {
        occurrence = entry.source.indexOf(entry.repeatedQuote, cursor);
        assert.notEqual(occurrence, -1, entry.id);
        cursor = occurrence + entry.repeatedQuote.length;
      }
      assert.equal(
        selected.sourceSpan.startCodePoint,
        codePointOffset(entry.source, occurrence),
        entry.id,
      );
    }
  }
});


const thresholdChainCases = [
  {
    id: "EN08-threshold-chain",
    source:
      "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval. Retrospective status does not skip approval.",
    quote:
      "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval",
    leaves: [
      leaf("field", "amount"),
      leaf("operator", "Above", ">"),
      leaf("value", "100,000"),
      leaf("matching_route", "CEO approval", "stage_reference"),
    ],
    selected: [{ role: "value", quote: "100,000", occurrence: 1 }],
    matchingRoute: "CEO approval",
    compiledValue: 100_000,
  },
  {
    id: "SC-generic-threshold-chain-2",
    source:
      "申请金额不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准。",
    quote:
      "申请金额不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准",
    leaves: [
      leaf("field", "申请金额"),
      leaf("operator", "超过", ">"),
      leaf("value", "一百万元"),
      leaf("matching_route", "财务总监批准", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超过", occurrence: 1 },
      { role: "value", quote: "一百万元", occurrence: 1 },
    ],
    matchingRoute: "财务总监批准",
  },
  {
    id: "TC-generic-threshold-chain-2",
    source:
      "申請金額不超過港幣一百萬元由財務經理批准。超過一百萬元由財務總監批准。",
    quote:
      "申請金額不超過港幣一百萬元由財務經理批准。超過一百萬元由財務總監批准",
    leaves: [
      leaf("field", "申請金額"),
      leaf("operator", "超過", ">"),
      leaf("value", "一百萬元"),
      leaf("matching_route", "財務總監批准", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超過", occurrence: 1 },
      { role: "value", quote: "一百萬元", occurrence: 1 },
    ],
    matchingRoute: "財務總監批准",
  },
  {
    id: "SC-generic-threshold-chain-3",
    source:
      "申请金额不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准。超过五百万元再由行政总裁批准。",
    quote:
      "申请金额不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准。超过五百万元再由行政总裁批准",
    leaves: [
      leaf("field", "申请金额"),
      leaf("operator", "超过", ">"),
      leaf("value", "五百万元"),
      leaf("matching_route", "行政总裁批准", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超过", occurrence: 2 },
    ],
    matchingRoute: "行政总裁批准",
  },
  {
    id: "TC-generic-threshold-chain-3",
    source:
      "申請金額不超過港幣一百萬元由財務經理批准。超過一百萬元由財務總監批准。超過五百萬元再由行政總裁批准。",
    quote:
      "申請金額不超過港幣一百萬元由財務經理批准。超過一百萬元由財務總監批准。超過五百萬元再由行政總裁批准",
    leaves: [
      leaf("field", "申請金額"),
      leaf("operator", "超過", ">"),
      leaf("value", "五百萬元"),
      leaf("matching_route", "行政總裁批准", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超過", occurrence: 2 },
    ],
    matchingRoute: "行政總裁批准",
  },
  {
    id: "SC04-low-risk-tier",
    source:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。",
    quote:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成",
    leaves: [
      leaf("field", "申请额度"),
      leaf("operator", "不超过", "<="),
      leaf("value", "一百万元"),
      leaf("matching_route", "财务经理", "stage_reference"),
    ],
    selected: [],
    matchingRoute: "财务经理",
    compoundBlocked: true,
  },
  {
    id: "SC04-threshold-tier-1",
    source:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。",
    quote:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准",
    leaves: [
      leaf("field", "申请额度"),
      leaf("operator", "超过", ">"),
      leaf("value", "一百万元"),
      leaf("matching_route", "财务总监批准", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超过", occurrence: 1 },
      { role: "value", quote: "一百万元", occurrence: 1 },
    ],
    matchingRoute: "财务总监批准",
  },
  {
    id: "SC04-threshold-tier-2",
    source:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。拒绝退回修改。",
    quote:
      "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准",
    leaves: [
      leaf("field", "申请额度"),
      leaf("operator", "超过", ">"),
      leaf("value", "五百万元"),
      leaf("matching_route", "行政总裁批准", "stage_reference"),
    ],
    selected: [{ role: "operator", quote: "超过", occurrence: 2 }],
    matchingRoute: "行政总裁批准",
  },
  {
    id: "SC07-low-risk-tier",
    source:
      "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。国际或高风险增加 HR 和安全。",
    quote: "本地低风险且总额不超过港币二万元，财务后完成",
    leaves: [
      leaf("field", "总额"),
      leaf("operator", "不超过", "<="),
      leaf("value", "二万元"),
      leaf("matching_route", "财务后完成", "stage_reference"),
    ],
    selected: [],
    matchingRoute: "财务后完成",
    compoundBlocked: true,
  },
  {
    id: "SC07-threshold-tier",
    source:
      "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管。国际或高风险增加 HR 和安全。",
    quote: "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管",
    leaves: [
      leaf("field", "总额"),
      leaf("operator", "超过", ">"),
      leaf("value", "二万元"),
      leaf("matching_route", "部门主管", "stage_reference"),
    ],
    selected: [
      { role: "operator", quote: "超过", occurrence: 1 },
      { role: "value", quote: "二万元", occurrence: 1 },
    ],
    matchingRoute: "部门主管",
  },
];

test("route-anchored threshold branches resolve only the governed occurrence", () => {
  for (const entry of thresholdChainCases) {
    const { located, sourceSlots } = locateCondition(
      entry.id,
      entry.source,
      entry.quote,
      entry.leaves,
    );
    assert.deepEqual(located.rejected, [], entry.id);
    assert.equal(located.accepted.length, 1, entry.id);
    const accepted = located.accepted[0];
    const assembled = assembleLocated(located, sourceSlots);
    const review = assembled.review.items[0];
    assert.equal(review?.complete, false, entry.id);
    if (entry.compoundBlocked) {
      assert.equal(review?.semanticComplete, false, entry.id);
      assert.equal(review?.fragmentId, null, entry.id);
      assert.equal(
        review?.blockingReason,
        "compound_predicate_not_executable",
        entry.id,
      );
      assert.equal(assembled.envelope.fragments.length, 0, entry.id);
    } else {
      assert.equal(review?.semanticComplete, true, entry.id);
      assert.notEqual(review?.fragmentId, null, entry.id);
      assert.equal(assembled.envelope.fragments.length, 1, entry.id);
    }
    assert.ok(
      review.semanticValue.matching_route.includes(entry.matchingRoute),
      entry.id,
    );
    if (entry.otherwiseRoute) {
      assert.ok(
        review.semanticValue.otherwise_route.includes(entry.otherwiseRoute),
        entry.id,
      );
    } else {
      assert.deepEqual(
        review.semanticValue.otherwise_route ?? [],
        [],
        entry.id,
      );
    }
    if (entry.compiledValue !== undefined) {
      assert.equal(review.value.value, entry.compiledValue, entry.id);
    }
    for (const selected of entry.selected) {
      const selectedLeaf = accepted.leaves.find(
        (candidate) => candidate.role === selected.role,
      );
      assert.ok(selectedLeaf, entry.id + ":" + selected.role);
      let offset = -1;
      let cursor = 0;
      for (let index = 0; index <= selected.occurrence; index += 1) {
        offset = entry.source.indexOf(selected.quote, cursor);
        assert.notEqual(offset, -1, entry.id);
        cursor = offset + selected.quote.length;
      }
      assert.equal(
        selectedLeaf.sourceSpan.startCodePoint,
        codePointOffset(entry.source, offset),
        entry.id + ":" + selected.role,
      );
    }
  }
});

test("threshold ambiguity recovery rejects non-adjacent or unclosed branches", () => {
  const cases = [
    {
      id: "logged-matching-route",
      quote:
        "amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 CEO approval is logged",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
    {
      id: "route-gap",
      quote:
        "amount is at most HKD 100,000, General Manager is the final approver. Audit notes are retained. Above HKD 100,000 add CEO approval",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
    {
      id: "duplicate-matching",
      quote:
        "amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval and CEO approval",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
    {
      id: "two-pairs-in-target",
      quote:
        "amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 and Above HKD 100,000 add CEO approval",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:operator",
    },
    {
      id: "unclosed-bridge",
      quote:
        "amount is at most HKD 100,000, General Manager is the final approver. Above the old limit HKD 100,000 add CEO approval",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
    {
      id: "numeric-prefix",
      quote:
        "amount is at most HKD 1,000, General Manager is the final approver. Above HKD 000 add CEO approval",
      field: "amount",
      operator: "Above",
      value: "000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
    {
      id: "embedded-positive-operator",
      quote:
        "申请额度不超过港币一百万元由财务经理批准。不超过一百万元增加财务总监批准",
      field: "申请额度",
      operator: "超过",
      value: "一百万元",
      matching: "财务总监批准",
      otherwise: "财务经理批准",
      detail: "condition:operator",
    },
    {
      id: "field-too-far",
      quote:
        "申请额度不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准。保留审计记录。超过五百万元再由行政总裁批准",
      field: "申请额度",
      operator: "超过",
      value: "五百万元",
      matching: "行政总裁批准",
      otherwise: "财务总监批准",
      detail: "condition:operator",
    },
    {
      id: "missing-tier-continuation",
      quote:
        "申请额度不超过港币一百万元由财务经理批准。超过一百万元由财务总监批准。超过五百万元由行政总裁批准",
      field: "申请额度",
      operator: "超过",
      value: "五百万元",
      matching: "行政总裁批准",
      otherwise: "财务总监批准",
      detail: "condition:operator",
    },
    {
      id: "direction-mismatch",
      quote:
        "amount above HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval",
      field: "amount",
      operator: "Above",
      value: "100,000",
      matching: "CEO approval",
      otherwise: "General Manager",
      detail: "condition:value",
    },
  ];
  for (const entry of cases) {
    const { located } = locateCondition(
      "threshold-attack:" + entry.id,
      entry.quote,
      entry.quote,
      [
        leaf("field", entry.field),
        leaf("operator", entry.operator, ">"),
        leaf("value", entry.value),
        leaf("matching_route", entry.matching, "stage_reference"),
        leaf("otherwise_route", entry.otherwise, "stage_reference"),
      ],
    );
    assert.equal(located.accepted.length, 0, entry.id);
    assert.deepEqual(located.rejected, [{
      itemIndex: 0,
      code: "leaf_ambiguous",
      detail: entry.detail,
    }], entry.id);
  }
});

test("matching-only threshold recovery rejects extra predicates and malformed tiers", () => {
  const cases = [
    {
      id: "extra-first-subject",
      quote:
        "申请额度不超过港币一百万元且国家额度超过二百万元由财务经理批准。超过一百万元由财务总监批准",
      value: "一百万元",
      matching: "财务总监批准",
    },
    {
      id: "extra-first-policy",
      quote:
        "申请额度不超过港币一百万元且国家政策已更新由财务经理批准。超过一百万元由财务总监批准",
      value: "一百万元",
      matching: "财务总监批准",
    },
    {
      id: "extra-middle-comparison",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且超过二百万元由财务总监批准；超过五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "extra-middle-subject",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家额度超过二百万元由财务总监批准；超过五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "missing-tier-continuation",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "audit-gap",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；保留审计记录；超过五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "reporting-tail",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准被记录",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "duplicate-target-operator",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过且超过五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "duplicate-target-value",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元和五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "numeric-prefix",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过一千五百万元再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "extra-target-tier-1-predicate",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元且国家风险也低时由财务总监批准；超过五百万元再由行政总裁批准",
      value: "一百万元",
      matching: "财务总监批准",
    },
    {
      id: "extra-target-tier-2-predicate",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元且国家风险也低时再由行政总裁批准",
      value: "五百万元",
      matching: "行政总裁批准",
    },
    {
      id: "overbroad-value",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成",
      operator: "不超过",
      operatorHint: "<=",
      value: "一百万元且风险低时可在",
      matching: "财务经理批准后完成",
      detail: "condition:value",
    },
    {
      id: "overbroad-route",
      quote:
        "申请额度超过港币一百万元由国家风险也低时由财务经理批准",
      value: "一百万元",
      matching: "国家风险也低时由财务经理批准",
      detail: "condition:matching_route",
    },
  ];
  for (const entry of cases) {
    const { located } = locateCondition(
      "matching-only-attack:" + entry.id,
      entry.quote,
      entry.quote,
      [
        leaf("field", "申请额度"),
        leaf("operator", entry.operator ?? "超过", entry.operatorHint ?? ">"),
        leaf("value", entry.value),
        leaf("matching_route", entry.matching, "stage_reference"),
      ],
    );
    assert.equal(located.accepted.length, 0, entry.id);
    assert.deepEqual(located.rejected, [{
      itemIndex: 0,
      code: "leaf_ambiguous",
      detail: entry.detail ?? "condition:operator",
    }], entry.id);
  }
});

test("matching-only threshold sources cannot invent otherwise routes", () => {
  const cases = [
    {
      id: "SC04",
      quote:
        "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准",
      field: "申请额度",
      value: "一百万元",
      matching: "财务总监批准",
      otherwise: "财务经理批准后完成",
    },
    {
      id: "SC07",
      quote:
        "本地低风险且总额不超过港币二万元，财务后完成。超过二万元增加部门主管",
      field: "总额",
      value: "二万元",
      matching: "部门主管",
      otherwise: "财务后完成",
    },
  ];
  for (const entry of cases) {
    const { located } = locateCondition(
      "invented-otherwise:" + entry.id,
      entry.quote,
      entry.quote,
      [
        leaf("field", entry.field),
        leaf("operator", "超过", ">"),
        leaf("value", entry.value),
        leaf("matching_route", entry.matching, "stage_reference"),
        leaf("otherwise_route", entry.otherwise, "stage_reference"),
      ],
    );
    assert.equal(located.accepted.length, 0, entry.id);
    assert.deepEqual(located.rejected, [{
      itemIndex: 0,
      code: "leaf_ambiguous",
      detail: "condition:operator",
    }], entry.id);
  }
});

test("the short TC04 equality quote remains ambiguity-rejected", () => {
  const entry = realPathCases.find(({ id }) => id === "TC04");
  const leaves = entry.leaves.map((candidate) =>
    candidate.role === "operator"
      ? leaf("operator", "高風險", "=")
      : candidate
  );
  const { located } = locateCondition(
    "TC04-short",
    entry.source,
    entry.quote,
    leaves,
  );
  assert.equal(located.accepted.length, 0);
  assert.deepEqual(located.rejected, [{
    itemIndex: 0,
    code: "leaf_ambiguous",
    detail: "condition:operator",
  }]);
});

test("numeric ambiguity recovery remains limited to the closed threshold form", () => {
  const cases = [
    {
      id: "unknown-currency",
      quote:
        "total amount below USD 50,000 versus at least USD 50,000 as branches",
      field: "total amount",
      operator: "at least",
      value: "50,000",
    },
    {
      id: "three-repetitions",
      quote:
        "total amount below HKD 50,000 versus exactly HKD 50,000 versus at least HKD 50,000",
      field: "total amount",
      operator: "at least",
      value: "50,000",
    },
    {
      id: "numeric-substring",
      quote:
        "total amount below HKD 150,000 versus at least HKD 50,000",
      field: "total amount",
      operator: "at least",
      value: "50,000",
    },
    {
      id: "cross-clause-field",
      quote:
        "country quota is 50,000. total amount is at least HKD 50,000",
      field: "country quota",
      operator: "at least",
      value: "50,000",
    },
    {
      id: "nonnumeric",
      quote: "risk is High versus at least High",
      field: "risk",
      operator: "at least",
      value: "High",
    },
  ];
  for (const entry of cases) {
    const { located } = locateCondition(
      `numeric-${entry.id}`,
      entry.quote,
      entry.quote,
      [
        leaf("field", entry.field),
        leaf("operator", entry.operator, ">="),
        leaf("value", entry.value),
      ],
    );
    assert.equal(located.accepted.length, 0, entry.id);
    assert.deepEqual(located.rejected, [{
      itemIndex: 0,
      code: "leaf_ambiguous",
      detail: "condition:value",
    }], entry.id);
  }
});

test("repeated default routes require one immediate affirmative destination", () => {
  const cases = [
    {
      id: "negated",
      branch: "Otherwise do not go from line manager to Finance",
    },
    { id: "bare", branch: "Otherwise Finance" },
    {
      id: "extra-target",
      branch: "Otherwise go from line manager to Finance, not Legal",
    },
    {
      id: "embedded-marker",
      branch: "If otherwise noted, go to Finance",
    },
    {
      id: "delayed",
      branch: "No default is specified. Otherwise go to Finance",
    },
    {
      id: "two-defaults",
      branch: "Otherwise go to Finance. Else go to Finance",
    },
    {
      id: "two-destinations",
      branch: "Otherwise go from Finance to Finance",
    },
  ];
  for (const entry of cases) {
    const quote =
      `total exceeds HKD 10,000, add Department Head approval before Finance. ${entry.branch}`;
    const { located } = locateCondition(
      `route-${entry.id}`,
      quote,
      quote,
      [
        leaf("field", "total"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "10,000"),
        leaf("matching_route", "Department Head", "stage_reference"),
        leaf("otherwise_route", "Finance", "stage_reference"),
      ],
    );
    assert.equal(located.accepted.length, 0, entry.id);
    assert.deepEqual(located.rejected, [{
      itemIndex: 0,
      code: "leaf_ambiguous",
      detail: "condition:otherwise_route",
    }], entry.id);
  }
});

test("real locator input cannot turn negation or unrelated outcomes into routes", () => {
  const cases = [
    {
      id: "leading-no",
      source:
        "No Data Protection is required only when personal-data choice is Yes.",
      quote:
        "Data Protection is required only when personal-data choice is Yes",
      leaves: [
        leaf("field", "personal-data choice"),
        leaf("operator", "is Yes", "="),
        leaf("value", "Yes"),
        leaf("matching_route", "Data Protection", "stage_reference"),
      ],
    },
    {
      id: "negated-default",
      source:
        "High-risk visits require Site Manager. Normal visits do not route to Legal.",
      quote:
        "High-risk visits require Site Manager. Normal visits do not route to Legal",
      leaves: [
        leaf("field", "High-risk visits"),
        leaf("operator", "High-risk", "="),
        leaf("value", "High-risk visits"),
        leaf("matching_route", "Site Manager", "stage_reference"),
        leaf("otherwise_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "past-participle",
      source:
        "Amount exceeds 100. If either Finance approver rejects, returned invitations are logged.",
      quote: "Amount exceeds 100. If either Finance approver",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Finance approver", "stage_reference"),
      ],
    },
    {
      id: "unrelated-returns-policy",
      source:
        "Amount exceeds 100. If either Finance approver rejects, returns policy requires HR approval.",
      quote:
        "Amount exceeds 100. If either Finance approver rejects, returns policy requires HR",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "HR", "stage_reference"),
      ],
    },
    {
      id: "logged-route",
      source: "Amount above 100,000, CEO approval is logged.",
      quote: "Amount above 100,000, CEO approval is logged",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "above", ">"),
        leaf("value", "100,000"),
        leaf("matching_route", "CEO approval", "stage_reference"),
      ],
    },
    {
      id: "negated-add",
      source: "Amount above 100,000, do not add CEO approval.",
      quote: "Amount above 100,000, do not add CEO approval",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "above", ">"),
        leaf("value", "100,000"),
        leaf("matching_route", "CEO approval", "stage_reference"),
      ],
    },
    {
      id: "not-final",
      source:
        "If amount is at most 100, General Manager is not the final approver.",
      quote:
        "amount is at most 100, General Manager is not the final approver",
      leaves: [
        leaf("field", "amount"),
        leaf("operator", "at most", "<="),
        leaf("value", "100"),
        leaf("matching_route", "General Manager", "stage_reference"),
      ],
    },
    {
      id: "reporting-only",
      source:
        "If amount is at most 100, General Manager is the final approver for reporting only.",
      quote:
        "amount is at most 100, General Manager is the final approver for reporting only",
      leaves: [
        leaf("field", "amount"),
        leaf("operator", "at most", "<="),
        leaf("value", "100"),
        leaf("matching_route", "General Manager", "stage_reference"),
      ],
    },
    {
      id: "unrelated-subject-en",
      source: "Amount exceeds 100, the country policy routes to Legal.",
      quote: "Amount exceeds 100, the country policy routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "unrelated-subject-tc",
      source: "金額超過100，國家政策送交法務。",
      quote: "金額超過100，國家政策送交法務",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法務", "stage_reference"),
      ],
    },
    {
      id: "unrelated-subject-sc",
      source: "金额超过100，国家政策送交法务。",
      quote: "金额超过100，国家政策送交法务",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法务", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-guard-en",
      source:
        "Induction status is missing and does not block submission.",
      quote:
        "Induction status is missing and does not block submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and does not"),
        leaf("matching_route", "block submission", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-qualified-guard-en",
      source:
        "Induction status is missing and does not directly block submission.",
      quote:
        "Induction status is missing and does not directly block submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and does not directly"),
        leaf("matching_route", "block submission", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-qualified-guard-tc",
      source: "法定培訓未能提供證書不會直接導致不可完成。",
      quote: "法定培訓未能提供證書不會直接導致不可完成",
      leaves: [
        leaf("field", "法定培訓"),
        leaf("operator", "未能提供證書", "="),
        leaf("value", "未能提供證書不會直接導致"),
        leaf("matching_route", "不可完成", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-qualified-guard-sc",
      source: "措施未验证不会直接导致不得结案。",
      quote: "措施未验证不会直接导致不得结案",
      leaves: [
        leaf("field", "措施"),
        leaf("operator", "未验证", "="),
        leaf("value", "未验证不会直接导致"),
        leaf("matching_route", "不得结案", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-qualified-guard-en",
      source:
        "Induction status is missing but is not sufficient evidence that it blocks submission.",
      quote:
        "Induction status is missing but is not sufficient evidence that it blocks submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing but is not sufficient evidence that it"),
        leaf("matching_route", "blocks submission", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-qualified-guard-tc",
      source: "法定培訓未能提供證書並不足以證明不可完成。",
      quote: "法定培訓未能提供證書並不足以證明不可完成",
      leaves: [
        leaf("field", "法定培訓"),
        leaf("operator", "未能提供證書", "="),
        leaf("value", "未能提供證書並不足以證明"),
        leaf("matching_route", "不可完成", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-qualified-guard-sc",
      source: "措施未验证并不足以证明不得结案。",
      quote: "措施未验证并不足以证明不得结案",
      leaves: [
        leaf("field", "措施"),
        leaf("operator", "未验证", "="),
        leaf("value", "未验证并不足以证明"),
        leaf("matching_route", "不得结案", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-contraction-guard-en",
      source: "Induction status is missing and doesn't block submission",
      quote: "Induction status is missing and doesn't block submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and doesn't"),
        leaf("matching_route", "block submission", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-cannot-guard-en",
      source: "Induction status is missing and cannot block submission",
      quote: "Induction status is missing and cannot block submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and cannot"),
        leaf("matching_route", "block submission", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-in-no-way-guard-en",
      source: "Induction status is missing and in no way blocks submission",
      quote: "Induction status is missing and in no way blocks submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and in no way"),
        leaf("matching_route", "blocks submission", "stage_reference"),
      ],
    },
    {
      id: "direct-negated-qualified-route-en",
      source: "Amount exceeds 100 and does not directly route to Legal.",
      quote: "Amount exceeds 100 and does not directly route to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100 and does not directly route to"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      providerReject: true,
    },
    {
      id: "direct-negated-contraction-route-en",
      source: "Amount exceeds 100 and doesn't route to Legal.",
      quote: "Amount exceeds 100 and doesn't route to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100 and doesn't route to"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      providerReject: true,
    },
    {
      id: "direct-negated-cannot-route-en",
      source: "Amount exceeds 100 and cannot route to Legal.",
      quote: "Amount exceeds 100 and cannot route to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100 and cannot route to"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      providerReject: true,
    },
    {
      id: "meta-negated-guard-en",
      source:
        "Missing induction. The policy does not say it blocks submission.",
      quote:
        "Missing induction. The policy does not say it blocks submission",
      leaves: [
        leaf("field", "Missing induction"),
        leaf("operator", "Missing induction", "="),
        leaf("value", "Missing induction"),
        leaf("matching_route", "blocks submission", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-proof-en",
      source: "Missing induction is not proof it blocks submission.",
      quote: "Missing induction is not proof it blocks submission",
      leaves: [
        leaf("field", "Missing induction is not proof it"),
        leaf("operator", "Missing induction is not proof it", "="),
        leaf("value", "Missing induction is not proof it"),
        leaf("matching_route", "blocks submission", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-skip-en",
      source:
        "Retrospective status. The note does not say it does not skip approval.",
      quote:
        "Retrospective status. The note does not say it does not skip approval",
      leaves: [
        leaf("field", "Retrospective status"),
        leaf("operator", "Retrospective status", "="),
        leaf("value", "Retrospective status"),
        leaf(
          "matching_route",
          "does not skip approval",
          "stage_reference",
        ),
      ],
    },
    {
      id: "meta-negated-guard-tc",
      source: "法定培訓未能提供證書。政策未說明不可完成。",
      quote: "法定培訓未能提供證書。政策未說明不可完成",
      leaves: [
        leaf("field", "法定培訓"),
        leaf("operator", "未能提供證書", "="),
        leaf("value", "未能提供證書"),
        leaf("matching_route", "不可完成", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-guard-sc",
      source: "措施未验证。政策不表示不得结案。",
      quote: "措施未验证。政策不表示不得结案",
      leaves: [
        leaf("field", "措施"),
        leaf("operator", "未验证", "="),
        leaf("value", "未验证"),
        leaf("matching_route", "不得结案", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-proof-tc",
      source: "法定培訓並非證明不可完成。",
      quote: "法定培訓並非證明不可完成",
      leaves: [
        leaf("field", "法定培訓並非證明"),
        leaf("operator", "法定培訓並非證明", "="),
        leaf("value", "法定培訓並非證明"),
        leaf("matching_route", "不可完成", "stage_reference"),
      ],
    },
    {
      id: "meta-negated-proof-sc",
      source: "措施并非证明不得结案。",
      quote: "措施并非证明不得结案",
      leaves: [
        leaf("field", "措施并非证明"),
        leaf("operator", "措施并非证明", "="),
        leaf("value", "措施并非证明"),
        leaf("matching_route", "不得结案", "stage_reference"),
      ],
    },
    {
      id: "decision-noun-en",
      source:
        "Amount exceeds 100. If either Finance approver rejects, returns to sender are logged.",
      quote: "Amount exceeds 100. If either Finance approver",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Finance approver", "stage_reference"),
      ],
    },
    {
      id: "decision-location-correction-en",
      source:
        "Amount exceeds 100. If either Finance approver rejects, return to warehouse for correction.",
      quote: "Amount exceeds 100. If either Finance approver",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Finance approver", "stage_reference"),
      ],
    },
    {
      id: "decision-object-correction-en",
      source:
        "Amount exceeds 100. If either Finance approver rejects, return to purchase order for correction.",
      quote: "Amount exceeds 100. If either Finance approver",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Finance approver", "stage_reference"),
      ],
    },
    {
      id: "decision-noun-tc",
      source:
        "金額超過100。若任一財務審批人拒絕，退回貨品會被記錄。",
      quote: "金額超過100。若任一財務審批人",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "財務審批人", "stage_reference"),
      ],
    },
    {
      id: "decision-noun-sc",
      source:
        "金额超过100。如果任一财务审批人拒绝，退回货品会被记录。",
      quote: "金额超过100。如果任一财务审批人",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "财务审批人", "stage_reference"),
      ],
    },
    {
      id: "decision-object-modification-tc",
      source:
        "金額超過100。若任一財務審批人拒絕，退回貨品修改。",
      quote: "金額超過100。若任一財務審批人",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "財務審批人", "stage_reference"),
      ],
    },
    {
      id: "decision-location-modification-tc",
      source:
        "金額超過100。若任一財務審批人拒絕，退回倉庫修改。",
      quote: "金額超過100。若任一財務審批人",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "財務審批人", "stage_reference"),
      ],
    },
    {
      id: "decision-object-modification-sc",
      source:
        "金额超过100。如果任一财务审批人拒绝，退回货品修改。",
      quote: "金额超过100。如果任一财务审批人",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "财务审批人", "stage_reference"),
      ],
    },
    {
      id: "decision-route-reporting-en",
      source:
        "Amount exceeds 100. If either Finance approver rejects, routes to warehouse are logged.",
      quote: "Amount exceeds 100. If either Finance approver",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Finance approver", "stage_reference"),
      ],
    },
    {
      id: "decision-route-reporting-tc",
      source:
        "金額超過100。若任一財務審批人拒絕，送交倉庫被記錄。",
      quote: "金額超過100。若任一財務審批人",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "財務審批人", "stage_reference"),
      ],
    },
    {
      id: "decision-add-object-sc",
      source:
        "金额超过100。如果任一财务审批人拒绝，增加货品数量。",
      quote: "金额超过100。如果任一财务审批人",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "财务审批人", "stage_reference"),
      ],
    },
  ];
  for (const entry of cases) {
    const { located, sourceSlots } = locateCondition(
      `attack-${entry.id}`,
      entry.source,
      entry.quote,
      entry.leaves,
    );
    if (entry.providerReject) {
      assert.equal(located.accepted.length, 0, entry.id);
      assert.deepEqual(located.rejected, [{
        itemIndex: 0,
        code: "leaf_ambiguous",
        detail: "condition:value",
      }], entry.id);
      continue;
    }
    assert.deepEqual(located.rejected, [], entry.id);
    assert.equal(located.accepted.length, 1, entry.id);
    const assembled = assembleLocated(located, sourceSlots);
    assert.equal(assembled.review.items.length, 1, entry.id);
    const review = assembled.review.items[0];
    assert.equal(review.semanticComplete, false, entry.id);
    assert.equal(review.complete, false, entry.id);
    assert.equal(review.fragmentId, null, entry.id);
    assert.equal(assembled.envelope.fragments.length, 0, entry.id);
  }
});


test("direct and correction-bound condition routes remain valid", () => {
  const cases = [
    {
      id: "direct-en",
      source: "Amount exceeds 100, route to Legal.",
      quote: "Amount exceeds 100, route to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceeds", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "closed-guard-en",
      source: "Induction status is missing and blocks submission.",
      quote: "Induction status is missing and blocks submission",
      leaves: [
        leaf("field", "Induction status"),
        leaf("operator", "is missing", "="),
        leaf("value", "missing and"),
        leaf("matching_route", "blocks submission", "stage_reference"),
      ],
      governedHold: true,
    },
    {
      id: "closed-guard-tc",
      source: "法定培訓未能提供證書不可完成。",
      quote: "法定培訓未能提供證書不可完成",
      leaves: [
        leaf("field", "法定培訓"),
        leaf("operator", "未能提供證書", "="),
        leaf("value", "未能提供證書"),
        leaf("matching_route", "不可完成", "stage_reference"),
      ],
      governedHold: true,
    },
    {
      id: "closed-guard-sc",
      source: "措施未验证不得结案。",
      quote: "措施未验证不得结案",
      leaves: [
        leaf("field", "措施"),
        leaf("operator", "未验证", "="),
        leaf("value", "未验证"),
        leaf("matching_route", "不得结案", "stage_reference"),
      ],
      governedHold: true,
    },
    {
      id: "direct-tc",
      source: "金額超過100，送交法務。",
      quote: "金額超過100，送交法務",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法務", "stage_reference"),
      ],
    },
    {
      id: "direct-sc",
      source: "金额超过100，送交法务。",
      quote: "金额超过100，送交法务",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法务", "stage_reference"),
      ],
    },
    {
      id: "decision-tc",
      source:
        "金額超過100。若任一財務審批人拒絕，退回申請人修正。",
      quote: "金額超過100。若任一財務審批人",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "財務審批人", "stage_reference"),
      ],
    },
    {
      id: "decision-sc",
      source:
        "金额超过100。如果任一财务审批人拒绝，退回申请人修正。",
      quote: "金额超过100。如果任一财务审批人",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "财务审批人", "stage_reference"),
      ],
    },
  ];
  for (const entry of cases) {
    const { located, sourceSlots } = locateCondition(
      "route-positive:" + entry.id,
      entry.source,
      entry.quote,
      entry.leaves,
    );
    assert.deepEqual(located.rejected, [], entry.id);
    assert.equal(located.accepted.length, 1, entry.id);
    const assembled = assembleLocated(located, sourceSlots);
    const review = assembled.review.items[0];
    assert.equal(review?.semanticComplete, !entry.governedHold, entry.id);
    assert.equal(
      assembled.envelope.fragments.length,
      entry.governedHold ? 0 : 1,
      entry.id,
    );
    if (entry.governedHold) {
      assert.equal(review?.fragmentId, null, entry.id);
      assert.equal(
        review?.blockingReason,
        "unsupported_semantics_not_executable",
        entry.id,
      );
    }
  }
});

test("the formal real path binds provider-split simplified CJK yes to the complete source comparator", () => {
  for (const { caseId, operatorQuote } of [
    { caseId: "leading-copula", operatorQuote: "为" },
    { caseId: "overlapping-value", operatorQuote: "是" },
  ]) {
    const source = "安全影响为是时安全评审必须阻塞流程";
    const { located, sourceSlots } = locateFormalCondition(
      `cjk-yes-${caseId}`,
      source,
      source,
      [
        leaf("field", "安全影响"),
        leaf("operator", operatorQuote, "="),
        leaf("value", "是"),
        leaf("matching_route", "安全评审", "stage_reference"),
      ],
    );
    assert.deepEqual(located.rejected, [], operatorQuote);
    assert.equal(located.accepted.length, 1, operatorQuote);
    assert.equal(
      located.accepted[0].leaves.find((entry) => entry.role === "operator")
        ?.sourceSpan.exactText,
      operatorQuote,
      operatorQuote,
    );
    const symbols = locateFormalSc01ConditionSymbols(
      `cjk-yes-${caseId}`,
    );
    assert.deepEqual(symbols.rejected, [], `${operatorQuote}: symbols`);
    assert.equal(symbols.accepted.length, 2, `${operatorQuote}: symbols`);
    const assembled = assembleLocated(
      {
        ...located,
        accepted: [...symbols.accepted, ...located.accepted],
      },
      [...symbols.sourceSlots, ...sourceSlots],
    );
    const item = assembled.review.items.find((entry) =>
      entry.factId === "workflow.conditions"
    );
    assert.ok(item, `${operatorQuote}: ${JSON.stringify(assembled.review.rejections)}`);
    assert.equal(item.value.operator, "=", operatorQuote);
    assert.equal(item.semanticComplete, true, operatorQuote);
    const operatorBinding = item.bindings.find(
      (binding) => binding.path === "/operator",
    );
    assert.ok(operatorBinding, operatorQuote);
    assert.deepEqual(
      operatorBinding.spanIds.map((spanId) =>
        item.sourceSpans.find((span) => span.spanId === spanId)?.exactText
      ),
      ["为是"],
      operatorQuote,
    );
    assert.equal(
      assembled.review.rejections.some(
        (entry) => entry.detail === "condition:operator",
      ),
      false,
      operatorQuote,
    );
  }
});
