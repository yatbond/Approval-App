import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatNodeKind,
  getConditionContext,
  workflowNodeOptions,
} from "./workflow-condition-context.ts";

const graph = {
  nodes: [
    { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
    {
      id: "review-1",
      kind: "review",
      label: "Review 1",
      x: 160,
      y: 0,
      documentIds: ["invoice-doc"],
    },
    {
      id: "approval-1",
      kind: "approval",
      label: "Approval 1",
      x: 320,
      y: 0,
      documentIds: ["claim-doc"],
    },
    {
      id: "fyi-1",
      kind: "for_information",
      label: "FYI",
      x: 320,
      y: 140,
      documentIds: ["ignored-doc"],
    },
    { id: "condition-1", kind: "condition", label: "Condition", x: 480, y: 0 },
    { id: "manager-1", kind: "approval", label: "Manager", x: 640, y: 0 },
    { id: "return-1", kind: "return_reject", label: "Return", x: 640, y: 140 },
  ],
  edges: [
    {
      id: "edge-review-condition",
      sourceId: "review-1",
      targetId: "condition-1",
      branchType: "main",
      label: "Review done",
    },
    {
      id: "edge-approval-condition",
      sourceId: "approval-1",
      targetId: "condition-1",
      branchType: "main",
      label: "Approval done",
    },
    {
      id: "edge-fyi-condition",
      sourceId: "fyi-1",
      targetId: "condition-1",
      branchType: "for_information",
      label: "FYI done",
    },
    {
      id: "edge-condition-manager",
      sourceId: "condition-1",
      targetId: "manager-1",
      branchType: "condition",
      label: "Approve",
    },
    {
      id: "edge-condition-return",
      sourceId: "condition-1",
      targetId: "return-1",
      branchType: "condition",
      label: "Return",
    },
  ],
};

const template = {
  id: "template-finance",
  name: "Finance approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: [],
  documents: [
    {
      id: "invoice-doc",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [
        {
          name: "amount",
          label: "Invoice amount",
          type: "currency",
          required: true,
          source: "ocr",
          instructions: "Extract amount.",
          documentId: "invoice-doc",
        },
        {
          name: "vendor",
          label: "Vendor",
          type: "text",
          required: true,
          source: "ocr",
          instructions: "Extract vendor.",
          documentId: "invoice-doc",
        },
      ],
    },
    {
      id: "claim-doc",
      documentType: "Claim",
      format: "pdf",
      required: false,
      fields: [
        {
          name: "amount",
          label: "Claim amount duplicate",
          type: "number",
          required: false,
          source: "ocr",
          instructions: "Extract amount.",
          documentId: "claim-doc",
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          required: false,
          source: "ocr",
          instructions: "Extract quantity.",
          documentId: "claim-doc",
        },
      ],
    },
    {
      id: "ignored-doc",
      documentType: "FYI only",
      format: "pdf",
      required: false,
      fields: [
        {
          name: "ignored_total",
          label: "Ignored total",
          type: "currency",
          required: false,
          source: "ocr",
          instructions: "Ignore unless upstream.",
          documentId: "ignored-doc",
        },
      ],
    },
  ],
  fields: [
    {
      name: "project_value",
      label: "Project value",
      type: "currency",
      required: false,
      source: "manual",
      instructions: "Project value.",
    },
  ],
  steps: [],
  graph,
  languages: ["English"],
};

test("finds condition upstream approvals and downstream outcome boxes", () => {
  const conditionNode = graph.nodes.find((node) => node.id === "condition-1");
  const context = getConditionContext(graph, template, conditionNode);

  assert.deepEqual(
    context.incomingEdges.map((edge) => edge.id),
    ["edge-review-condition", "edge-approval-condition", "edge-fyi-condition"],
  );
  assert.deepEqual(
    context.upstreamNodes.map((node) => node.id),
    ["review-1", "approval-1"],
  );
  assert.deepEqual(
    context.downstreamNodes.map((item) => `${item.edge.id}:${item.node.id}`),
    ["edge-condition-manager:manager-1", "edge-condition-return:return-1"],
  );
});

test("lists unique numeric fields from upstream documents plus template fields", () => {
  const conditionNode = graph.nodes.find((node) => node.id === "condition-1");
  const context = getConditionContext(graph, template, conditionNode);

  assert.deepEqual(
    context.numericFields.map((field) => `${field.name}:${field.label}`),
    [
      "amount:Invoice amount",
      "quantity:Quantity",
      "project_value:Project value",
    ],
  );
});

test("uses all document numeric fields when there are no upstream document ids", () => {
  const isolatedCondition = {
    id: "condition-isolated",
    kind: "condition",
    label: "Condition",
    x: 0,
    y: 0,
  };
  const isolatedGraph = {
    nodes: [isolatedCondition],
    edges: [],
  };

  const context = getConditionContext(isolatedGraph, template, isolatedCondition);

  assert.deepEqual(
    context.numericFields.map((field) => field.name),
    ["amount", "quantity", "ignored_total", "project_value"],
  );
});

test("formats workflow node kind labels", () => {
  assert.deepEqual(workflowNodeOptions, [
    { kind: "submit_request", label: "Submit" },
    { kind: "approval", label: "Approval" },
    { kind: "review", label: "Review" },
    { kind: "for_information", label: "FYI" },
    { kind: "condition", label: "Condition" },
    { kind: "end", label: "End" },
  ]);
  assert.equal(formatNodeKind("submit_request"), "Submit");
  assert.equal(formatNodeKind("review"), "Review");
  assert.equal(formatNodeKind("return_reject"), "Return/Reject");
  assert.equal(formatNodeKind("start"), "Start");
});
