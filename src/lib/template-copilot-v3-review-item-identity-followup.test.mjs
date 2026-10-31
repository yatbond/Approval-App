import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleTemplateCopilotV3Review,
  templateCopilotV3ReviewItemId,
} from "./template-copilot-v3-review-assembly.ts";
import { templateCopilotV3SourceSpanId } from "./template-copilot-v3-evidence.ts";

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
  return Object.freeze({
    spanId: templateCopilotV3SourceSpanId(supplied),
    ...supplied,
  });
}

function locatedCondition({ messageId, text, leaves }) {
  return Object.freeze({
    itemIndex: 0,
    kind: "condition",
    slot: "conditions_exceptions",
    anchor: span(messageId, text, text),
    leaves: Object.freeze(
      leaves.map((leaf) =>
        Object.freeze({
          role: leaf.role,
          hint: leaf.hint ?? null,
          sourceSpan: span(messageId, text, leaf.quote),
        }),
      ),
    ),
    confidence: "high",
    ambiguity: "none",
  });
}

test("review item identity binds semantic interpretation, anchors, and audit authority", () => {
  const messageId = "message-condition-review-identity-001";
  const text =
    "Amount greater than 100 routes to Manager Approval; otherwise complete the workflow";
  const result = assembleTemplateCopilotV3Review({
    sourceMessages: { [messageId]: text },
    items: [
      locatedCondition({
        messageId,
        text,
        leaves: [
          { role: "field", quote: "Amount" },
          { role: "operator", quote: "greater than", hint: ">" },
          { role: "value", quote: "100" },
          {
            role: "matching_route",
            quote: "Manager Approval",
            hint: "stage_reference",
          },
          {
            role: "otherwise_route",
            quote: "complete the workflow",
            hint: "complete",
          },
        ],
      }),
    ],
  });
  const item = result.review.items[0];
  assert.ok(item, JSON.stringify(result.review.rejections));
  assert.equal(templateCopilotV3ReviewItemId(item), item.reviewItemId);

  const permuted = structuredClone(item);
  permuted.missingPaths.reverse();
  permuted.observedRoles.reverse();
  permuted.semanticLeaves.reverse();
  permuted.semanticObservations.reverse();
  permuted.sourceAnchors.reverse();
  permuted.semanticValue = Object.fromEntries(
    Object.entries(permuted.semanticValue)
      .reverse()
      .map(([role, quotes]) => [role, [...quotes].reverse()]),
  );
  assert.equal(
    templateCopilotV3ReviewItemId(permuted),
    item.reviewItemId,
    "non-authoritative collection order must not change identity",
  );

  const swapped = structuredClone(item);
  const swapFieldAndValue = (observation) => ({
    ...observation,
    role:
      observation.role === "field"
        ? "value"
        : observation.role === "value"
          ? "field"
          : observation.role,
  });
  swapped.semanticLeaves = swapped.semanticLeaves.map(swapFieldAndValue);
  swapped.semanticObservations =
    swapped.semanticObservations.map(swapFieldAndValue);
  swapped.semanticValue = {
    ...swapped.semanticValue,
    field: item.semanticValue.value,
    value: item.semanticValue.field,
  };
  assert.notEqual(
    templateCopilotV3ReviewItemId(swapped),
    item.reviewItemId,
    "a consistent semantic field/value role swap must change identity",
  );

  const assertMutationChangesIdentity = (label, mutate) => {
    const changed = structuredClone(item);
    mutate(changed);
    assert.notEqual(
      templateCopilotV3ReviewItemId(changed),
      item.reviewItemId,
      label,
    );
  };
  assertMutationChangesIdentity("observed roles", (changed) => {
    changed.observedRoles.push(changed.observedRoles[0]);
  });
  assertMutationChangesIdentity("semantic value", (changed) => {
    changed.semanticValue.field = ["Different field"];
  });
  assertMutationChangesIdentity("semantic leaves", (changed) => {
    changed.semanticLeaves[0].quote = "Different quote";
  });
  assertMutationChangesIdentity("semantic observations", (changed) => {
    changed.semanticObservations[0].advisoryHint = "different_hint";
  });
  assertMutationChangesIdentity("source anchors", (changed) => {
    changed.sourceAnchors = [
      span(messageId, text, "Amount greater than 100"),
    ];
  });
  assertMutationChangesIdentity("missing paths", (changed) => {
    changed.missingPaths.push("/identityProbe");
  });
  assertMutationChangesIdentity("ambiguity note", (changed) => {
    changed.ambiguityNote = "Changed audit note.";
  });
  assertMutationChangesIdentity("conflict group", (changed) => {
    changed.conflictGroupId = "a".repeat(64);
  });
  assertMutationChangesIdentity("persisted authority", (changed) => {
    changed.persisted = true;
  });
  assertMutationChangesIdentity("executable authority", (changed) => {
    changed.executable = true;
  });
  assertMutationChangesIdentity("default authority", (changed) => {
    changed.defaulted = true;
  });
});
