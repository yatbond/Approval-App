import assert from "node:assert/strict";
import test from "node:test";
import { attachDocumentToTaskState } from "./task-document-attachment-state.ts";

const documentRequirement = {
  id: "invoice-pdf",
  documentType: "Invoice PDF",
  format: "pdf",
  required: true,
  fields: [],
};

const template = {
  id: "finance-template",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice PDF"],
  documents: [documentRequirement],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "Review",
        x: 100,
        y: 0,
        documentIds: ["invoice-pdf"],
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceId: "start",
        targetId: "review-1",
        label: "Next",
        branchType: "main",
      },
    ],
  },
};

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Invoice approval",
    workflow: "Finance invoice approval",
    workflowTemplateId: "finance-template",
    requester: "Mandy Chan",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Today",
    value: "HKD 1,000",
    currentStep: "Review",
    currentOwner: "derrick@example.com",
    participants: ["mandy@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    attachments: [],
    auditTrail: [],
    ...overrides,
  };
}

test("attaches an uploaded document to the matching task with audit details", () => {
  const [updated] = attachDocumentToTaskState({
    tasks: [makeTask()],
    templates: [template],
    taskId: "task-1",
    file: { name: "invoice.pdf" },
    documentRequirement,
    activeUser: { name: "Derrick Pang", email: "derrick@example.com" },
    storagePath: "private/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
    idPrefix: "attachment-fixed",
    uploadedAt: "2026-06-21T09:00:00.000Z",
  });

  assert.equal(updated.attachments.length, 1);
  assert.deepEqual(updated.attachments[0], {
    id: "attachment-fixed-invoice.pdf",
    fileName: "invoice.pdf",
    documentId: "invoice-pdf",
    documentType: "Invoice PDF",
    format: "pdf",
    workflowNodeId: "review-1",
    storagePath: "private/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
    uploadedBy: "derrick@example.com",
    uploadedAt: "2026-06-21T09:00:00.000Z",
  });
  assert.deepEqual(updated.participants.sort(), [
    "derrick@example.com",
    "mandy@example.com",
  ]);
  assert.equal(updated.lastAction, "Document uploaded by Derrick Pang");
  assert.equal(updated.auditTrail[0].action, "amended");
  assert.equal(updated.auditTrail[0].detail, "Uploaded Invoice PDF: invoice.pdf.");
});

test("leaves the task unchanged when no template can be resolved", () => {
  const task = makeTask({
    workflow: "Unknown workflow",
    workflowTemplateId: "missing-template",
  });
  const [updated] = attachDocumentToTaskState({
    tasks: [task],
    templates: [template],
    taskId: "task-1",
    file: { name: "invoice.pdf" },
    documentRequirement,
    activeUser: { name: "Derrick Pang", email: "derrick@example.com" },
  });

  assert.equal(updated, task);
});

test("leaves non-matching tasks unchanged", () => {
  const task = makeTask();
  const [updated] = attachDocumentToTaskState({
    tasks: [task],
    templates: [template],
    taskId: "other-task",
    file: { name: "invoice.pdf" },
    documentRequirement,
    activeUser: { name: "Derrick Pang", email: "derrick@example.com" },
  });

  assert.equal(updated, task);
});
