import assert from "node:assert/strict";
import test from "node:test";
import { applyTaskAction } from "./approval-state.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";

const requester = {
  name: "Mandy Chan",
  email: "mandy@example.com",
};

const departmentApprover = {
  name: "Department Approver",
  email: "department.approver@example.com",
};

const financeApprover = {
  name: "Finance Approver",
  email: "finance.approver@example.com",
};

function makeLifecycleTemplate() {
  return {
    id: "invoice-lifecycle",
    name: "Invoice lifecycle approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: ["Invoice"],
    documents: [
      {
        id: "invoice-pdf",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [
          {
            name: "invoice_total",
            label: "Invoice total",
            type: "number",
            required: true,
            source: "ai",
            instructions: "Extract the total amount.",
            documentId: "invoice-pdf",
          },
        ],
      },
    ],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
        {
          id: "department-review",
          kind: "approval",
          label: "Department review",
          x: 180,
          y: 0,
          assigneeName: departmentApprover.name,
          assigneeEmail: departmentApprover.email,
          dueInHours: 24,
          documentIds: ["invoice-pdf"],
        },
        {
          id: "finance-review",
          kind: "approval",
          label: "Finance approval",
          x: 360,
          y: 0,
          assigneeName: financeApprover.name,
          assigneeEmail: financeApprover.email,
          dueInHours: 24,
        },
        {
          id: "return-reject",
          kind: "return_reject",
          label: "Return to originator",
          x: 540,
          y: 120,
        },
        { id: "end", kind: "end", label: "Complete", x: 540, y: 0 },
      ],
      edges: [
        {
          id: "edge-start-department",
          sourceId: "start",
          targetId: "department-review",
          label: "Submit",
          branchType: "main",
        },
        {
          id: "edge-department-finance",
          sourceId: "department-review",
          targetId: "finance-review",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-finance-return",
          sourceId: "finance-review",
          targetId: "return-reject",
          label: "Rejected",
          branchType: "rejected",
        },
        {
          id: "edge-finance-end",
          sourceId: "finance-review",
          targetId: "end",
          label: "Approved",
          branchType: "approved",
        },
      ],
    },
  };
}

test("request can be submitted, approved, rejected, amended, resubmitted, and completed", () => {
  const template = makeLifecycleTemplate();
  const submitted = createApprovalTaskFromTemplate({
    id: "APR-LIFECYCLE",
    now: new Date("2026-06-21T08:00:00Z"),
    requester,
    template,
    sourceFileName: "invoice.pdf",
    extractedFields: { invoice_total: "8400" },
    attachments: [
      {
        id: "attachment-1",
        fileName: "invoice.pdf",
        documentId: "invoice-pdf",
        documentType: "Invoice",
        format: "pdf",
        workflowNodeId: "department-review",
        uploadedBy: requester.email,
        uploadedAt: "2026-06-21 16:00",
      },
    ],
  });

  assert.equal(submitted.status, "pending");
  assert.equal(submitted.currentNodeId, "department-review");
  assert.equal(submitted.currentOwner, departmentApprover.email);
  assert.deepEqual(submitted.completedNodeIds, ["start"]);

  const departmentApproved = applyTaskAction(submitted, {
    action: "approve",
    actor: departmentApprover,
    comment: "Department checked",
    template,
  });

  assert.equal(departmentApproved.status, "pending");
  assert.equal(departmentApproved.currentNodeId, "finance-review");
  assert.equal(departmentApproved.currentOwner, financeApprover.email);
  assert.equal(departmentApproved.nodeDecisions?.["department-review"], "approved");
  assert.ok(departmentApproved.completedNodeIds?.includes("department-review"));

  const financeRejected = applyTaskAction(departmentApproved, {
    action: "reject_with_comment",
    actor: financeApprover,
    comment: "Budget code missing",
    template,
  });

  assert.equal(financeRejected.status, "returned");
  assert.equal(financeRejected.currentOwner, requester.email);
  assert.equal(financeRejected.currentStep, "Originator action required");
  assert.equal(financeRejected.currentNodeId, "return-reject");
  assert.equal(financeRejected.nodeDecisions?.["finance-review"], "rejected");
  assert.ok(
    financeRejected.auditTrail.some(
      (event) =>
        event.action === "rejected" &&
        event.detail.includes("Budget code missing"),
    ),
  );

  const resubmitted = applyTaskAction(financeRejected, {
    action: "amend_resubmit",
    actor: requester,
    comment: "Budget code added",
    template,
  });

  assert.equal(resubmitted.status, "pending");
  assert.equal(resubmitted.currentNodeId, "department-review");
  assert.equal(resubmitted.currentOwner, departmentApprover.email);
  assert.deepEqual(resubmitted.completedNodeIds, ["start"]);
  assert.deepEqual(resubmitted.nodeDecisions, {});

  const secondDepartmentApproval = applyTaskAction(resubmitted, {
    action: "approve_with_comment",
    actor: departmentApprover,
    comment: "Updated invoice accepted",
    template,
  });
  const completed = applyTaskAction(secondDepartmentApproval, {
    action: "approve",
    actor: financeApprover,
    comment: "Final approval",
    template,
  });

  assert.equal(completed.status, "approved");
  assert.equal(completed.currentOwner, "");
  assert.equal(completed.currentStep, "Approved");
  assert.equal(completed.nodeDecisions?.["department-review"], "approved");
  assert.equal(completed.nodeDecisions?.["finance-review"], "approved");
  assert.ok(completed.completedNodeIds?.includes("finance-review"));
  assert.ok(completed.participants.includes(requester.email));
  assert.ok(completed.participants.includes(departmentApprover.email));
  assert.ok(completed.participants.includes(financeApprover.email));
  assert.deepEqual(
    completed.auditTrail.map((event) => event.action),
    [
      "submitted",
      "assigned",
      "approved",
      "assigned",
      "rejected",
      "assigned",
      "resubmitted",
      "assigned",
      "approved",
      "assigned",
      "approved",
    ],
  );
});
