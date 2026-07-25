import assert from "node:assert/strict";
import test from "node:test";

import { getWorkflowHandoffDocumentOptions } from "./workflow-handoff-document-options-state.ts";

const template = {
  id: "template-1",
  name: "Payment approval",
  business: "Chun Wo",
  department: "QS",
  documentTypes: [
    "Payment Cert",
    "Payment Cert",
    "Supporting document",
    "Further substantiations",
  ],
  documents: [
    {
      id: "payment-cert",
      documentType: "Payment Cert",
      format: "pdf",
      required: true,
      fields: [],
    },
    {
      id: "current-supporting",
      documentType: "Supporting document",
      format: "pdf",
      required: true,
      fields: [],
    },
    {
      id: "downstream-supporting",
      documentType: "Supporting document",
      format: "pdf",
      required: true,
      fields: [],
    },
    {
      id: "orphan-substantiation",
      documentType: "Further substantiations",
      format: "pdf",
      required: false,
      fields: [],
    },
  ],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "submit-1",
        kind: "submit_request",
        label: "QS",
        x: 160,
        y: 0,
        documentIds: ["payment-cert"],
      },
      {
        id: "approval-1",
        kind: "approval",
        label: "QS Manager",
        x: 320,
        y: 0,
        documentIds: ["current-supporting"],
      },
      {
        id: "approval-2",
        kind: "approval",
        label: "Director",
        x: 480,
        y: 0,
        documentIds: ["downstream-supporting"],
      },
    ],
    edges: [
      {
        id: "edge-start-submit",
        sourceId: "start",
        targetId: "submit-1",
        label: "Start",
        branchType: "main",
      },
      {
        id: "edge-submit-approval",
        sourceId: "submit-1",
        targetId: "approval-1",
        label: "Next",
        branchType: "main",
      },
      {
        id: "edge-approval-director",
        sourceId: "approval-1",
        targetId: "approval-2",
        label: "Next",
        branchType: "main",
      },
    ],
  },
};

test("lists only upstream and current documents for handoff selection", () => {
  const options = getWorkflowHandoffDocumentOptions({
    template,
    nodeId: "approval-1",
  });

  assert.deepEqual(options, [
    {
      id: "payment-cert",
      documentType: "Payment Cert",
      label: "Payment Cert - QS",
    },
    {
      id: "current-supporting",
      documentType: "Supporting document",
      label: "Supporting document - QS Manager",
    },
  ]);
});

test("does not list orphaned template documents", () => {
  const options = getWorkflowHandoffDocumentOptions({
    template,
    nodeId: "approval-2",
  });

  assert.deepEqual(
    options.map((option) => option.id),
    ["payment-cert", "current-supporting", "downstream-supporting"],
  );
  assert.equal(
    options.some((option) => option.id === "orphan-substantiation"),
    false,
  );
});
