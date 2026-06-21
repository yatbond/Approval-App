import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateCopyState } from "./workflow-template-copy-state.ts";

const targetTemplate = {
  id: "new-template",
  name: "New permit approval",
  business: "HyPath",
  department: "Administration",
  version: 1,
  isDraft: true,
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
      { id: "end", kind: "end", label: "End", x: 400, y: 0 },
    ],
    edges: [{ id: "start-end", sourceId: "start", targetId: "end", label: "Done", branchType: "main" }],
  },
};

const sourceTemplate = {
  id: "invoice-template",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  version: 3,
  isDraft: false,
  publishedAt: "2026-06-21T00:00:00.000Z",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-doc",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [
        {
          name: "invoice_total",
          label: "Invoice total",
          type: "number",
          required: true,
          source: "ocr",
          instructions: "Extract total.",
          documentId: "invoice-doc",
        },
      ],
    },
  ],
  languages: ["English", "Traditional Chinese"],
  fields: [
    {
      name: "invoice_total",
      label: "Invoice total",
      type: "number",
      required: true,
      source: "ocr",
      instructions: "Extract total.",
      documentId: "invoice-doc",
    },
  ],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "Finance review",
        x: 280,
        y: 0,
        documentIds: ["invoice-doc"],
      },
      { id: "end", kind: "end", label: "End", x: 560, y: 0 },
    ],
    edges: [
      { id: "start-review", sourceId: "start", targetId: "review-1", label: "Review", branchType: "main" },
      { id: "review-end", sourceId: "review-1", targetId: "end", label: "Done", branchType: "approved" },
    ],
  },
};

test("copies workflow structure into the current template while preserving its identity", () => {
  const result = getWorkflowTemplateCopyState({
    targetTemplate,
    sourceTemplate,
  });

  assert.equal(result.didCopy, true);
  assert.equal(result.template.id, "new-template");
  assert.equal(result.template.name, "New permit approval");
  assert.equal(result.template.business, "HyPath");
  assert.equal(result.template.department, "Administration");
  assert.equal(result.template.version, 1);
  assert.equal(result.template.isDraft, true);
  assert.equal(result.template.publishedAt, undefined);
  assert.deepEqual(result.template.graph, sourceTemplate.graph);
  assert.deepEqual(result.template.documents, sourceTemplate.documents);
  assert.deepEqual(result.template.fields, sourceTemplate.fields);
  assert.deepEqual(result.template.documentTypes, ["Invoice"]);
  assert.deepEqual(result.template.languages, ["English", "Traditional Chinese"]);
  assert.equal(result.workflowEditorTab, "canvas");
  assert.equal(result.shouldResetCanvasView, true);
  assert.equal(result.label, "Copied workflow from Invoice approval");
});

test("does not copy when source and target are the same template", () => {
  const result = getWorkflowTemplateCopyState({
    targetTemplate,
    sourceTemplate: targetTemplate,
  });

  assert.equal(result.didCopy, false);
  assert.equal(result.template, targetTemplate);
});
