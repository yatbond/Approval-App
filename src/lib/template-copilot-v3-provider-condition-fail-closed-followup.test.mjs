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
