import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExtractionPrompt,
  chooseParserStrategy,
  extractImageFields,
  extractImageFieldsWithOpenAI,
  extractImageFieldsWithOpenRouter,
  extractPdfFields,
  extractPdfFieldsWithQwenPageImages,
  extractPdfFieldsWithOpenRouter,
  normalizeUserCorrections,
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

test("detects spreadsheet and image parser strategies", () => {
  assert.equal(
    chooseParserStrategy(
      new File([""], "schedule.xlsx", {
        type: "application/octet-stream",
      }),
    ),
    "excel-table",
  );
  assert.equal(
    chooseParserStrategy(
      new File([""], "site-photo.png", {
        type: "image/png",
      }),
    ),
    "image-ai",
  );
});

test("keeps only changed user corrections", () => {
  assert.deepEqual(
    normalizeUserCorrections(
      { Amount: "HKD 8,400", Vendor: "Northstar" },
      { Amount: "HKD 8,400", Vendor: "Northstar Cloud Limited" },
    ),
    { Vendor: "Northstar Cloud Limited" },
  );
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

test("extracts image fields through OpenRouter image input", async () => {
  await withParserEnvironment(
    {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "openai/gpt-4o-mini",
    },
    async () => {
      let capturedBody = null;
      globalThis.fetch = async (_url, init) => {
        capturedBody = JSON.parse(String(init.body));
        return Response.json({
          choices: [
            {
              message: {
                content: [
                  "```json",
                  JSON.stringify({
                    fields: {
                      Amount: {
                        value: "HKD 8,400",
                        confidence: "high",
                        evidence: "Total HKD 8,400",
                      },
                      Vendor: {
                        value: "Northstar",
                        confidence: "high",
                      },
                      Blank: {
                        value: "",
                        confidence: "high",
                        evidence: "Blank field",
                      },
                      ignored: ["not", "a", "record"],
                    },
                    suggestedFields: [
                      {
                        label: "PO no.",
                        value: "PO-1",
                        confidence: "high",
                        evidence: "PO-1",
                        instructions: "Capture PO number.",
                      },
                      {
                        label: "空白",
                        value: "visible",
                        confidence: "unknown",
                      },
                      {
                        label: "No value",
                        value: "",
                      },
                    ],
                  }),
                  "```",
                ].join("\n"),
              },
            },
          ],
        });
      };

      const result = await extractImageFieldsWithOpenRouter({
        imageBase64: "image",
        mimeType: "image/png",
        fields,
        languageHint: "English",
      });

      assert.equal(capturedBody.model, "openai/gpt-4o-mini");
      assert.equal(
        capturedBody.messages[0].content[1].image_url.url,
        "data:image/png;base64,image",
      );
      assert.deepEqual(result.fields, {
        Amount: "HKD 8,400",
        Vendor: "Northstar",
        Blank: "",
      });
      assert.deepEqual(result.confidence, {
        Amount: "high",
        Vendor: "medium",
        Blank: "low",
      });
      assert.deepEqual(result.evidence, {
        Amount: "Total HKD 8,400",
        Blank: "Blank field",
      });
      assert.deepEqual(result.suggestedFields, [
        {
          name: "suggested_po_no",
          label: "PO no.",
          value: "PO-1",
          confidence: "high",
          evidence: "PO-1",
          instructions: "Capture PO number.",
        },
        {
          name: "suggested_field_2",
          label: "空白",
          value: "visible",
          confidence: "medium",
          evidence: "",
          instructions: "Extract 空白.",
        },
      ]);
    },
  );
});

test("routes image extraction to OpenRouter unless OpenAI provider is selected", async () => {
  await withParserEnvironment(
    {
      AI_PROVIDER: undefined,
      OPENROUTER_API_KEY: "test-key",
    },
    async () => {
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({ Amount: "HKD 8,400" }),
              },
            },
          ],
        });

      assert.deepEqual(
        (await extractImageFields({
          imageBase64: "image",
          mimeType: "image/png",
          fields,
          languageHint: "English",
        })).fields,
        { Amount: "HKD 8,400" },
      );
    },
  );
});

test("treats valid JSON arrays as unparseable extraction output", async () => {
  await withParserEnvironment({ OPENROUTER_API_KEY: "test-key" }, async () => {
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: "[]" } }] });

    assert.deepEqual(
      (await extractImageFieldsWithOpenRouter({
        imageBase64: "image",
        mimeType: "image/png",
        fields,
        languageHint: "English",
      })).notes,
      ["OpenRouter output could not be parsed as field JSON."],
    );
  });
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

test("returns provider setup notes when API keys are missing", async () => {
  await withParserEnvironment(
    {
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
    },
    async () => {
      assert.deepEqual(
        (await extractImageFields({
          imageBase64: "image",
          mimeType: "image/png",
          fields,
          languageHint: "English",
        })).notes,
        ["OPENAI_API_KEY is not configured yet."],
      );
      assert.deepEqual(
        (await extractImageFieldsWithOpenAI({
          imageBase64: "image",
          mimeType: "image/png",
          fields,
          languageHint: "English",
        })).notes,
        ["OPENAI_API_KEY is not configured yet."],
      );
      assert.deepEqual(
        (await extractImageFieldsWithOpenRouter({
          imageBase64: "image",
          mimeType: "image/png",
          fields,
          languageHint: "English",
        })).notes,
        ["OPENROUTER_API_KEY is not configured yet."],
      );
      assert.deepEqual(
        (await extractPdfFields({
          pdfBase64: "pdf",
          fileName: "invoice.pdf",
          fields,
          languageHint: "English",
        })).notes,
        ["OPENROUTER_API_KEY is not configured yet."],
      );
      assert.deepEqual(
        (await extractPdfFieldsWithQwenPageImages({
          pageImages: [],
          fields,
          languageHint: "English",
        })).notes,
        ["OPENROUTER_API_KEY is not configured yet."],
      );
    },
  );
});

test("extracts image fields through the OpenAI responses API", async () => {
  await withParserEnvironment(
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-test",
    },
    async () => {
      let capturedBody = null;
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        capturedBody = JSON.parse(String(init.body));
        return Response.json({
          id: "resp_1",
          object: "response",
          created_at: 1,
          status: "completed",
          model: "gpt-test",
          output: [
            {
              id: "msg_1",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    fields: {
                      Amount: {
                        value: "HKD 8,400",
                        confidence: "high",
                        evidence: "Total HKD 8,400",
                      },
                    },
                  }),
                  annotations: [],
                },
              ],
            },
          ],
        });
      };

      const result = await extractImageFieldsWithOpenAI({
        imageBase64: "image",
        mimeType: "image/png",
        fields,
        languageHint: "English",
      });

      assert.equal(capturedBody.model, "gpt-test");
      assert.equal(capturedBody.input[0].content[1].type, "input_image");
      assert.deepEqual(result.fields, { Amount: "HKD 8,400" });
      assert.deepEqual(result.confidence, { Amount: "high" });
      assert.deepEqual(result.evidence, { Amount: "Total HKD 8,400" });
      assert.deepEqual(result.notes, ["Parsed with OpenAI model gpt-test."]);
    },
  );
});

test("reports unparseable OpenAI image extraction output", async () => {
  await withParserEnvironment(
    {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-test",
    },
    async () => {
      globalThis.fetch = async () =>
        Response.json({
          id: "resp_1",
          object: "response",
          created_at: 1,
          status: "completed",
          model: "gpt-test",
          output: [
            {
              id: "msg_1",
              type: "message",
              status: "completed",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: "not json",
                  annotations: [],
                },
              ],
            },
          ],
        });

      assert.deepEqual(
        await extractImageFieldsWithOpenAI({
          imageBase64: "image",
          mimeType: "image/png",
          fields,
          languageHint: "English",
        }),
        {
          strategy: "image-ai",
          fields: {},
          confidence: {},
          evidence: {},
          suggestedFields: [],
          notes: ["AI output could not be parsed as field JSON."],
        },
      );
    },
  );
});

test("returns a Qwen setup note when no rendered PDF page images are supplied", async () => {
  await withParserEnvironment({ OPENROUTER_API_KEY: "test-key" }, async () => {
    const result = await extractPdfFieldsWithQwenPageImages({
      pageImages: [],
      fields,
      languageHint: "English",
    });

    assert.deepEqual(result.fields, {});
    assert.deepEqual(result.notes, [
      "No rendered PDF page images were supplied for Qwen visual OCR.",
    ]);
  });
});

test("reports OpenRouter errors and unparseable outputs", async () => {
  await withParserEnvironment({ OPENROUTER_API_KEY: "test-key" }, async () => {
    globalThis.fetch = async () =>
      Response.json({ error: { message: "quota exceeded" } }, { status: 429 });

    assert.deepEqual(
      (await extractImageFieldsWithOpenRouter({
        imageBase64: "image",
        mimeType: "image/png",
        fields,
        languageHint: "English",
      })).notes,
      ["quota exceeded"],
    );

    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: "not json" } }] });

    assert.deepEqual(
      await extractPdfFieldsWithOpenRouter({
        pdfBase64: "pdf",
        fileName: "",
        fields,
        languageHint: "English",
      }),
      {
        strategy: "pdf-ocr",
        fields: {},
        confidence: {},
        evidence: {},
        suggestedFields: [],
        notes: ["OpenRouter PDF output could not be parsed as field JSON."],
      },
    );

    assert.deepEqual(
      await extractPdfFieldsWithQwenPageImages({
        pageImages: [{ pageNumber: 1, mimeType: "image/png", imageBase64: "page" }],
        fields,
        languageHint: "English",
      }),
      {
        strategy: "pdf-ocr",
        fields: {},
        confidence: {},
        evidence: {},
        suggestedFields: [],
        notes: ["OpenRouter Qwen page-image output could not be parsed as field JSON."],
      },
    );
  });
});

test("reports default OpenRouter failure messages when response errors have no message", async () => {
  await withParserEnvironment({ OPENROUTER_API_KEY: "test-key" }, async () => {
    globalThis.fetch = async () => Response.json({}, { status: 500 });

    assert.deepEqual(
      (await extractPdfFieldsWithOpenRouter({
        pdfBase64: "pdf",
        fileName: "",
        fields,
        languageHint: "English",
      })).notes,
      ["OpenRouter request failed with status 500."],
    );
    assert.deepEqual(
      (await extractPdfFieldsWithQwenPageImages({
        pageImages: [{ pageNumber: 1, mimeType: "image/png", imageBase64: "page" }],
        fields,
        languageHint: "English",
      })).notes,
      ["OpenRouter request failed with status 500."],
    );
  });
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

test("includes typed PDF page text when extracting rendered page images", async () => {
  let capturedBody;

  await withParserEnvironment(
    {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_VISION_OCR_MODEL: "qwen/qwen3-vl-8b-instruct",
    },
    async () => {
      globalThis.fetch = async (_url, init) => {
        capturedBody = JSON.parse(init.body);
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
                  suggestedFields: [],
                }),
              },
            },
          ],
        });
      };

      await extractPdfFieldsWithQwenPageImages({
        pageImages: [
          {
            pageNumber: 1,
            mimeType: "image/png",
            imageBase64: "page-one",
            pageText: "Typed text: Subcontractor Ming Kee Construction",
          },
        ],
        fields,
        languageHint: "English",
      });
    },
  );

  assert.match(
    capturedBody.messages[0].content[0].text,
    /Typed text: Subcontractor Ming Kee Construction/,
  );
});

test("uses typed PDF page text without sending empty image URLs", async () => {
  let capturedContent;

  await withParserEnvironment(
    {
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_VISION_OCR_MODEL: "qwen/qwen3-vl-8b-instruct",
    },
    async () => {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        capturedContent = body.messages[0].content;
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
                  suggestedFields: [],
                }),
              },
            },
          ],
        });
      };

      await extractPdfFieldsWithQwenPageImages({
        pageImages: [
          {
            pageNumber: 1,
            mimeType: "text/plain",
            pageText: "Typed text: Total HKD 8,400",
          },
        ],
        fields,
        languageHint: "English",
      });
    },
  );

  assert.equal(capturedContent.length, 1);
  assert.equal(capturedContent[0].type, "text");
  assert.match(capturedContent[0].text, /Typed text: Total HKD 8,400/);
});

test("includes sample box anchors as soft extraction hints in the parser prompt", () => {
  const prompt = buildExtractionPrompt(fields, "English", [
    {
      id: "example-1",
      templateId: "template-1",
      documentId: "invoice-doc",
      documentType: "Invoice",
      fieldLabel: "Amount",
      originalValue: "",
      correctedValue: "HKD 8,000",
      evidence: "Boxed total amount on sample page",
      sourceFileName: "invoice.pdf",
      createdByEmail: "reviewer@example.com",
      createdAt: "2026-06-22T09:00:00.000Z",
      anchor: {
        pageNumber: 1,
        rect: { x: 0.58, y: 0.72, width: 0.24, height: 0.06 },
      },
    },
  ]);

  assert.match(prompt, /Soft anchor/);
  assert.match(prompt, /page 1/i);
  assert.match(prompt, /x 58%/);
  assert.match(prompt, /nearby region/i);
  assert.match(prompt, /rotated, shifted, scanned, or photocopied/i);
});

async function withParserEnvironment(env, callback) {
  const keys = [
    "AI_PROVIDER",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "OPENROUTER_PDF_ENGINE",
    "OPENROUTER_SITE_URL",
    "OPENROUTER_APP_TITLE",
    "OPENROUTER_VISION_OCR_MODEL",
  ];
  const previousEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await callback();
  } finally {
    for (const key of keys) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
    globalThis.fetch = previousFetch;
  }
}
