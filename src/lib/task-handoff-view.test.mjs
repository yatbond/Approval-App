import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaskHandoffView } from "./task-handoff-view.ts";

const baseTask = {
  id: "task-1",
  title: "Purchase approval",
  workflow: "Procurement",
  workflowTemplateId: "template-1",
  requester: "Mandy Chan",
  requesterEmail: "mandy@example.com",
  department: "Operations",
  status: "pending",
  due: "Tomorrow",
  dueAt: "2026-06-28T09:00:00.000Z",
  value: "HKD 12,000",
  currentStep: "Finance review",
  currentOwner: "finance@example.com",
  currentNodeId: "finance",
  participants: ["mandy@example.com", "finance@example.com"],
  lastAction: "Submitted by Mandy Chan",
  extractedFields: {
    Amount: "12000",
    "PO Amount": "11800",
    Supplier: "Acme Supplies",
    "Internal Budget Code": "OPS-SECRET",
  },
  attachments: [
    {
      id: "attachment-1",
      fileName: "purchase-order.pdf",
      documentId: "po",
      documentType: "Purchase order",
      format: "pdf",
      uploadedBy: "mandy@example.com",
      uploadedAt: "2026-06-27 10:00",
      storagePath: "requests/task-1/purchase-order.pdf",
    },
    {
      id: "attachment-2",
      fileName: "internal-budget.pdf",
      documentId: "budget",
      documentType: "Budget approval",
      format: "pdf",
      uploadedBy: "mandy@example.com",
      uploadedAt: "2026-06-27 10:05",
    },
  ],
  auditTrail: [],
};

const baseTemplate = {
  id: "template-1",
  name: "Purchase approval",
  business: "Demo",
  department: "Operations",
  documentTypes: ["Purchase order", "Budget approval"],
  documents: [
    {
      id: "po",
      documentType: "Purchase order",
      format: "pdf",
      required: true,
      fields: [],
    },
    {
      id: "budget",
      documentType: "Budget approval",
      format: "pdf",
      required: false,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "finance",
        kind: "approval",
        label: "Finance review",
        x: 100,
        y: 0,
        assigneeEmail: "finance@example.com",
      },
    ],
    edges: [{ id: "start-finance", sourceId: "start", targetId: "finance", label: "", branchType: "main" }],
  },
};

test("builds a default handoff packet with all fields and attachments", () => {
  const view = buildTaskHandoffView({ task: baseTask, template: baseTemplate });

  assert.equal(view.nodeLabel, "Finance review");
  assert.equal(view.layout, "standard");
  assert.equal(view.policyLabel, "Default pass-through");
  assert.deepEqual(
    view.fields.map((field) => field.label),
    ["Amount", "PO Amount", "Supplier", "Internal Budget Code"],
  );
  assert.deepEqual(
    view.attachments.map((attachment) => attachment.fileName),
    ["purchase-order.pdf", "internal-budget.pdf"],
  );
  assert.equal(view.hiddenFieldCount, 0);
  assert.equal(view.hiddenAttachmentCount, 0);
});

test("filters handoff fields and documents from the current node visibility policy", () => {
  const template = {
    ...baseTemplate,
    graph: {
      ...baseTemplate.graph,
      nodes: baseTemplate.graph.nodes.map((node) =>
        node.id === "finance"
          ? {
              ...node,
              handoffView: {
                fieldVisibility: {
                  mode: "selected",
                  fieldNames: ["Amount", "Supplier"],
                },
                documentVisibility: {
                  mode: "selected",
                  documentIds: ["po"],
                },
              },
            }
          : node,
      ),
    },
  };

  const view = buildTaskHandoffView({ task: baseTask, template });

  assert.deepEqual(
    view.fields.map((field) => field.label),
    ["Amount", "Supplier"],
  );
  assert.deepEqual(
    view.attachments.map((attachment) => attachment.documentType),
    ["Purchase order"],
  );
  assert.equal(view.hiddenFieldCount, 2);
  assert.equal(view.hiddenAttachmentCount, 1);
  assert.equal(view.policyLabel, "Custom handoff view");
});

test("evaluates simple comparison process blocks for handoff packets", () => {
  const template = {
    ...baseTemplate,
    graph: {
      ...baseTemplate.graph,
      nodes: baseTemplate.graph.nodes.map((node) =>
        node.id === "finance"
          ? {
              ...node,
              handoffView: {
                processes: [
                  {
                    id: "amount-vs-po",
                    type: "comparison",
                    label: "Amount within PO",
                    leftField: "Amount",
                    operator: "<=",
                    rightField: "PO Amount",
                  },
                ],
              },
            }
          : node,
      ),
    },
  };

  const view = buildTaskHandoffView({ task: baseTask, template });

  assert.deepEqual(view.processes, [
    {
      id: "amount-vs-po",
      label: "Amount within PO",
      tone: "fail",
      result: "Not matched",
      detail: "Amount 12000 is not <= PO Amount 11800.",
    },
  ]);
});

test("marks numeric comparison processes unknown when values are not numeric", () => {
  const task = {
    ...baseTask,
    extractedFields: {
      ...baseTask.extractedFields,
      Reviewer: "Bob Lee",
    },
  };
  const template = {
    ...baseTemplate,
    graph: {
      ...baseTemplate.graph,
      nodes: baseTemplate.graph.nodes.map((node) =>
        node.id === "finance"
          ? {
              ...node,
              handoffView: {
                processes: [
                  {
                    id: "supplier-greater-than-code",
                    type: "comparison",
                    label: "Supplier greater than reviewer",
                    leftField: "Supplier",
                    operator: ">",
                    rightField: "Reviewer",
                  },
                ],
              },
            }
          : node,
      ),
    },
  };

  const view = buildTaskHandoffView({ task, template });

  assert.deepEqual(view.processes, [
    {
      id: "supplier-greater-than-code",
      label: "Supplier greater than reviewer",
      tone: "unknown",
      result: "Needs review",
      detail: "Supplier or Reviewer is unavailable.",
    },
  ]);
});
