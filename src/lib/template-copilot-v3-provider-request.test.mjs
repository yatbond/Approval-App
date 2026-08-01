import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeTemplateCopilotV3ProviderQuoteTransport,
  expandTemplateCopilotV3ProviderQuoteWire,
  locateTemplateCopilotV3ProviderQuotes,
  templateCopilotV3ProviderQuoteBatchGenerationLimits,
  templateCopilotV3ProviderQuoteBatches,
  templateCopilotV3ProviderQuoteTransportLimits,
  TemplateCopilotV3ProviderQuoteTransportError,
} from "./template-copilot-v3-provider-quotes.ts";
import {
  requestTemplateCopilotV3ProviderQuoteOutput,
} from "./template-copilot-v3-provider-request.ts";

function sourceSlots(initiatorText = "Require purpose.") {
  return templateCopilotV3ProviderQuoteBatches.structure.slots.map((slot) => ({
    slot,
    messageId: `message:request-test:${slot}`,
    text:
      slot === "initiators_fields"
        ? initiatorText
        : `No ${slot} requirements supplied.`,
  }));
}

function validWireItem(overrides = {}) {
  return {
    k: "request_field",
    q: "Require purpose",
    l: [{ r: "label", q: "purpose", h: null }],
    a: 0,
    ...overrides,
  };
}

function fakeConfiguration(
  protocol,
  raw,
  {
    useResponsesParts = false,
    structuredOutput = "json_schema",
    responseStatus = "completed",
    chatFinishReason = "stop",
    openRouterProvider = { require_parameters: true, zdr: true },
    openRouterReasoning,
    model = "qualification-model",
  } = {},
) {
  const calls = [];
  let parseCalled = false;
  const client = {
    responses: {
      create: async (...args) => {
        calls.push(args);
        return useResponsesParts
          ? {
              status: responseStatus,
              model: "qualification-model",
              usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
              openrouter_metadata: routerMetadata(),
              output_parsed: { v: 1, i: [] },
              output: [{
                type: "message",
                content: [{ type: "output_text", text: raw }],
              }],
            }
          : {
              status: responseStatus,
              model: "qualification-model",
              usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
              openrouter_metadata: routerMetadata(),
              output_text: raw,
              output_parsed: { v: 1, i: [] },
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
          return {
            model: "qualification-model",
            provider: "Fallback Provider Must Not Win",
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
            openrouter_metadata: routerMetadata(),
            choices: [{
              finish_reason: chatFinishReason,
              message: { content: raw },
            }],
          };
        },
      },
    },
  };
  return {
    configured: {
      client,
      model,
      protocol,
      structuredOutput,
      openRouterProvider,
      ...(openRouterReasoning ? { openRouterReasoning } : {}),
    },
    calls,
    parseWasCalled: () => parseCalled,
  };
}

function routerMetadata() {
  return {
    attempt: 1,
    endpoints: {
      available: [
        { provider: "Not Selected", selected: false },
        { provider: "CoreWeave", selected: true },
      ],
    },
  };
}

async function request(
  configured,
  batchId = "structure",
  observeProviderResponse,
) {
  return requestTemplateCopilotV3ProviderQuoteOutput({
    configured,
    batchId,
    schemaName: "template_copilot_v3_provider_quotes",
    developerText: "Quote exact source text.",
    userText: "Untrusted source slots.",
    requestOptions: {
      timeout: 1_000,
      maxRetries: 0,
      signal: new AbortController().signal,
    },
    observeProviderResponse,
  });
}

test("Responses and Chat preserve a valid item beside a forged sibling", async () => {
  const raw = JSON.stringify({
    v: 1,
    i: [
      validWireItem(),
      { ...validWireItem(), providerCoordinate: { start: 0, end: 7 } },
    ],
  });

  for (const protocol of ["responses", "chat_completions"]) {
    const fake = fakeConfiguration(protocol, raw, {
      useResponsesParts: protocol === "responses",
    });
    const telemetry = [];
    const output = await request(
      fake.configured,
      "structure",
      (value) => telemetry.push(value),
    );
    const located = locateTemplateCopilotV3ProviderQuotes({
      batchId: "structure",
      sourceSlots: sourceSlots(),
      output,
    });

    assert.equal(fake.calls.length, 1, protocol);
    assert.deepEqual(fake.calls[0][1].headers, {
      "X-OpenRouter-Metadata": "enabled",
    }, protocol);
    assert.equal(telemetry.length, 1, protocol);
    assert.deepEqual(telemetry[0], {
      requestedModel: "qualification-model",
      returnedModel: "qualification-model",
      upstreamProvider: "CoreWeave",
      finishState: protocol === "responses" ? "completed" : "stop",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      routerAttemptCount: 1,
      providerLatencyMs: telemetry[0].providerLatencyMs,
    }, protocol);
    assert.ok(telemetry[0].providerLatencyMs >= 0, protocol);
    assert.equal(fake.parseWasCalled(), false, protocol);
    assert.equal(located.accepted.length, 1, protocol);
    assert.equal(located.accepted[0].itemIndex, 0, protocol);
    assert.equal(located.accepted[0].confidence, "high", protocol);
    assert.equal(located.accepted[0].ambiguity, "none", protocol);
    assert.deepEqual(located.rejected, [{
      itemIndex: 1,
      code: "item_schema_invalid",
      detail: "item",
    }], protocol);

    const requestBody = fake.calls[0][0];
    const guidanceSchema = protocol === "responses"
      ? requestBody.text.format.schema
      : requestBody.response_format.json_schema.schema;
    assert.deepEqual(
      guidanceSchema.properties.i.items.properties.k.enum,
      [...templateCopilotV3ProviderQuoteBatches.structure.allowedKinds],
      protocol,
    );
    assert.equal(
      requestBody[protocol === "responses" ? "max_output_tokens" : "max_tokens"],
      templateCopilotV3ProviderQuoteBatchGenerationLimits.structure
        .maximumCompletionTokens,
      protocol,
    );
    if (protocol === "chat_completions") {
      assert.equal(requestBody.max_completion_tokens, undefined, protocol);
    }
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

test("Chat forwards the qualification-only OpenRouter routing profile exactly", async () => {
  const provider = {
    require_parameters: true,
    zdr: true,
    sort: "throughput",
    ignore: ["akashml"],
    allow_fallbacks: false,
  };
  const fake = fakeConfiguration(
    "chat_completions",
    JSON.stringify({ v: 1, i: [validWireItem()] }),
    { openRouterProvider: provider },
  );

  await request(fake.configured);

  assert.deepEqual(fake.calls[0][0].provider, provider);
  assert.equal(fake.calls.length, 1);
});

test("OpenRouter uses the exact-model GPT-5.6 Sol completion token parameter", async () => {
  const maximumCompletionTokens =
    templateCopilotV3ProviderQuoteBatchGenerationLimits.policy_context
      .maximumCompletionTokens;
  const provider = {
    require_parameters: true,
    zdr: true,
    sort: "throughput",
    ignore: ["akashml"],
    allow_fallbacks: false,
  };
  const reasoning = { effort: "none", exclude: true };
  for (const [model, expectedParameter] of [
    ["openai/gpt-5.6-sol", "max_completion_tokens"],
    ["qwen/qwen3.5-35b-a3b", "max_tokens"],
    ["openai/gpt-5.6-sol-pro", "max_tokens"],
  ]) {
    const fake = fakeConfiguration(
      "chat_completions",
      JSON.stringify({ v: 1, i: [] }),
      {
        model,
        openRouterProvider: provider,
        openRouterReasoning: reasoning,
      },
    );
    await request(fake.configured, "policy_context");
    const requestBody = fake.calls[0][0];
    assert.equal(requestBody[expectedParameter], maximumCompletionTokens, model);
    assert.equal(
      requestBody[
        expectedParameter === "max_tokens"
          ? "max_completion_tokens"
          : "max_tokens"
      ],
      undefined,
      model,
    );
    assert.equal(requestBody.response_format.type, "json_schema", model);
    assert.deepEqual(requestBody.provider, provider, model);
    assert.deepEqual(requestBody.reasoning, reasoning, model);
  }
});

test("compact expansion preserves quote bytes and applies conservative advisory values", () => {
  const exact = "需求 😀 Cafe\u0301\r\npurpose";
  const output = expandTemplateCopilotV3ProviderQuoteWire({
    batchId: "structure",
    output: {
      v: 1,
      i: [
        validWireItem({
          q: exact,
          l: [{ r: "label", q: exact, h: null }],
          a: 1,
        }),
        validWireItem({
          q: exact,
          l: [{ r: "label", q: exact, h: null }],
          a: 2,
        }),
        { ...validWireItem(), a: undefined },
        { ...validWireItem(), confidence: "high" },
      ],
    },
  });

  assert.equal(output.contractVersion, 1);
  assert.equal(output.items.length, 4);
  assert.equal(output.items[0].quote, exact);
  assert.equal(output.items[0].leaves[0].quote, exact);
  assert.equal(output.items[0].confidence, "low");
  assert.equal(output.items[0].ambiguity, "possible");
  assert.equal(output.items[1].confidence, "low");
  assert.equal(output.items[1].ambiguity, "ambiguous");
  assert.deepEqual(output.items[2], {});
  assert.deepEqual(output.items[3], {});

  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: sourceSlots(`${exact}.`),
    output,
  });
  assert.equal(located.accepted.length, 2);
  assert.deepEqual(located.accepted.map((entry) => entry.itemIndex), [0, 1]);
  assert.deepEqual(located.rejected.map((entry) => entry.itemIndex), [2, 3]);
});

test("compact expansion enforces batch item and leaf caps without shifting siblings", () => {
  const structureLimits =
    templateCopilotV3ProviderQuoteBatchGenerationLimits.structure;
  const overItemCap = expandTemplateCopilotV3ProviderQuoteWire({
    batchId: "structure",
    output: {
      v: 1,
      i: Array.from(
        { length: structureLimits.maximumItems + 1 },
        () => validWireItem(),
      ),
    },
  });
  assert.deepEqual(overItemCap, {});

  const overLeafCap = expandTemplateCopilotV3ProviderQuoteWire({
    batchId: "structure",
    output: {
      v: 1,
      i: [
        validWireItem({
          l: Array.from(
            { length: structureLimits.maximumLeavesPerItem + 1 },
            () => ({ r: "label", q: "purpose", h: null }),
          ),
        }),
        validWireItem(),
      ],
    },
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: sourceSlots(),
    output: overLeafCap,
  });
  assert.deepEqual(located.accepted.map((entry) => entry.itemIndex), [1]);
  assert.deepEqual(located.rejected, [{
    itemIndex: 0,
    code: "item_schema_invalid",
    detail: "item",
  }]);
});

test("compact expansion rejects exact item or leaf saturation as incomplete", () => {
  const limits = templateCopilotV3ProviderQuoteBatchGenerationLimits.structure;
  for (const [label, output] of [
    [
      "items",
      {
        v: 1,
        i: Array.from({ length: limits.maximumItems }, () => validWireItem()),
      },
    ],
    [
      "leaves",
      {
        v: 1,
        i: [
          validWireItem({
            l: Array.from(
              { length: limits.maximumLeavesPerItem },
              () => ({ r: "label", q: "purpose", h: null }),
            ),
          }),
        ],
      },
    ],
  ]) {
    assert.throws(
      () =>
        expandTemplateCopilotV3ProviderQuoteWire({
          batchId: "structure",
          output,
        }),
      (error) =>
        error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
        error.reasonCode === "output_capacity_exhausted",
      label,
    );
  }
});

test("compact generation vocabulary does not replace locator policy authority", () => {
  const output = expandTemplateCopilotV3ProviderQuoteWire({
    batchId: "structure",
    output: {
      v: 1,
      i: [
        {
          k: "workflow_name",
          q: "Require purpose",
          l: [{ r: "description", q: "purpose", h: null }],
          a: 0,
        },
        validWireItem({
          l: [{ r: "label", q: "purpose", h: "true" }],
        }),
        validWireItem(),
      ],
    },
  });
  const located = locateTemplateCopilotV3ProviderQuotes({
    batchId: "structure",
    sourceSlots: sourceSlots(),
    output,
  });
  assert.deepEqual(located.accepted.map((entry) => entry.itemIndex), [2]);
  assert.deepEqual(located.rejected, [
    {
      itemIndex: 0,
      code: "kind_not_allowed",
      detail: "workflow_name",
    },
    {
      itemIndex: 1,
      code: "hint_not_allowed",
      detail: "request_field:label",
    },
  ]);
});

test("Chat does not duplicate JSON Schema text when response_format carries it", async () => {
  const raw = JSON.stringify({ v: 1, i: [] });
  const strict = fakeConfiguration("chat_completions", raw);
  await request(strict.configured, "policy_context");
  const strictBody = strict.calls[0][0];
  assert.equal(strictBody.response_format.type, "json_schema");
  assert.doesNotMatch(
    strictBody.messages[0].content,
    /must satisfy this .* JSON Schema|additionalProperties/u,
  );

  const fallback = fakeConfiguration("chat_completions", raw, {
    structuredOutput: "json_object",
  });
  await request(fallback.configured, "policy_context");
  const fallbackBody = fallback.calls[0][0];
  assert.equal(fallbackBody.response_format.type, "json_object");
  assert.match(
    fallbackBody.messages[0].content,
    /must satisfy this template_copilot_v3_provider_quotes JSON Schema/u,
  );
  assert.match(fallbackBody.messages[0].content, /additionalProperties/u);
});

test("raw transport decode leaves invalid envelopes for the strict locator", async () => {
  for (const [label, envelope] of [
    ["wrong version", { v: 2, i: [] }],
    ["canonical-envelope bypass", {
      contractVersion: 1,
      items: [{
        kind: "request_field",
        quote: "Require purpose",
        leaves: [{ role: "label", quote: "purpose", hint: null }],
        confidence: "high",
        ambiguity: "none",
      }],
    }],
    ["extra envelope field", {
      v: 1,
      i: [],
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

test("provider requests reject every non-complete finish state", async () => {
  const raw = JSON.stringify({ v: 1, i: [] });
  const incompleteResponses = fakeConfiguration("responses", raw, {
    responseStatus: "incomplete",
  });
  await assert.rejects(
    () => request(incompleteResponses.configured),
    (error) =>
      error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
      error.reasonCode === "incomplete_output",
  );

  for (const finishReason of ["length", "content_filter", null]) {
    const incompleteChat = fakeConfiguration("chat_completions", raw, {
      chatFinishReason: finishReason,
    });
    await assert.rejects(
      () => request(incompleteChat.configured),
      (error) =>
        error instanceof TemplateCopilotV3ProviderQuoteTransportError &&
        error.reasonCode === "incomplete_output",
      String(finishReason),
    );
  }
});

test("raw transport enforces byte, depth, and breadth limits before location", () => {
  const tooManyItems = {
    v: 1,
    i: Array.from({ length: 193 }, () => validWireItem()),
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
