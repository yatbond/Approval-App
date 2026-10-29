import assert from "node:assert/strict";
import test from "node:test";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  assembleTemplateCopilotV3Review,
} from "./template-copilot-v3-review-assembly.ts";

function leaf(role, quote, hint = null) {
  return { role, quote, hint };
}

function structureSources(caseId, conditionText) {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `followup:${caseId}:${slot}`,
    text: slot === "conditions_exceptions"
      ? conditionText
      : `No ${slot} requirements supplied.`,
  }));
}

function locateCondition(caseId, source, quote, leaves) {
  const sourceSlots = structureSources(caseId, source);
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [{
        kind: "condition",
        quote,
        leaves,
        confidence: "high",
        ambiguity: "none",
      }],
    },
  });
  return { located, sourceSlots };
}

function assembleLocated(located, sourceSlots) {
  return assembleTemplateCopilotV3Review({
    items: located.accepted,
    sourceMessages: Object.fromEntries(
      sourceSlots.map(({ messageId, text }) => [messageId, text]),
    ),
    sourceMessageOrder: sourceSlots.map(({ messageId }) => messageId),
  });
}

test("predicate negation, malformed numbers, field collisions, and compound predicates fail closed through the full path", () => {
  const cases = [
    {
      id: "symbolic-predicate-negation",
      source: "Amount is not > 100, routes to Legal.",
      quote: "Amount is not > 100, routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "external-word-negation-en",
      source: "Amount does not exceed 100 and routes to Legal.",
      quote: "Amount does not exceed 100 and routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", "exceed", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "external-word-negation-sc",
      source: "金额不超过100则转至法务。",
      quote: "金额不超过100则转至法务",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", "超过", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法务", "stage_reference"),
      ],
    },
    {
      id: "external-word-negation-tc",
      source: "金額不超過100則轉至法務。",
      quote: "金額不超過100則轉至法務",
      leaves: [
        leaf("field", "金額"),
        leaf("operator", "超過", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法務", "stage_reference"),
      ],
    },
    {
      id: "meta-negation-en",
      source: "The policy does not state Amount > 100 routes to Legal.",
      quote: "The policy does not state Amount > 100 routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "meta-negation-sc",
      source: "政策未说明金额 > 100 送交法务。",
      quote: "政策未说明金额 > 100 送交法务",
      leaves: [
        leaf("field", "金额"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "法务", "stage_reference"),
      ],
    },
    {
      id: "malformed-grouped-number",
      source: "Amount > 1,2,3 routes to Legal.",
      quote: "Amount > 1,2,3 routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "1,2,3"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      providerReject: true,
    },
    {
      id: "field-substring-collision",
      source: "Amount is at most 10, Finance is the final approver. Discount amount > 100 routes to Legal.",
      quote: "Amount is at most 10, Finance is the final approver. Discount amount > 100 routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
    },
    {
      id: "leading-compound-predicate",
      source: "Country is US and Amount > 100 routes to Legal.",
      quote: "Country is US and Amount > 100 routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      blockingReason: "compound_predicate_not_executable",
    },
    {
      id: "trailing-compound-predicate",
      source: "Amount > 100 and Country is US routes to Legal.",
      quote: "Amount > 100 and Country is US routes to Legal",
      leaves: [
        leaf("field", "Amount"),
        leaf("operator", ">", ">"),
        leaf("value", "100"),
        leaf("matching_route", "Legal", "stage_reference"),
      ],
      blockingReason: "compound_predicate_not_executable",
    },
  ];

  for (const entry of cases) {
    const { located, sourceSlots } = locateCondition(
      entry.id,
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
    assert.equal(review.persisted, false, entry.id);
    assert.equal(review.executable, false, entry.id);
    assert.equal(assembled.envelope.fragments.length, 0, entry.id);
    assert.equal(review.blockingReason, entry.blockingReason, entry.id);
  }
});

test("bounded operator-led same-field carry-forward remains semantically complete", () => {
  const source =
    "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval.";
  const quote =
    "If amount is at most HKD 100,000, General Manager is the final approver. Above HKD 100,000 add CEO approval";
  const { located, sourceSlots } = locateCondition(
    "legitimate-same-field-carry",
    source,
    quote,
    [
      leaf("field", "amount"),
      leaf("operator", "Above", ">"),
      leaf("value", "100,000"),
      leaf("matching_route", "CEO approval", "stage_reference"),
    ],
  );

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 1);
  const assembled = assembleLocated(located, sourceSlots);
  assert.equal(assembled.review.items.length, 1);
  const review = assembled.review.items[0];
  assert.equal(review.semanticComplete, true);
  assert.notEqual(review.fragmentId, null);
  assert.equal(review.blockingReason, undefined);
  assert.equal(assembled.envelope.fragments.length, 1);
});

test("an operator-led later threshold branch carries its field and is held for review", () => {
  const source =
    "申请额度不超过港币一百万元且风险低时可在财务经理批准后完成。超过一百万元由财务总监批准；超过五百万元再由行政总裁批准。";
  const { located, sourceSlots } = locateCondition(
    "carried-threshold-branch",
    source,
    "超过五百万元再由行政总裁批准",
    [
      leaf("field", "申请额度"),
      leaf("operator", "超过", ">"),
      leaf("value", "五百万元"),
      leaf("matching_route", "再由行政总裁批准", "stage_reference"),
    ],
  );

  assert.deepEqual(located.rejected, []);
  assert.equal(located.accepted.length, 1);
  const operator = located.accepted[0].leaves.find((entry) => entry.role === "operator");
  // The operator binds inside the quoted branch, not inside the earlier "不超过".
  assert.equal(
    operator.sourceSpan.startCodePoint,
    Array.from(source.slice(0, source.indexOf("超过五百万元"))).length,
  );
  const [review] = assembleLocated(located, sourceSlots).review.items;
  assert.equal(review.semanticComplete, false);
  assert.equal(review.executable, false);
  assert.equal(review.blockingReason, "unsupported_semantics_not_executable");
});

test("a later branch that names its own subject never inherits an earlier field", () => {
  const source = "Amount is at most 10, Finance is the final approver. Discount amount > 100 routes to Legal.";
  const { located, sourceSlots } = locateCondition(
    "own-subject-branch",
    source,
    "> 100 routes to Legal",
    [
      leaf("field", "Amount"),
      leaf("operator", ">", ">"),
      leaf("value", "100"),
      leaf("matching_route", "Legal", "stage_reference"),
    ],
  );
  // Even if the quote is widened back to "Amount", the branch clause names its
  // own subject, so it is neither complete nor held: it stays unresolved.
  for (const review of assembleLocated(located, sourceSlots).review.items) {
    assert.notEqual(review.semanticComplete, true);
    assert.equal(review.blockingReason, undefined);
  }
});
