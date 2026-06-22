import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExtractionPrompt,
  chooseParserStrategy,
  extractPdfFieldsWithQwenPageImages,
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

test("detects a PDF by filename when upload MIME type is generic", () => {
  const file = new File(["pdf"], "invoice.PDF", {
    type: "application/octet-stream",
  });

  assert.equal(chooseParserStrategy(file), "pdf-ocr");
});

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

test("extracts PDF fields from rendered page images through OpenRouter Qwen", async () => {
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  const previousVisionModel = process.env.OPENROUTER_VISION_OCR_MODEL;
  const previousFetch = globalThis.fetch;
  let capturedBody = null;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_VISION_OCR_MODEL = "qwen/qwen3-vl-8b-instruct";
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              fields: {
                Amount: {
                  value: "HKD 8,400",
                  confidence: "high",
                  evidence: "Total HKD 8,400",
                },
              },
            }),
          },
        },
      ],
    });
  };

  try {
    const result = await extractPdfFieldsWithQwenPageImages({
      pageImages: [
        { pageNumber: 1, mimeType: "image/png", imageBase64: "page-one" },
        { pageNumber: 2, mimeType: "image/png", imageBase64: "page-two" },
      ],
      fields,
      languageHint: "English",
    });

    assert.equal(capturedBody.model, "qwen/qwen3-vl-8b-instruct");
    assert.equal(capturedBody.plugins, undefined);
    assert.equal(capturedBody.messages[0].content[0].type, "text");
    assert.deepEqual(
      capturedBody.messages[0].content.slice(1).map((part) => part.image_url.url),
      [
        "data:image/png;base64,page-one",
        "data:image/png;base64,page-two",
      ],
    );
    assert.deepEqual(result.fields, { Amount: "HKD 8,400" });
    assert.deepEqual(result.confidence, { Amount: "high" });
    assert.deepEqual(result.evidence, { Amount: "Total HKD 8,400" });
    assert.equal(result.strategy, "pdf-ocr");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey;
    }
    if (previousVisionModel === undefined) {
      delete process.env.OPENROUTER_VISION_OCR_MODEL;
    } else {
      process.env.OPENROUTER_VISION_OCR_MODEL = previousVisionModel;
    }
    globalThis.fetch = previousFetch;
  }
});

test("keeps suggested fields separate from requested extracted fields", async () => {
  const previousApiKey = process.env.OPENROUTER_API_KEY;
  const previousVisionModel = process.env.OPENROUTER_VISION_OCR_MODEL;
  const previousFetch = globalThis.fetch;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_VISION_OCR_MODEL = "qwen/qwen3-vl-8b-instruct";
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              fields: {
                Amount: {
                  value: "HKD 8,400",
                  confidence: "high",
                  evidence: "Total HKD 8,400",
                },
              },
              suggestedFields: [
                {
                  label: "Vendor",
                  value: "Northstar Cloud Limited",
                  confidence: "high",
                  evidence: "Vendor Northstar Cloud Limited",
                },
              ],
            }),
          },
        },
      ],
    });

  try {
    const result = await extractPdfFieldsWithQwenPageImages({
      pageImages: [{ pageNumber: 1, mimeType: "image/png", imageBase64: "page-one" }],
      fields,
      languageHint: "English",
    });

    assert.deepEqual(result.fields, { Amount: "HKD 8,400" });
    assert.deepEqual(result.suggestedFields, [
      {
        name: "suggested_vendor",
        label: "Vendor",
        value: "Northstar Cloud Limited",
        confidence: "high",
        evidence: "Vendor Northstar Cloud Limited",
        instructions: "Extract Vendor.",
      },
    ]);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousApiKey;
    }
    if (previousVisionModel === undefined) {
      delete process.env.OPENROUTER_VISION_OCR_MODEL;
    } else {
      process.env.OPENROUTER_VISION_OCR_MODEL = previousVisionModel;
    }
    globalThis.fetch = previousFetch;
  }
});

test("includes corrected extraction examples in the parser prompt", () => {
  const prompt = buildExtractionPrompt(fields, "English", [
    {
      id: "example-1",
      templateId: "template-1",
      documentId: "invoice-doc",
      documentType: "Invoice",
      fieldLabel: "Amount",
      originalValue: "HKD 800",
      correctedValue: "HKD 8,000",
      evidence: "Total HKD 8,000",
      sourceFileName: "invoice.pdf",
      createdByEmail: "reviewer@example.com",
      createdAt: "2026-06-22T09:00:00.000Z",
    },
  ]);

  assert.match(prompt, /Prior corrected examples/);
  assert.match(prompt, /Amount/);
  assert.match(prompt, /HKD 8,000/);
  assert.match(prompt, /Total HKD 8,000/);
});
