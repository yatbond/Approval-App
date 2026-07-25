import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const apiKey =
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
if (!apiKey) {
  console.error("AI Gateway credential is unavailable.");
  process.exit(2);
}

const output = z
  .object({
    targetSection: z.literal("attachments"),
    answerStatus: z.literal("answered"),
    conciseSummary: z.string().min(1).max(500),
    acknowledgement: z.string().min(1).max(200),
  })
  .strict();

const client = new OpenAI({
  apiKey,
  baseURL: "https://ai-gateway.vercel.sh/v1",
});
const response = await client.responses.parse({
  model: process.env.TEMPLATE_COPILOT_MODEL || "openai/gpt-5.4",
  input: [
    {
      role: "developer",
      content:
        "Extract the explicit attachment requirement. Do not invent missing facts.",
    },
    {
      role: "user",
      content:
        "Invoices are required as PDF, exactly one file, maximum 10 MB.",
    },
  ],
  text: {
    format: zodTextFormat(output, "template_copilot_gateway_smoke"),
  },
});

if (!response.output_parsed) {
  console.error("AI Gateway returned no parsed structured output.");
  process.exit(1);
}
console.log(
  JSON.stringify({
    ok: true,
    model: process.env.TEMPLATE_COPILOT_MODEL || "openai/gpt-5.4",
    targetSection: response.output_parsed.targetSection,
    answerStatus: response.output_parsed.answerStatus,
  }),
);
