import assert from "node:assert/strict";
import test from "node:test";
import {
  addWorkflowDocumentField,
  removeWorkflowDocumentField,
  updateWorkflowDocumentField,
} from "./workflow-document-field-state.ts";

const documents = [
  {
    id: "invoice",
    documentType: "Invoice",
    format: "pdf",
    required: true,
    fields: [
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        source: "ocr",
        instructions: "Extract amount.",
        documentId: "invoice",
      },
    ],
  },
  {
    id: "receipt",
    documentType: "Receipt",
    format: "image",
    required: false,
    fields: [],
  },
];

test("updates a document field without changing other documents", () => {
  const result = updateWorkflowDocumentField(documents, "invoice", 0, {
    label: "Invoice total",
    instructions: "Extract the grand total.",
    required: false,
  });

  assert.equal(result[0].fields[0].label, "Invoice total");
  assert.equal(result[0].fields[0].instructions, "Extract the grand total.");
  assert.equal(result[0].fields[0].required, false);
  assert.equal(result[1], documents[1]);
});

test("adds a new extraction field using the document format source", () => {
  const result = addWorkflowDocumentField(documents, "receipt");

  assert.deepEqual(result[1].fields[0], {
    name: "receipt-field-1",
    label: "New field",
    type: "text",
    required: false,
    source: "ai",
    instructions: "Describe what should be extracted from this document.",
    documentId: "receipt",
  });
});

test("removes the requested document field", () => {
  const result = removeWorkflowDocumentField(documents, "invoice", 0);

  assert.deepEqual(result[0].fields, []);
  assert.equal(result[1], documents[1]);
});
