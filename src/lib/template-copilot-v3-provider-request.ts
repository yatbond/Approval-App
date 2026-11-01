import type OpenAI from "openai";
import type { TemplateCopilotOpenRouterProviderRouting } from "./template-copilot-openrouter-routing.ts";
import type { TemplateCopilotProviderResponseTelemetry } from "./template-copilot-provider-request-tracker.ts";
import {
  buildTemplateCopilotV3ProviderQuoteGuidanceJsonSchema,
  decodeTemplateCopilotV3ProviderQuoteTransport,
  expandTemplateCopilotV3ProviderQuoteWire,
  templateCopilotV3ProviderQuoteBatchGenerationLimits,
  TemplateCopilotV3ProviderQuoteTransportError,
  type TemplateCopilotV3ProviderQuoteBatchId,
} from "./template-copilot-v3-provider-quotes.ts";

export type TemplateCopilotV3ProviderRequestConfiguration = Readonly<{
  client: OpenAI;
  model: string;
  protocol: "responses" | "chat_completions";
  structuredOutput?: "json_object" | "json_schema";
  openRouterReasoning?: {
    effort: "none" | "minimal" | "low" | "medium" | "high";
    exclude: true;
  };
  openRouterProvider?: TemplateCopilotOpenRouterProviderRouting;
}>;

type ProviderRequestOptions = Readonly<{
  timeout: number;
  maxRetries: number;
  signal: AbortSignal;
}>;

export function templateCopilotV3OpenRouterChatCompletionTokenParameter(
  model: string,
): "max_tokens" | "max_completion_tokens" {
  return model === "openai/gpt-5.6-sol"
    ? "max_completion_tokens"
    : "max_tokens";
}

/**
 * Uses the strict item schema only as provider-generation guidance. The raw
 * JSON transport is bounded and decoded without trusting SDK auto-parsing;
 * the locator owns strict per-item validation and sibling isolation.
 */
export async function requestTemplateCopilotV3ProviderQuoteOutput({
  configured,
  batchId,
  schemaName,
  developerText,
  userText,
  requestOptions,
  observeProviderResponse,
}: Readonly<{
  configured: TemplateCopilotV3ProviderRequestConfiguration;
  batchId: TemplateCopilotV3ProviderQuoteBatchId;
  schemaName: string;
  developerText: string;
  userText: string;
  requestOptions: ProviderRequestOptions;
  observeProviderResponse?: (
    telemetry: TemplateCopilotProviderResponseTelemetry,
  ) => void;
}>): Promise<unknown> {
  const jsonSchema =
    buildTemplateCopilotV3ProviderQuoteGuidanceJsonSchema(batchId);
  const generationLimits =
    templateCopilotV3ProviderQuoteBatchGenerationLimits[batchId];
  const boundedRequestOptions = configured.openRouterProvider
    ? {
        ...requestOptions,
        headers: { "X-OpenRouter-Metadata": "enabled" },
      }
    : requestOptions;
  if (configured.protocol === "responses") {
    const providerStartedAt = Date.now();
    const response = await configured.client.responses.create(
      {
        model: configured.model,
        max_output_tokens: generationLimits.maximumCompletionTokens,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: developerText }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userText }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
      },
      boundedRequestOptions,
    );
    safelyObserveProviderResponse(
      observeProviderResponse,
      responseTelemetry({
        requestedModel: configured.model,
        response,
        finishState: response.status ?? "incomplete",
        providerLatencyMs: Date.now() - providerStartedAt,
        protocol: "responses",
      }),
    );
    if (response.status !== "completed") {
      throw new TemplateCopilotV3ProviderQuoteTransportError(
        "incomplete_output",
      );
    }
    const content = templateCopilotV3ResponsesOutputText(response);
    if (!content) {
      throw new TemplateCopilotV3ProviderQuoteTransportError(
        "missing_content",
      );
    }
    return expandTemplateCopilotV3ProviderQuoteWire({
      batchId,
      output: decodeTemplateCopilotV3ProviderQuoteTransport(content),
    });
  }

  const responseFormat =
    configured.structuredOutput === "json_schema"
      ? {
          type: "json_schema" as const,
          json_schema: {
            name: schemaName,
            strict: true,
            schema: jsonSchema,
          },
        }
      : { type: "json_object" as const };
  const chatCompletionTokenParameter = configured.openRouterProvider
    ? templateCopilotV3OpenRouterChatCompletionTokenParameter(configured.model)
    : "max_completion_tokens";
  const request = {
    model: configured.model,
    ...(chatCompletionTokenParameter === "max_tokens"
      ? { max_tokens: generationLimits.maximumCompletionTokens }
      : { max_completion_tokens: generationLimits.maximumCompletionTokens }),
    messages: [
      {
        role: "system",
        content: [
          developerText,
          "Return one JSON object only. Do not include Markdown or explanatory text.",
          ...(configured.structuredOutput === "json_schema"
            ? []
            : [
                `The JSON object must satisfy this ${schemaName} JSON Schema:`,
                JSON.stringify(jsonSchema),
              ]),
        ].join("\n\n"),
      },
      { role: "user", content: userText },
    ],
    response_format: responseFormat,
    ...(configured.openRouterProvider
      ? { provider: configured.openRouterProvider }
      : {}),
    ...(configured.openRouterReasoning
      ? { reasoning: configured.openRouterReasoning }
      : {}),
  } satisfies OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    provider?: TemplateCopilotOpenRouterProviderRouting;
    reasoning?: {
      effort: "none" | "minimal" | "low" | "medium" | "high";
      exclude: true;
    };
  };
  const providerStartedAt = Date.now();
  const response = await configured.client.chat.completions.create(
    request,
    boundedRequestOptions,
  );
  const choice = response.choices[0];
  safelyObserveProviderResponse(
    observeProviderResponse,
    responseTelemetry({
      requestedModel: configured.model,
      response,
      finishState: choice?.finish_reason ?? "incomplete",
      providerLatencyMs: Date.now() - providerStartedAt,
      protocol: "chat_completions",
    }),
  );
  if (choice?.finish_reason !== "stop") {
    throw new TemplateCopilotV3ProviderQuoteTransportError(
      "incomplete_output",
    );
  }
  const content = choice.message.content;
  if (!content) {
    throw new TemplateCopilotV3ProviderQuoteTransportError("missing_content");
  }
  return expandTemplateCopilotV3ProviderQuoteWire({
    batchId,
    output: decodeTemplateCopilotV3ProviderQuoteTransport(content),
  });
}

function safelyObserveProviderResponse(
  observer:
    | ((telemetry: TemplateCopilotProviderResponseTelemetry) => void)
    | undefined,
  telemetry: TemplateCopilotProviderResponseTelemetry,
) {
  try {
    observer?.(telemetry);
  } catch {
    // Observability must never change the governed provider outcome.
  }
}

function responseTelemetry({
  requestedModel,
  response,
  finishState,
  providerLatencyMs,
  protocol,
}: Readonly<{
  requestedModel: string;
  response: unknown;
  finishState: string;
  providerLatencyMs: number;
  protocol: "responses" | "chat_completions";
}>): TemplateCopilotProviderResponseTelemetry {
  const record = isRecord(response) ? response : {};
  const usage = isRecord(record.usage) ? record.usage : {};
  const metadata = isRecord(record.openrouter_metadata)
    ? record.openrouter_metadata
    : {};
  const endpoints = isRecord(metadata.endpoints) ? metadata.endpoints : {};
  const available = Array.isArray(endpoints.available)
    ? endpoints.available
    : [];
  const selectedEndpoint = available.find(
    (entry) => isRecord(entry) && entry.selected === true,
  );
  const returnedModel = safeTelemetryLabel(record.model, 160);
  const upstreamProvider = safeTelemetryLabel(
    isRecord(selectedEndpoint) ? selectedEndpoint.provider : record.provider,
    80,
  );
  return Object.freeze({
    requestedModel,
    returnedModel,
    upstreamProvider,
    finishState,
    inputTokens: safeTelemetryCount(
      protocol === "responses" ? usage.input_tokens : usage.prompt_tokens,
      10_000_000,
    ),
    outputTokens: safeTelemetryCount(
      protocol === "responses"
        ? usage.output_tokens
        : usage.completion_tokens,
      10_000_000,
    ),
    totalTokens: safeTelemetryCount(usage.total_tokens, 20_000_000),
    routerAttemptCount: safeTelemetryCount(metadata.attempt, 100),
    providerLatencyMs: Math.min(
      Math.max(Math.round(providerLatencyMs), 0),
      300_000,
    ),
  });
}

function safeTelemetryLabel(value: unknown, maximumLength: number) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9 ._:/-]+$/u.test(value)
    ? value
    : null;
}

function safeTelemetryCount(value: unknown, maximum: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function templateCopilotV3ResponsesOutputText(response: {
  status?: string;
  output_text?: string;
  output?: readonly unknown[];
}) {
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const rawItem of response.output ?? []) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as { type?: unknown; content?: unknown };
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const rawPart of item.content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as { type?: unknown; text?: unknown };
      if (part.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.join("");
}
