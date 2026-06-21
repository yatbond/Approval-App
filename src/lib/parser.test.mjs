import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPdfFieldsWithOpenRouter,
} from "./parser.ts";

const fields = [
  {
    name: "amount",
    label: "Amount",
    type: "currency",
    required: true,
    source: "ai",
    instructions: "Extract the total amount.",
  },
];

test("extracts PDF fields through OpenRouter file input", async () => {
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  const previousFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = null;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "openai/gpt-4o-mini";
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ Amount: "HKD 8,400" }),
          },
        },
      ],
    });
  };

  try {
    const result = await extractPdfFieldsWithOpenRouter({
      pdfBase64: "JVBERi0xLjQ=",
      fileName: "invoice.pdf",
      fields,
      languageHint: "English",
    });

    assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(capturedBody.model, "openai/gpt-4o-mini");
    assert.deepEqual(capturedBody.plugins, [
      {
        id: "file-parser",
        pdf: { engine: "mistral-ocr" },
      },
    ]);
    assert.deepEqual(capturedBody.messages[0].content[1], {
      type: "file",
      file: {
        filename: "invoice.pdf",
        file_data: "data:application/pdf;base64,JVBERi0xLjQ=",
      },
    });
    assert.deepEqual(result.fields, { Amount: "HKD 8,400" });
    assert.equal(result.strategy, "pdf-ocr");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey;
    }
    if (previousModel === undefined) {
      delete process.env.OPENROUTER_MODEL;
    } else {
      process.env.OPENROUTER_MODEL = previousModel;
    }
    globalThis.fetch = previousFetch;
  }
});
