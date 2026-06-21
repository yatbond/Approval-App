import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowAddBoxDocumentState } from "./workflow-box-document-state.ts";

const template = {
  id: "template-1",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
      { id: "review-1", label: "Review 1", kind: "review", x: 200, y: 0, blocking: true },
    ],
    edges: [],
  },
};

test("adds a document requirement to the selected workflow box", () => {
  const result = getWorkflowAddBoxDocumentState({
    template,
    selectedNodeId: "review-1",
    selectedNodeLabel: "Review 1",
    documentType: "Doctor Slip",
    format: "image",
    required: true,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Added document to Review 1");
  assert.deepEqual(result.resetForm, {
    documentType: "Supporting document",
    format: "pdf",
    required: true,
  });

  const document = result.template.documents[0];
  assert.equal(document.documentType, "Doctor Slip");
  assert.equal(document.format, "image");
  assert.equal(document.required, true);
  assert.deepEqual(document.fields[0], {
    name: "doctor_slip_field",
    label: "New field",
    type: "text",
    required: false,
    source: "ai",
    instructions: "Describe what should be extracted from this document.",
    documentId: document.id,
  });
  assert.ok(
    result.template.graph?.nodes
      .find((node) => node.id === "review-1")
      ?.documentIds?.includes(document.id),
  );
});

test("does not update without a selected node or document type", () => {
  assert.equal(
    getWorkflowAddBoxDocumentState({
      template,
      selectedNodeId: null,
      selectedNodeLabel: "",
      documentType: "Invoice",
      format: "pdf",
      required: true,
    }).didUpdate,
    false,
  );
  assert.equal(
    getWorkflowAddBoxDocumentState({
      template,
      selectedNodeId: "review-1",
      selectedNodeLabel: "Review 1",
      documentType: "   ",
      format: "pdf",
      required: true,
    }).didUpdate,
    false,
  );
});

test("allows an empty selected node label when a selected node exists", () => {
  const result = getWorkflowAddBoxDocumentState({
    template,
    selectedNodeId: "review-1",
    selectedNodeLabel: "",
    documentType: "Invoice",
    format: "pdf",
    required: true,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Added document to ");
});
