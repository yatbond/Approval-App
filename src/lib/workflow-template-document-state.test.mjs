import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateDocumentState } from "./workflow-template-document-state.ts";

const template = {
  id: "template-1",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
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
  ],
  languages: ["English"],
  fields: [],
  steps: [],
};

test("rebuilds documentTypes and flattened fields from updated documents", () => {
  const result = getWorkflowTemplateDocumentState({
    template,
    documents: [
      ...template.documents,
      {
        id: "receipt",
        documentType: "Receipt",
        format: "image",
        required: false,
        fields: [
          {
            name: "merchant",
            label: "Merchant",
            type: "text",
            required: false,
            source: "ai",
            instructions: "Extract merchant.",
            documentId: "receipt",
          },
        ],
      },
    ],
  });

  assert.deepEqual(result.template.documentTypes, ["Invoice", "Receipt"]);
  assert.equal(result.template.documents.length, 2);
  assert.deepEqual(
    result.template.fields.map((field) => field.name),
    ["amount", "merchant"],
  );
  assert.equal(result.label, "Updated document requirements");
});

test("preserves other template properties", () => {
  const result = getWorkflowTemplateDocumentState({
    template,
    documents: [],
  });

  assert.equal(result.template.id, template.id);
  assert.equal(result.template.name, template.name);
  assert.deepEqual(result.template.languages, template.languages);
  assert.deepEqual(result.template.documentTypes, []);
  assert.deepEqual(result.template.fields, []);
});
