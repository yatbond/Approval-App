import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredCurrentNodeDocuments,
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import { validateWorkflowTemplate } from "./workflow-graph.ts";

const template = {
  id: "finance-invoice",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [
    {
      name: "Department review",
      role: "Department reviewer",
      approverName: "Jane Approver",
      approverEmail: "jane.approver@example.com",
      department: "Finance",
      dueInHours: 24,
      escalationRole: "Manager",
      escalationName: "Manager",
      escalationEmail: "manager@example.com",
      condition: "Always",
    },
  ],
};

test("creates a routed approval task from a selected template", () => {
  const task = createApprovalTaskFromTemplate({
    id: "APR-TEST",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Derrick", email: "derrick@example.com" },
    template,
    sourceFileName: "invoice.pdf",
    extractedFields: {
      Vendor: "Northstar Cloud Limited",
      Total: "HKD 8,400",
    },
    attachments: [
      {
        id: "attachment-1",
        fileName: "invoice.pdf",
        documentId: "invoice",
        documentType: "Invoice",
        format: "pdf",
        workflowNodeId: "approval-1",
        uploadedBy: "derrick@example.com",
        uploadedAt: "2026-06-18T02:00:00.000Z",
      },
    ],
  });

  assert.equal(task.id, "APR-TEST");
  assert.equal(task.title, "Finance invoice approval - invoice.pdf");
  assert.equal(task.currentOwner, "jane.approver@example.com");
  assert.equal(task.currentStep, "Department review");
  assert.equal(task.value, "HKD 8,400");
  assert.deepEqual(task.participants, [
    "derrick@example.com",
    "jane.approver@example.com",
    "manager@example.com",
  ]);
  assert.equal(task.auditTrail.length, 2);
  assert.equal(task.auditTrail[0].action, "submitted");
  assert.equal(task.auditTrail[1].action, "assigned");
  assert.equal(task.attachments?.[0].fileName, "invoice.pdf");
  assert.equal(task.workflowTemplateVersion, 1);
  assert.equal(task.workflowTemplateSnapshot?.id, "finance-invoice");
});

test("routes a request from the workflow canvas graph", () => {
  const task = createApprovalTaskFromTemplate({
    id: "APR-GRAPH",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: {
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Submit request", x: 0, y: 80 },
          {
            id: "approval-1",
            kind: "approval",
            label: "Finance review",
            x: 240,
            y: 80,
            assigneeName: "Finance Reviewer",
            assigneeEmail: "finance.reviewer@example.com",
            escalationName: "Finance Head",
            escalationEmail: "finance.head@example.com",
            dueInHours: 12,
          },
          {
            id: "info-1",
            kind: "for_information",
            label: "Notify Project Team",
            x: 240,
            y: 220,
            assigneeName: "Project Team",
            assigneeEmail: "project.team@example.com",
            blocking: false,
          },
        ],
        edges: [
          {
            id: "edge-start-approval",
            sourceId: "start",
            targetId: "approval-1",
            label: "Submit",
            branchType: "main",
          },
          {
            id: "edge-start-info",
            sourceId: "start",
            targetId: "info-1",
            label: "FYI",
            branchType: "for_information",
            blocking: false,
          },
        ],
      },
    },
    extractedFields: {
      Total: "HKD 12,000",
    },
  });

  assert.equal(task.currentOwner, "finance.reviewer@example.com");
  assert.equal(task.currentStep, "Finance review");
  assert.equal(task.currentNodeId, "approval-1");
  assert.deepEqual(task.completedNodeIds, ["start"]);
  assert.deepEqual(task.notifiedNodeIds, ["info-1"]);
  assert.deepEqual(task.participants, [
    "mandy@example.com",
    "finance.reviewer@example.com",
    "finance.head@example.com",
    "project.team@example.com",
  ]);
});

test("creates parallel pending owners from a split canvas start", () => {
  const task = createApprovalTaskFromTemplate({
    id: "APR-PARALLEL",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: {
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Submit request", x: 0, y: 80 },
          {
            id: "review-1",
            kind: "review",
            label: "Review 1",
            x: 240,
            y: 0,
            assigneeName: "Reviewer 1",
            assigneeEmail: "review1@example.com",
          },
          {
            id: "review-2",
            kind: "review",
            label: "Review 2",
            x: 240,
            y: 120,
            assigneeName: "Reviewer 2",
            assigneeEmail: "review2@example.com",
          },
          {
            id: "review-3",
            kind: "review",
            label: "Review 3",
            x: 240,
            y: 240,
            assigneeName: "Reviewer 3",
            assigneeEmail: "review3@example.com",
          },
        ],
        edges: [
          {
            id: "edge-start-review-1",
            sourceId: "start",
            targetId: "review-1",
            label: "Review 1",
            branchType: "main",
          },
          {
            id: "edge-start-review-2",
            sourceId: "start",
            targetId: "review-2",
            label: "Review 2",
            branchType: "main",
          },
          {
            id: "edge-start-review-3",
            sourceId: "start",
            targetId: "review-3",
            label: "Review 3",
            branchType: "main",
          },
        ],
      },
    },
    extractedFields: {},
  });

  assert.equal(task.currentOwner, "review1@example.com");
  assert.deepEqual(task.pendingNodeIds, ["review-1", "review-2", "review-3"]);
  assert.deepEqual(task.pendingOwners, [
    "review1@example.com",
    "review2@example.com",
    "review3@example.com",
  ]);
  assert.ok(task.auditTrail[1].detail.includes("3 parallel approver"));
});

test("lists document requirements attached to starting workflow route", () => {
  const taskTemplate = {
    ...template,
    documents: [
      {
        id: "invoice-pdf",
        documentType: "Invoice PDF",
        format: "pdf",
        required: true,
        fields: [],
      },
      {
        id: "later-support",
        documentType: "Later supporting document",
        format: "pdf",
        required: true,
        fields: [],
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 80 },
        {
          id: "review-1",
          kind: "review",
          label: "Initial review",
          x: 240,
          y: 80,
          assigneeEmail: "reviewer@example.com",
          documentIds: ["invoice-pdf"],
        },
        {
          id: "approval-2",
          kind: "approval",
          label: "Later approval",
          x: 480,
          y: 80,
          assigneeEmail: "approver@example.com",
          documentIds: ["later-support"],
        },
      ],
      edges: [
        {
          id: "edge-start-review",
          sourceId: "start",
          targetId: "review-1",
          label: "Submit",
          branchType: "main",
        },
        {
          id: "edge-review-approval",
          sourceId: "review-1",
          targetId: "approval-2",
          label: "Next",
          branchType: "main",
        },
      ],
    },
  };

  const requirements = getSubmissionDocumentRequirements(taskTemplate);

  assert.deepEqual(
    requirements.map((document) => document.id),
    ["invoice-pdf"],
  );
});

test("uses submit request box documents as submission requirements before routing onward", () => {
  const taskTemplate = {
    ...template,
    documents: [
      {
        id: "request-invoice",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [],
      },
      {
        id: "review-support",
        documentType: "Review support",
        format: "pdf",
        required: true,
        fields: [],
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 80 },
        {
          id: "submit-1",
          kind: "submit_request",
          label: "Submit request",
          x: 220,
          y: 80,
          documentIds: ["request-invoice"],
          blocking: true,
        },
        {
          id: "review-1",
          kind: "review",
          label: "Initial review",
          x: 440,
          y: 80,
          assigneeEmail: "reviewer@example.com",
          documentIds: ["review-support"],
        },
      ],
      edges: [
        {
          id: "edge-start-submit",
          sourceId: "start",
          targetId: "submit-1",
          label: "Begin",
          branchType: "main",
        },
        {
          id: "edge-submit-review",
          sourceId: "submit-1",
          targetId: "review-1",
          label: "Submit",
          branchType: "main",
        },
      ],
    },
  };

  const requirements = getSubmissionDocumentRequirements(taskTemplate);
  const task = createApprovalTaskFromTemplate({
    id: "APR-SUBMIT",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: taskTemplate,
    extractedFields: {},
  });

  assert.deepEqual(
    requirements.map((document) => document.id),
    ["request-invoice"],
  );
  assert.equal(task.currentNodeId, "review-1");
  assert.equal(task.currentOwner, "reviewer@example.com");
  assert.deepEqual(task.completedNodeIds, ["start", "submit-1"]);
});

test("routes submit request fields through immediate condition outcomes", () => {
  const taskTemplate = {
    ...template,
    steps: [],
    documents: [
      {
        id: "request-invoice",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [
          {
            name: "invoice_total",
            instructions: "Extract the invoice total.",
            documentId: "request-invoice",
          },
        ],
      },
    ],
    fields: [
      {
        name: "invoice_total",
        instructions: "Extract the invoice total.",
        documentId: "request-invoice",
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 80 },
        {
          id: "submit-1",
          kind: "submit_request",
          label: "Submit request",
          x: 220,
          y: 80,
          documentIds: ["request-invoice"],
          blocking: true,
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Amount routing",
          x: 440,
          y: 80,
          conditionCases: [
            {
              id: "case-high",
              name: "High value",
              numericRule: { field: "invoice_total", operator: ">", value: "5000" },
              join: "and",
              targetNodeIds: ["fyi-1", "review-1"],
            },
            {
              id: "case-zero",
              name: "No amount",
              numericRule: { field: "invoice_total", operator: "=", value: "0" },
              join: "and",
              targetNodeIds: ["return-1"],
            },
            {
              id: "case-fallback",
              name: "All other amounts",
              isFallback: true,
              join: "and",
              targetNodeIds: ["end"],
            },
          ],
        },
        {
          id: "fyi-1",
          kind: "for_information",
          label: "Finance FYI",
          x: 660,
          y: 0,
          assigneeEmail: "finance.fyi@example.com",
        },
        {
          id: "review-1",
          kind: "review",
          label: "High value review",
          x: 660,
          y: 80,
          assigneeEmail: "reviewer@example.com",
        },
        {
          id: "return-1",
          kind: "return_reject",
          label: "Return to requester",
          x: 660,
          y: 160,
        },
        { id: "end", kind: "end", label: "End", x: 880, y: 80 },
      ],
      edges: [
        {
          id: "edge-start-submit",
          sourceId: "start",
          targetId: "submit-1",
          label: "Begin",
          branchType: "main",
        },
        {
          id: "edge-submit-condition",
          sourceId: "submit-1",
          targetId: "condition-1",
          label: "Evaluate amount",
          branchType: "main",
        },
      ],
    },
  };

  assert.deepEqual(
    validateWorkflowTemplate(taskTemplate).filter((issue) => issue.severity === "error"),
    [],
  );

  const high = createApprovalTaskFromTemplate({
    id: "APR-HIGH",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: taskTemplate,
    extractedFields: { invoice_total: "HKD 8,400" },
  });
  assert.equal(high.status, "pending");
  assert.equal(high.currentNodeId, "review-1");
  assert.equal(high.currentOwner, "reviewer@example.com");
  assert.deepEqual(high.completedNodeIds, ["start", "submit-1", "condition-1"]);
  assert.deepEqual(high.notifiedNodeIds, ["fyi-1"]);
  assert.ok(high.participants.includes("finance.fyi@example.com"));
  assert.equal(high.activeBranchId, "case-high");

  const zero = createApprovalTaskFromTemplate({
    id: "APR-ZERO",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: taskTemplate,
    extractedFields: { invoice_total: "0" },
  });
  assert.equal(zero.status, "returned");
  assert.equal(zero.currentNodeId, "return-1");
  assert.equal(zero.currentOwner, "mandy@example.com");
  assert.equal(zero.currentStep, "Originator action required");
  assert.equal(zero.activeBranchId, "case-zero");

  const normal = createApprovalTaskFromTemplate({
    id: "APR-NORMAL",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: taskTemplate,
    extractedFields: { invoice_total: "HKD 3,000" },
  });
  assert.equal(normal.status, "approved");
  assert.equal(normal.currentNodeId, undefined);
  assert.equal(normal.currentOwner, "");
  assert.equal(normal.activeBranchId, "case-fallback");
});

test("starts parallel approval and review boxes after a submit request box", () => {
  const taskTemplate = {
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 80 },
        {
          id: "submit-1",
          kind: "submit_request",
          label: "Submit request",
          x: 220,
          y: 80,
          blocking: true,
        },
        {
          id: "approval-1",
          kind: "approval",
          label: "Department approval",
          x: 440,
          y: 20,
          assigneeEmail: "approver@example.com",
        },
        {
          id: "review-1",
          kind: "review",
          label: "Manager review",
          x: 440,
          y: 140,
          assigneeEmail: "reviewer@example.com",
        },
        { id: "end", kind: "end", label: "End", x: 660, y: 80 },
      ],
      edges: [
        {
          id: "edge-start-submit",
          sourceId: "start",
          targetId: "submit-1",
          label: "Begin",
          branchType: "main",
        },
        {
          id: "edge-submit-approval",
          sourceId: "submit-1",
          targetId: "approval-1",
          label: "Approval path",
          branchType: "main",
        },
        {
          id: "edge-submit-review",
          sourceId: "submit-1",
          targetId: "review-1",
          label: "Review path",
          branchType: "main",
        },
        {
          id: "edge-approval-end",
          sourceId: "approval-1",
          targetId: "end",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-review-end",
          sourceId: "review-1",
          targetId: "end",
          label: "Reviewed",
          branchType: "approved",
        },
      ],
    },
  };

  const task = createApprovalTaskFromTemplate({
    id: "APR-SPLIT-SUBMIT",
    now: new Date("2026-06-18T10:00:00+08:00"),
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: taskTemplate,
    extractedFields: {},
  });

  assert.deepEqual(
    validateWorkflowTemplate(taskTemplate).filter((issue) => issue.severity === "error"),
    [],
  );
  assert.equal(task.status, "pending");
  assert.equal(task.currentNodeId, "approval-1");
  assert.deepEqual(task.pendingNodeIds, ["approval-1", "review-1"]);
  assert.deepEqual(task.pendingOwners, [
    "approver@example.com",
    "reviewer@example.com",
  ]);
  assert.deepEqual(task.completedNodeIds, ["start", "submit-1"]);
});

test("finds missing required submission documents from uploaded attachments", () => {
  const taskTemplate = {
    ...template,
    documents: [
      {
        id: "invoice-pdf",
        documentType: "Invoice PDF",
        format: "pdf",
        required: true,
        fields: [],
      },
      {
        id: "schedule",
        documentType: "Excel schedule",
        format: "excel_csv",
        required: false,
        fields: [],
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 80 },
        {
          id: "review-1",
          kind: "review",
          label: "Initial review",
          x: 240,
          y: 80,
          assigneeEmail: "reviewer@example.com",
          documentIds: ["invoice-pdf", "schedule"],
        },
      ],
      edges: [
        {
          id: "edge-start-review",
          sourceId: "start",
          targetId: "review-1",
          label: "Submit",
          branchType: "main",
        },
      ],
    },
  };

  assert.deepEqual(
    getMissingRequiredSubmissionDocuments(taskTemplate, []).map(
      (document) => document.id,
    ),
    ["invoice-pdf"],
  );
  assert.deepEqual(
    getMissingRequiredSubmissionDocuments(taskTemplate, [
      {
        id: "attachment-1",
        fileName: "invoice.pdf",
        documentId: "invoice-pdf",
        documentType: "Invoice PDF",
        format: "pdf",
        uploadedBy: "derrick@example.com",
        uploadedAt: "2026-06-18T02:00:00.000Z",
      },
    ]),
    [],
  );
});

test("finds missing required documents at the current workflow node", () => {
  const taskTemplate = {
    ...template,
    documents: [
      {
        id: "doctor-slip",
        documentType: "Doctor slip",
        format: "image",
        required: true,
        fields: [],
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 80 },
        {
          id: "review-1",
          kind: "review",
          label: "HR review",
          x: 240,
          y: 80,
          assigneeEmail: "hr@example.com",
          documentIds: ["doctor-slip"],
        },
      ],
      edges: [
        {
          id: "edge-start-review",
          sourceId: "start",
          targetId: "review-1",
          label: "Submit",
          branchType: "main",
        },
      ],
    },
  };
  const task = {
    id: "APR-DOC",
    title: "Leave",
    workflow: "HR",
    requester: "Derrick",
    requesterEmail: "derrick@example.com",
    department: "HR",
    status: "pending",
    due: "Today",
    value: "Pending",
    currentStep: "HR review",
    currentOwner: "hr@example.com",
    currentNodeId: "review-1",
    participants: ["derrick@example.com", "hr@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    attachments: [],
    auditTrail: [],
  };

  assert.deepEqual(
    getMissingRequiredCurrentNodeDocuments(task, taskTemplate).map(
      (document) => document.id,
    ),
    ["doctor-slip"],
  );
  assert.deepEqual(
    getMissingRequiredCurrentNodeDocuments(
      {
        ...task,
        attachments: [
          {
            id: "attachment-1",
            fileName: "doctor-slip.jpg",
            documentId: "doctor-slip",
            documentType: "Doctor slip",
            format: "image",
            workflowNodeId: "review-1",
            uploadedBy: "hr@example.com",
            uploadedAt: "2026-06-18T02:00:00.000Z",
          },
        ],
      },
      taskTemplate,
    ),
    [],
  );
});
