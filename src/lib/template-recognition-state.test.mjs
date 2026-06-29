import assert from "node:assert/strict";
import test from "node:test";
import {
  appendExtractionExamplesToTemplate,
  buildExtractionTrainingExamples,
  createWorkflowFieldFromRecognition,
} from "./template-recognition-state.ts";

const template = {
  id: "template-1",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-doc",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [],
  steps: [],
};

test("creates a template workflow field from recognized document text", () => {
  const field = createWorkflowFieldFromRecognition({
    documentId: "invoice-doc",
    label: " Invoice Total ",
    instructions: "Use the grand total including tax.",
  });

  assert.deepEqual(field, {
    name: "invoice_total",
    label: "Invoice Total",
    type: "text",
    required: true,
    source: "ai",
    instructions: "Use the grand total including tax.",
    documentId: "invoice-doc",
  });
});

test("uses a stable fallback instruction when adding a recognized field", () => {
  const field = createWorkflowFieldFromRecognition({
    documentId: "invoice-doc",
    label: "Vendor",
  });

  assert.equal(field.instructions, "Extract Vendor from this document.");
});

test("builds extraction training examples only for corrected values", () => {
  const examples = buildExtractionTrainingExamples({
    template,
    documentId: "invoice-doc",
    parseFields: {
      Amount: "HKD 800",
      Vendor: "Northstar Cloud Limited",
    },
    correctedFields: {
      Amount: "HKD 8,000",
      Vendor: "Northstar Cloud Limited",
      "Invoice date": "2026-06-22",
    },
    evidence: {
      Amount: "Total HKD 8,000",
    },
    sourceFileName: "invoice.pdf",
    actorEmail: "reviewer@example.com",
    now: new Date("2026-06-22T09:00:00.000Z"),
  });

  assert.equal(examples.length, 2);
  assert.equal(examples[0].fieldLabel, "Amount");
  assert.equal(examples[0].originalValue, "HKD 800");
  assert.equal(examples[0].correctedValue, "HKD 8,000");
  assert.equal(examples[0].evidence, "Total HKD 8,000");
  assert.equal(examples[1].fieldLabel, "Invoice date");
  assert.equal(examples[1].originalValue, "");
  assert.equal(examples[1].correctedValue, "2026-06-22");
});

test("appends extraction examples to a template with newest entries first", () => {
  const updated = appendExtractionExamplesToTemplate({
    template: {
      ...template,
      extractionExamples: [
        {
          id: "old",
          templateId: "template-1",
          documentId: "invoice-doc",
          documentType: "Invoice",
          fieldLabel: "Amount",
          originalValue: "HKD 700",
          correctedValue: "HKD 7,000",
          evidence: "",
          sourceFileName: "old.pdf",
          createdByEmail: "reviewer@example.com",
          createdAt: "2026-06-21T09:00:00.000Z",
        },
      ],
    },
    examples: [
      {
        id: "new",
        templateId: "template-1",
        documentId: "invoice-doc",
        documentType: "Invoice",
        fieldLabel: "Amount",
        originalValue: "HKD 800",
        correctedValue: "HKD 8,000",
        evidence: "",
        sourceFileName: "invoice.pdf",
        createdByEmail: "reviewer@example.com",
        createdAt: "2026-06-22T09:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(
    updated.extractionExamples.map((example) => example.id),
    ["new", "old"],
  );
});
