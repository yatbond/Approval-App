import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeTemplateCopilotV3ProviderQuoteTransport,
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatches,
  templateCopilotV3ProviderQuoteTransportLimits,
  TemplateCopilotV3ProviderQuoteTransportError,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  requestTemplateCopilotV3ProviderQuoteOutput,
} from "./template-copilot-v3-provider-request.ts";

function sourceSlots() {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `message:request-test:${slot}`,
    text:
      slot === "initiators_fields"
        ? "Require purpose."
        : `No ${slot} requirements supplied.`,
  }));
}

function validItem(overrides = {}) {
  return {
    kind: "request_field",
    quote: "Require purpose",
    leaves: [{ role: "label", quote: "purpose", hint: null }],
    confidence: "high",
    ambiguity: "none",
    ...overrides,
  };
}

function fakeConfiguration(protocol, raw, { useResponsesParts = false } = {}) {
  const calls = [];
  let parseCalled = false;
  const client = {
    responses: {
      create: async (...args) => {
        calls.push(args);
        return useResponsesParts
          ? {
              output_parsed: { contractVersion: 1, items: [] },
              output: [{
                type: "message",
                content: [{ type: "output_text", text: raw }],
              }],
            }
          : {
              output_text: raw,
              output_parsed: { contractVersion: 1, items: [] },
            };
      },
      parse: async () => {
        parseCalled = true;
        throw new Error("The raw v3 path must not call responses.parse.");
      },
    },
    chat: {
      completions: {
        create: async (...args) => {
          calls.push(args);
          return { choices: [{ message: { content: raw } }] };
        },
      },
    },
  };
  return {
    configured: {
      client,
      model: "qualification-model",
      protocol,
      structuredOutput: "json_schema",
    },
    calls,
    parseWasCalled: () => parseCalled,
  };
}

async function request(configured) {
  return requestTemplateCopilotV3ProviderQuoteOutput({
    configured,
    schemaName: "template_copilot_v3_provider_quotes",
    developerText: "Quote exact source text.",
    userText: "Untrusted source slots.",
    requestOptions: {
      timeout: 1_000,
      maxRetries: 0,
      signal: new AbortController().signal,
    },
  });
}

test("Responses and Chat preserve a valid item beside a forged sibling", async () => {
  const raw = JSON.stringify({
    contractVersion: 1,
    items: [
      validItem(),
      { ...validItem(), providerCoordinate: { start: 0, end: 7 } },
    ],
  });

  for (const protocol of ["responses", "chat_completions"]) {
    const fake = fakeConfiguration(protocol, raw, {
      useResponsesParts: protocol === "responses",
    });
    const output = await request(fake.configured);
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots: sourceSlots(),
      output,
    });

    assert.equal(fake.calls.length, 1, protocol);
    assert.equal(fake.parseWasCalled(), false, protocol);
    assert.equal(located.accepted.length, 1, protocol);
    assert.equal(located.accepted[0].itemIndex, 0, protocol);
    assert.deepEqual(located.rejected, [{
      itemIndex: 1,
      code: "item_schema_invalid",
      detail: "item",
    }], protocol);

    const requestBody = fake.calls[0][0];
    if (protocol === "responses") {
      assert.equal(requestBody.text.format.type, "json_schema");
      assert.equal(requestBody.text.format.strict, true);
      assert.equal(requestBody.text.format.schema.additionalProperties, false);
    } else {
      assert.equal(requestBody.response_format.type, "json_schema");
      assert.equal(requestBody.response_format.json_schema.strict, true);
      assert.equal(
        requestBody.response_format.json_schema.schema.additionalProperties,
        false,
      );
    }
  }
});

test("raw transport decode leaves invalid envelopes for the strict locator", async () => {
  for (const [label, envelope] of [
    ["wrong version", { contractVersion: 2, items: [] }],
    ["extra envelope field", {
      contractVersion: 1,
      items: [],
      providerMessageId: "forged",
    }],
  ]) {
    for (const protocol of ["responses", "chat_completions"]) {
      const fake = fakeConfiguration(protocol, JSON.stringify(envelope));
      const output = await request(fake.configured);
      const located = locateTemplateCopilotV3ProviderQuotes({
        batchId: "structure",
        sourceSlots: sourceSlots(),
        output,
      });
      assert.deepEqual(located.accepted, [], `${label}:${protocol}`);
      assert.deepEqual(located.rejected, [{
        itemIndex: null,
        code: "provider_output_invalid",
        detail: "envelope",
      }], `${label}:${protocol}`);
    }
  }
});

test("raw transport rejects invalid JSON and missing provider content", async () => {
  assert.throws(
    () => decodeTemplateCopilotV3ProviderQuoteTransport("{not-json"),
    (error) =>
      error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
      error.reasonCode === "invalid_json",
  );

  for (const protocol of ["responses", "chat_completions"]) {
    const fake = fakeConfiguration(protocol, "");
    await assert.rejects(
      () => request(fake.configured),
      (error) =>
        error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
        error.reasonCode === "missing_content",
    );
  }
});

test("raw transport enforces byte, depth, and breadth limits before location", () => {
  const tooManyItems = {
    contractVersion: 1,
    items: Array.from({ length: 193 }, () => validItem()),
  };
  let tooDeep = "leaf";
  for (let index = 0; index < 10; index += 1) {
    tooDeep = { child: tooDeep };
  }
  const tooManyKeys = Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [`key${index}`, index]),
  );
  const tooManyBytes = {
    value: "a".repeat(
      templateCopilotV3ProviderQuoteTransportLimits.maximumUtf8Bytes,
    ),
  };

  for (const [label, value] of [
    ["items", tooManyItems],
    ["depth", tooDeep],
    ["object keys", tooManyKeys],
    ["UTF-8 bytes", tooManyBytes],
  ]) {
    assert.throws(
      () =>
        decodeTemplateCopilotV3ProviderQuoteTransport(
          JSON.stringify(value),
        ),
      (error) =>
        error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
        error.reasonCode === "transport_limit",
      label,
    );
  }
});
