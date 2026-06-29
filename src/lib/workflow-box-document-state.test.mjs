import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowAddBoxDocumentState,
  getWorkflowRemoveBoxDocumentState,
} from "./workflow-box-document-state.ts";

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
    inputMode: "upload",
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

test("adds a document requirement to a submit request box", () => {
  const result = getWorkflowAddBoxDocumentState({
    template: {
      ...template,
      graph: {
        nodes: [
          { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
          {
            id: "submit-1",
            label: "Submit request",
            kind: "submit_request",
            x: 180,
            y: 0,
            blocking: true,
          },
        ],
        edges: [],
      },
    },
    selectedNodeId: "submit-1",
    selectedNodeLabel: "Submit request",
    documentType: "Invoice",
    format: "pdf",
    required: true,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Added document to Submit request");
  assert.ok(
    result.template.graph?.nodes
      .find((node) => node.id === "submit-1")
      ?.documentIds?.includes(result.template.documents[0].id),
  );
});

test("adds a manual form requirement to a submit request box", () => {
  const result = getWorkflowAddBoxDocumentState({
    template,
    selectedNodeId: "review-1",
    selectedNodeLabel: "Review 1",
    documentType: "Leave request form",
    format: "text",
    inputMode: "manual_form",
    required: true,
  });

  assert.equal(result.didUpdate, true);
  assert.deepEqual(result.resetForm, {
    documentType: "Supporting document",
    format: "pdf",
    inputMode: "upload",
    required: true,
  });

  const document = result.template.documents[0];
  assert.equal(document.inputMode, "manual_form");
  assert.equal(document.format, "text");
  assert.equal(document.fields[0].source, "manual");
  assert.equal(
    document.fields[0].instructions,
    "Describe what the requester should enter for this form field.",
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

test("removes an unused document requirement from the template and handoff selections", () => {
  const result = getWorkflowRemoveBoxDocumentState({
    template: {
      ...template,
      documentTypes: ["Payment Cert", "Invoice"],
      documents: [
        {
          id: "payment-cert",
          documentType: "Payment Cert",
          format: "pdf",
          required: true,
          fields: [
            {
              name: "payment_amount",
              label: "Payment amount",
              type: "currency",
              required: true,
              source: "ocr",
              instructions: "Extract payment amount.",
              documentId: "payment-cert",
            },
          ],
        },
        {
          id: "invoice",
          documentType: "Invoice",
          format: "pdf",
          required: true,
          fields: [
            {
              name: "invoice_total",
              label: "Invoice total",
              type: "currency",
              required: true,
              source: "ocr",
              instructions: "Extract invoice total.",
              documentId: "invoice",
            },
          ],
        },
      ],
      fields: [
        {
          name: "payment_amount",
          label: "Payment amount",
          type: "currency",
          required: true,
          source: "ocr",
          instructions: "Extract payment amount.",
          documentId: "payment-cert",
        },
        {
          name: "invoice_total",
          label: "Invoice total",
          type: "currency",
          required: true,
          source: "ocr",
          instructions: "Extract invoice total.",
          documentId: "invoice",
        },
      ],
      graph: {
        nodes: [
          { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
          {
            id: "submit-1",
            label: "QS",
            kind: "submit_request",
            x: 180,
            y: 0,
            blocking: true,
            documentIds: ["payment-cert"],
          },
          {
            id: "approval-1",
            label: "QS Manager",
            kind: "approval",
            x: 360,
            y: 0,
            blocking: true,
            documentIds: ["invoice"],
            handoffView: {
              documentVisibility: {
                mode: "selected",
                documentIds: ["payment-cert", "invoice"],
              },
            },
          },
        ],
        edges: [],
      },
    },
    nodeId: "submit-1",
    documentId: "payment-cert",
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.label, "Removed document requirement");
  assert.deepEqual(result.template.documentTypes, ["Invoice"]);
  assert.deepEqual(
    result.template.documents.map((document) => document.id),
    ["invoice"],
  );
  assert.deepEqual(
    result.template.fields.map((field) => field.documentId),
    ["invoice"],
  );
  assert.deepEqual(
    result.template.graph?.nodes.find((node) => node.id === "submit-1")?.documentIds,
    [],
  );
  assert.deepEqual(
    result.template.graph?.nodes.find((node) => node.id === "approval-1")?.handoffView
      ?.documentVisibility?.documentIds,
    ["invoice"],
  );
});

test("keeps a detached document when another box still requires it", () => {
  const result = getWorkflowRemoveBoxDocumentState({
    template: {
      ...template,
      documentTypes: ["Payment Cert"],
      documents: [
        {
          id: "payment-cert",
          documentType: "Payment Cert",
          format: "pdf",
          required: true,
          fields: [],
        },
      ],
      graph: {
        nodes: [
          { id: "start", label: "Start", kind: "start", x: 0, y: 0, blocking: true },
          {
            id: "submit-1",
            label: "QS",
            kind: "submit_request",
            x: 180,
            y: 0,
            blocking: true,
            documentIds: ["payment-cert"],
          },
          {
            id: "approval-1",
            label: "QS Manager",
            kind: "approval",
            x: 360,
            y: 0,
            blocking: true,
            documentIds: ["payment-cert"],
          },
        ],
        edges: [],
      },
    },
    nodeId: "submit-1",
    documentId: "payment-cert",
  });

  assert.equal(result.didUpdate, true);
  assert.deepEqual(
    result.template.documents.map((document) => document.id),
    ["payment-cert"],
  );
  assert.deepEqual(
    result.template.graph?.nodes.find((node) => node.id === "submit-1")?.documentIds,
    [],
  );
  assert.deepEqual(
    result.template.graph?.nodes.find((node) => node.id === "approval-1")?.documentIds,
    ["payment-cert"],
  );
});
