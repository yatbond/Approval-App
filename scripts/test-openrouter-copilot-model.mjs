import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");

const model =
  process.env.TEMPLATE_COPILOT_MODEL?.trim() || "qwen/qwen3.5-35b-a3b";
const requireZdr =
  process.env.TEMPLATE_COPILOT_OPENROUTER_ZDR?.trim().toLowerCase() === "true";
const reasoningEffort =
  process.env.TEMPLATE_COPILOT_OPENROUTER_REASONING_EFFORT?.trim() || "none";
const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://approval-app-template-copilot-preview.vercel.app",
    "X-OpenRouter-Title": "Approval App Copilot Model Qualification",
  },
});

const startedAt = performance.now();
const response = await client.chat.completions.create({
  model,
  messages: [
    {
      role: "system",
      content:
        "Return a strict JSON object confirming that structured output is available.",
    },
    {
      role: "user",
      content: "This is a synthetic model capability test. Return pass.",
    },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "copilot_model_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          result: { type: "string", enum: ["pass"] },
        },
        required: ["result"],
        additionalProperties: false,
      },
    },
  },
  provider: {
    require_parameters: true,
    ...(requireZdr ? { zdr: true } : {}),
  },
  reasoning: {
    effort: reasoningEffort,
    exclude: true,
  },
});
const elapsedMs = Math.round(performance.now() - startedAt);
const content = response.choices[0]?.message.content;
const parsed = content ? JSON.parse(content) : null;
if (parsed?.result !== "pass") {
  throw new Error("The model did not return the required strict schema.");
}

console.log("openrouter_copilot_model_smoke=PASS");
console.log(`model=${model}`);
console.log(`zdr_required=${requireZdr}`);
console.log(`reasoning_effort=${reasoningEffort}`);
console.log(`latency_ms=${elapsedMs}`);
console.log(`prompt_tokens=${response.usage?.prompt_tokens ?? "unknown"}`);
console.log(`completion_tokens=${response.usage?.completion_tokens ?? "unknown"}`);
