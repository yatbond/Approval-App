import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTemplateCopilotV3Description,
  TemplateCopilotV3DescribeExtractionError,
} from "./template-copilot-v3-describe-extraction.ts";
import {
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatchIds,
} from "./template-copilot-v3-provider-quotes.ts";

const sections = [
  { slot: "identity_scope", messageId: "describe:identity_scope:1", text: "Create a supplier payment request workflow." },
  { slot: "initiators_fields", messageId: "describe:initiators_fields:1", text: "Any employee may submit. Require supplier name and amount." },
  { slot: "stages_participants", messageId: "describe:stages_participants:1", text: "The department manager approves." },
];

function capacityError() {
  return Object.assign(new Error("The provider quote transport failed: output_capacity_exhausted."), {
    reasonCode: "output_capacity_exhausted",
  });
}

// A real located batch: the intake batch quoting one request field.
function intakeResult(sourceSlots) {
  return locateTemplateCopilotV3ProviderQuotes({
    batchId: "intake_documents",
    sourceSlots,
    output: {
      contractVersion: 1,
      items: [{
        kind: "request_field",
        quote: "Require supplier name",
        leaves: [
          { role: "label", quote: "supplier name", hint: null },
          { role: "required", quote: "Require", hint: "true" },
        ],
        confidence: "high",
        ambiguity: "none",
      }],
    },
  });
}

test("a failed batch is asked again once and its answer is used", async () => {
  const calls = [];
  const result = await extractTemplateCopilotV3Description({
    sections,
    locale: "en",
    extractBatch: async ({ batchId, sourceSlots }) => {
      calls.push(batchId);
      if (batchId === "intake_documents" && calls.filter((id) => id === batchId).length === 1) {
        throw capacityError();
      }
      return batchId === "intake_documents"
        ? intakeResult(sourceSlots)
        : { accepted: [], rejected: [] };
    },
  });
  const intake = result.batches.find((batch) => batch.batchId === "intake_documents");
  assert.deepEqual(
    { status: intake.status, attempts: intake.attempts, accepted: intake.acceptedItemCount },
    { status: "applied", attempts: 2, accepted: 1 },
  );
  assert.ok(
    result.assembly.review.items.some((item) => item.factId === "request.fields"),
    JSON.stringify(result.assembly.review.rejections),
  );
  assert.deepEqual(result.sourceMessageOrder, sections.map((section) => section.messageId));
});

test("a batch that fails twice is reported missing while the others still apply", async () => {
  const result = await extractTemplateCopilotV3Description({
    sections,
    locale: "en",
    extractBatch: async ({ batchId }) => {
      if (batchId === "routing_stages_participants") throw capacityError();
      return { accepted: [], rejected: [] };
    },
  });
  const statuses = Object.fromEntries(result.batches.map((batch) => [batch.batchId, [batch.status, batch.attempts]]));
  assert.deepEqual(statuses.routing_stages_participants, ["failed", 2]);
  assert.deepEqual(statuses.intake_documents, ["applied", 1]);
  assert.deepEqual(statuses.routing_conditions, ["applied", 0]);
  assert.equal(
    result.batches.find((batch) => batch.batchId === "routing_stages_participants").failureReason,
    "output_capacity_exhausted",
  );
});

test("configuration failures are not retried and stop the description", async () => {
  let calls = 0;
  await assert.rejects(
    extractTemplateCopilotV3Description({
      sections,
      locale: "en",
      extractBatch: async () => {
        calls += 1;
        throw Object.assign(new Error("missing key"), { reasonCode: "provider_configuration" });
      },
    }),
    (error) =>
      error instanceof TemplateCopilotV3DescribeExtractionError &&
      error.reasonCode === "provider_configuration",
  );
  assert.equal(calls, 1);
});

test("an unreachable model fails the description so the caller can fall back", async () => {
  let calls = 0;
  await assert.rejects(
    extractTemplateCopilotV3Description({
      sections,
      locale: "en",
      extractBatch: async () => {
        calls += 1;
        throw Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
      },
    }),
    (error) =>
      error instanceof TemplateCopilotV3DescribeExtractionError &&
      error.reasonCode === "timeout",
  );
  // Batches with only empty sections are skipped; every other one tried twice.
  assert.ok(calls >= 2 && calls % 2 === 0, String(calls));
});

test("retries stop when the caller's deadline is near, and empty input is refused", async () => {
  let calls = 0;
  const result = await extractTemplateCopilotV3Description({
    sections,
    locale: "en",
    shouldContinue: () => false,
    extractBatch: async ({ batchId }) => {
      calls += 1;
      if (batchId === "intake_documents") throw capacityError();
      return { accepted: [], rejected: [] };
    },
  });
  assert.equal(result.batches.find((batch) => batch.batchId === "intake_documents").attempts, 1);
  assert.ok(result.batches.every((batch) => batch.attempts <= 1));
  assert.equal(calls, result.batches.filter((batch) => batch.attempts === 1).length);
  assert.equal(result.batches.length, templateCopilotV3ProviderQuoteBatchIds.length);
  await assert.rejects(
    extractTemplateCopilotV3Description({
      sections: [{ slot: "identity_scope", messageId: "describe:identity_scope:1", text: "  " }],
      locale: "en",
      extractBatch: async () => ({ accepted: [], rejected: [] }),
    }),
    (error) => error.reasonCode === "empty_description",
  );
  await assert.rejects(
    extractTemplateCopilotV3Description({
      sections: [sections[0], sections[0]],
      locale: "en",
      extractBatch: async () => ({ accepted: [], rejected: [] }),
    }),
    (error) => error.reasonCode === "invalid_section",
  );
});
