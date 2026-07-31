import type OpenAI from "openai";
import { z } from "zod";
import {
  decodeTemplateCopilotV3ProviderQuoteTransport,
  templateCopilotV3ProviderQuoteOutputSchema,
  TemplateCopilotV3ProviderQuoteTransportError,
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
  openRouterProvider?: {
    require_parameters: true;
    zdr?: true;
  };
}>;

type ProviderRequestOptions = Readonly<{
  timeout: number;
  maxRetries: number;
  signal: AbortSignal;
}>;

/**
 * Uses the strict item schema only as provider-generation guidance. The raw
 * JSON transport is bounded and decoded without trusting SDK auto-parsing;
 * the locator owns strict per-item validation and sibling isolation.
 */
export async function requestTemplateCopilotV3ProviderQuoteOutput({
  configured,
  schemaName,
  developerText,
  userText,
  requestOptions,
}: Readonly<{
  configured: TemplateCopilotV3ProviderRequestConfiguration;
  schemaName: string;
  developerText: string;
  userText: string;
  requestOptions: ProviderRequestOptions;
}>): Promise<unknown> {
  const jsonSchema = z.toJSONSchema(
    templateCopilotV3ProviderQuoteOutputSchema,
    { target: "draft-07" },
  );
  if (configured.protocol === "responses") {
    const response = await configured.client.responses.create(
      {
        model: configured.model,
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
      requestOptions,
    );
    const content = templateCopilotV3ResponsesOutputText(response);
    if (!content) {
      throw new TemplateCopilotV3ProviderQuoteTransportError(
        "missing_content",
      );
    }
    return decodeTemplateCopilotV3ProviderQuoteTransport(content);
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
  const request = {
    model: configured.model,
    messages: [
      {
        role: "system",
        content: [
          developerText,
          "Return one JSON object only. Do not include Markdown or explanatory text.",
          `The JSON object must satisfy this ${schemaName} JSON Schema:`,
          JSON.stringify(jsonSchema),
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
    provider?: {
      require_parameters: true;
      zdr?: true;
    };
    reasoning?: {
      effort: "none" | "minimal" | "low" | "medium" | "high";
      exclude: true;
    };
  };
  const response = await configured.client.chat.completions.create(
    request,
    requestOptions,
  );
  const content = response.choices[0]?.message.content;
  if (!content) {
    throw new TemplateCopilotV3ProviderQuoteTransportError("missing_content");
  }
  return decodeTemplateCopilotV3ProviderQuoteTransport(content);
}

function templateCopilotV3ResponsesOutputText(response: {
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