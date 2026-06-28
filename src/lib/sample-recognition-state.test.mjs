import assert from "node:assert/strict";
import test from "node:test";
import { readRecognizedSampleField } from "./sample-recognition-state.ts";

const subcontractorField = {
  name: "subcontractor_name",
  label: "Subcontractor name",
  type: "text",
  required: true,
  source: "ai",
  instructions: "Extract the subcontractor name.",
};

test("reads recognized sample value from requested fields", () => {
  const result = readRecognizedSampleField(
    {
      fields: {
        "Subcontractor name": "Ming Kee Construction",
      },
      confidence: {},
      evidence: {
        "Subcontractor name": "Subcontractor: Ming Kee Construction",
      },
      notes: [],
      strategy: "pdf-ocr",
    },
    subcontractorField,
  );

  assert.deepEqual(result, {
    value: "Ming Kee Construction",
    evidence: "Subcontractor: Ming Kee Construction",
  });
});

test("falls back to a matching suggested field when requested fields are empty", () => {
  const result = readRecognizedSampleField(
    {
      fields: {},
      confidence: {},
      suggestedFields: [
        {
          name: "suggested_subcontractor",
          label: "Subcontractor",
          value: "Ming Kee Construction",
          confidence: "high",
          evidence: "Subcontractor Ming Kee Construction",
          instructions: "Extract the subcontractor name.",
        },
      ],
      notes: [],
      strategy: "pdf-ocr",
    },
    subcontractorField,
  );

  assert.deepEqual(result, {
    value: "Ming Kee Construction",
    evidence: "Subcontractor Ming Kee Construction",
  });
});
