import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentNodeDocumentFieldIssues,
  getCurrentNodeUploadRequirements,
} from "./current-node-document-state.ts";

const document = {
  id: "invoice",
  documentType: "Invoice",
  format: "pdf",
  inputMode: "upload",
  required: true,
  fields: [
    { name: "invoice_total", label: "Invoice total", type: "currency", required: true, source: "ai", instructions: "Extract total." },
  ],
};
const template = {
  id: "template",
  documents: [document],
  fields: document.fields,
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "approval", kind: "approval", label: "Approval", x: 200, y: 0, documentIds: [document.id] },
    ],
    edges: [{ id: "start-approval", sourceId: "start", targetId: "approval", label: "Start", branchType: "main" }],
  },
};

test("current Approval upload requirements expose required missing extracted fields", () => {
  const task = { currentNodeId: "approval", extractedFields: {} };
  assert.deepEqual(getCurrentNodeUploadRequirements(task, template), [document]);
  assert.deepEqual(
    getCurrentNodeDocumentFieldIssues(task, template)[0].fields.map((field) => field.label),
    ["Invoice total"],
  );
  assert.deepEqual(
    getCurrentNodeDocumentFieldIssues(
      { currentNodeId: "approval", extractedFields: { "Invoice total": "1000" } },
      template,
    ),
    [],
  );
});
