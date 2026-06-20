import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTaskAction,
  isActionableBy,
  isVisibleToParticipant,
} from "./approval-state.ts";

const actor = {
  name: "Derrick Pang",
  email: "derrick@example.com",
};

function makeTask() {
  return {
    id: "APR-1",
    title: "Invoice",
    workflow: "Finance invoice approval",
    requester: "Mandy Chan",
    requesterEmail: "mandy@example.com",
    department: "Finance",
    status: "pending",
    due: "Today",
    value: "HKD 1,000",
    currentStep: "Department review",
    currentOwner: "derrick@example.com",
    participants: ["mandy@example.com", "derrick@example.com"],
    lastAction: "Submitted",
    extractedFields: {},
    auditTrail: [
      {
        id: "APR-1-event-1",
        action: "submitted",
        actor: "Mandy Chan",
        actorEmail: "mandy@example.com",
        timestamp: "2026-06-17 09:00",
        detail: "Request submitted",
      },
    ],
  };
}

function makeGraphTemplate() {
  return {
    id: "finance-invoice",
    name: "Finance invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Department review",
          x: 200,
          y: 0,
          assigneeName: "Derrick Pang",
          assigneeEmail: "derrick@example.com",
          dueInHours: 24,
        },
        {
          id: "approval-2",
          kind: "approval",
          label: "CFO approval",
          x: 400,
          y: 0,
          assigneeName: "CFO",
          assigneeEmail: "cfo@example.com",
          dueInHours: 24,
        },
        {
          id: "info-1",
          kind: "for_information",
          label: "Notify Finance",
          x: 400,
          y: 140,
          assigneeName: "Finance Team",
          assigneeEmail: "finance@example.com",
          blocking: false,
        },
        {
          id: "originator-review",
          kind: "review",
          label: "Originator amendment",
          x: 400,
          y: 220,
          assigneeName: "Mandy Chan",
          assigneeEmail: "mandy@example.com",
          dueInHours: 24,
        },
        { id: "end", kind: "end", label: "End", x: 600, y: 0 },
      ],
      edges: [
        {
          id: "edge-start-approval-1",
          sourceId: "start",
          targetId: "approval-1",
          label: "Submit",
          branchType: "main",
        },
        {
          id: "edge-approval-1-approval-2",
          sourceId: "approval-1",
          targetId: "approval-2",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-approval-1-info",
          sourceId: "approval-1",
          targetId: "info-1",
          label: "FYI",
          branchType: "for_information",
          blocking: false,
        },
        {
          id: "edge-approval-1-rejected",
          sourceId: "approval-1",
          targetId: "originator-review",
          label: "Rejected",
          branchType: "rejected",
        },
        {
          id: "edge-approval-2-end",
          sourceId: "approval-2",
          targetId: "end",
          label: "Approved",
          branchType: "approved",
        },
      ],
    },
  };
}

test("approve moves the task out of the actor queue but leaves it trackable", () => {
  const result = applyTaskAction(makeTask(), {
    action: "approve",
    actor,
    comment: "Looks fine",
  });

  assert.equal(isActionableBy(result, actor.email), false);
  assert.equal(isVisibleToParticipant(result, actor.email), true);
  assert.equal(result.status, "pending");
  assert.equal(result.currentOwner, "next.approver@example.com");
  assert.equal(isActionableBy(result, "next.approver@example.com"), true);
  assert.match(result.lastAction, /Approved/);
  assert.ok(result.auditTrail.some((event) => event.detail.includes("Looks fine")));
});

test("approve advances to the next approval box when a graph template is provided", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-1",
      completedNodeIds: ["start"],
    },
    {
      action: "approve",
      actor,
      comment: "Looks fine",
      template: makeGraphTemplate(),
    },
  );

  assert.equal(result.status, "pending");
  assert.equal(result.currentOwner, "cfo@example.com");
  assert.equal(result.currentStep, "CFO approval");
  assert.equal(result.currentNodeId, "approval-2");
  assert.deepEqual(result.completedNodeIds, ["start", "approval-1"]);
  assert.ok(result.notifiedNodeIds.includes("info-1"));
  assert.ok(result.participants.includes("finance@example.com"));
  assert.equal(result.auditTrail.at(-1).action, "assigned");
});

test("final graph approval closes the task", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-2",
      currentOwner: "cfo@example.com",
      completedNodeIds: ["start", "approval-1"],
    },
    {
      action: "approve",
      actor: { name: "CFO", email: "cfo@example.com" },
      template: makeGraphTemplate(),
    },
  );

  assert.equal(result.status, "approved");
  assert.equal(result.currentOwner, "");
  assert.equal(result.currentStep, "Approved");
  assert.equal(isActionableBy(result, "cfo@example.com"), false);
  assert.ok(result.completedNodeIds.includes("approval-2"));
});

test("condition can route approval to return-reject when a numeric rule matches", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-1",
      completedNodeIds: ["start"],
      extractedFields: { invoice_total: "0" },
    },
    {
      action: "approve",
      actor,
      template: {
        ...makeGraphTemplate(),
        graph: {
          nodes: [
            { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
            {
              id: "approval-1",
              kind: "approval",
              label: "Department review",
              x: 200,
              y: 0,
              assigneeName: "Derrick Pang",
              assigneeEmail: "derrick@example.com",
            },
            {
              id: "condition-1",
              kind: "condition",
              label: "Amount check",
              x: 400,
              y: 0,
            },
            {
              id: "return-1",
              kind: "return_reject",
              label: "Return/Reject",
              x: 600,
              y: 0,
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
              id: "edge-approval-condition",
              sourceId: "approval-1",
              targetId: "condition-1",
              label: "Approved",
              branchType: "approved",
            },
            {
              id: "edge-zero-return",
              sourceId: "condition-1",
              targetId: "return-1",
              label: "Zero amount",
              branchType: "condition",
              rule: { field: "invoice_total", operator: "=", value: "0" },
            },
          ],
        },
      },
    },
  );

  assert.equal(result.status, "returned");
  assert.equal(result.currentOwner, "mandy@example.com");
  assert.equal(result.currentNodeId, "return-1");
  assert.equal(result.activeBranchId, "edge-zero-return");
});

test("condition routes by exact upstream approval decisions", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-3",
      currentOwner: "approver3@example.com",
      completedNodeIds: ["start", "approval-1", "approval-2"],
      nodeDecisions: {
        "approval-1": "approved",
        "approval-2": "rejected",
      },
    },
    {
      action: "approve",
      actor: { name: "Approver 3", email: "approver3@example.com" },
      template: {
        ...makeGraphTemplate(),
        graph: {
          nodes: [
            { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
            {
              id: "approval-3",
              kind: "approval",
              label: "Third approver",
              x: 200,
              y: 0,
              assigneeName: "Approver 3",
              assigneeEmail: "approver3@example.com",
            },
            {
              id: "condition-1",
              kind: "condition",
              label: "Approval count",
              x: 400,
              y: 0,
              conditionCases: [
                {
                  id: "case-2",
                  name: "2 approved",
                  approvalRule: {
                    upstreamNodeIds: ["approval-1", "approval-2", "approval-3"],
                    minimumApproved: 2,
                    mode: "exactly",
                  },
                  join: "and",
                  targetNodeIds: ["cfo"],
                },
                {
                  id: "case-3",
                  name: "All approved",
                  approvalRule: {
                    upstreamNodeIds: ["approval-1", "approval-2", "approval-3"],
                    minimumApproved: 3,
                    mode: "exactly",
                  },
                  join: "and",
                  targetNodeIds: ["end"],
                },
              ],
            },
            {
              id: "cfo",
              kind: "approval",
              label: "CFO approval",
              x: 600,
              y: 0,
              assigneeName: "CFO",
              assigneeEmail: "cfo@example.com",
            },
            { id: "end", kind: "end", label: "End", x: 800, y: 0 },
          ],
          edges: [
            {
              id: "edge-start-approval",
              sourceId: "start",
              targetId: "approval-3",
              label: "Submit",
              branchType: "main",
            },
            {
              id: "edge-approval-condition",
              sourceId: "approval-3",
              targetId: "condition-1",
              label: "Approved",
              branchType: "approved",
            },
          ],
        },
      },
    },
  );

  assert.equal(result.status, "pending");
  assert.equal(result.currentOwner, "cfo@example.com");
  assert.equal(result.activeBranchId, "case-2");
  assert.deepEqual(result.nodeDecisions, {
    "approval-1": "approved",
    "approval-2": "rejected",
    "approval-3": "approved",
  });
});

test("condition routes to fallback when no specified condition matches", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-1",
      completedNodeIds: ["start"],
      extractedFields: { invoice_total: "1000" },
    },
    {
      action: "approve",
      actor,
      template: {
        ...makeGraphTemplate(),
        graph: {
          nodes: [
            { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
            {
              id: "approval-1",
              kind: "approval",
              label: "Department review",
              x: 200,
              y: 0,
              assigneeName: "Derrick Pang",
              assigneeEmail: "derrick@example.com",
            },
            {
              id: "condition-1",
              kind: "condition",
              label: "Amount routing",
              x: 400,
              y: 0,
              conditionCases: [
                {
                  id: "case-high",
                  name: "High value",
                  numericRule: {
                    field: "invoice_total",
                    operator: ">",
                    value: "5000",
                  },
                  join: "and",
                  targetNodeIds: ["cfo"],
                },
                {
                  id: "case-fallback",
                  name: "All other conditions",
                  isFallback: true,
                  join: "and",
                  targetNodeIds: ["end"],
                },
              ],
            },
            {
              id: "cfo",
              kind: "approval",
              label: "CFO approval",
              x: 600,
              y: 0,
              assigneeName: "CFO",
              assigneeEmail: "cfo@example.com",
            },
            { id: "end", kind: "end", label: "End", x: 800, y: 0 },
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
              id: "edge-approval-condition",
              sourceId: "approval-1",
              targetId: "condition-1",
              label: "Approved",
              branchType: "approved",
            },
          ],
        },
      },
    },
  );

  assert.equal(result.status, "approved");
  assert.equal(result.activeBranchId, "case-fallback");
});

test("parallel approvals wait until a condition case is satisfied", () => {
  const template = {
    ...makeGraphTemplate(),
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 200,
          y: 0,
          assigneeName: "Reviewer 1",
          assigneeEmail: "review1@example.com",
        },
        {
          id: "review-2",
          kind: "review",
          label: "Review 2",
          x: 200,
          y: 120,
          assigneeName: "Reviewer 2",
          assigneeEmail: "review2@example.com",
        },
        {
          id: "review-3",
          kind: "review",
          label: "Review 3",
          x: 200,
          y: 240,
          assigneeName: "Reviewer 3",
          assigneeEmail: "review3@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Approval count",
          x: 440,
          y: 120,
          conditionCases: [
            {
              id: "case-2",
              name: "2 approved",
              approvalRule: {
                upstreamNodeIds: ["review-1", "review-2", "review-3"],
                minimumApproved: 2,
                mode: "exactly",
              },
              join: "and",
              targetNodeIds: ["cfo"],
            },
          ],
        },
        {
          id: "cfo",
          kind: "approval",
          label: "CFO approval",
          x: 680,
          y: 120,
          assigneeName: "CFO",
          assigneeEmail: "cfo@example.com",
        },
      ],
      edges: [
        {
          id: "edge-review-1-condition",
          sourceId: "review-1",
          targetId: "condition-1",
          label: "Done",
          branchType: "main",
        },
        {
          id: "edge-review-2-condition",
          sourceId: "review-2",
          targetId: "condition-1",
          label: "Done",
          branchType: "main",
        },
        {
          id: "edge-review-3-condition",
          sourceId: "review-3",
          targetId: "condition-1",
          label: "Done",
          branchType: "main",
        },
      ],
    },
  };
  const task = {
    ...makeTask(),
    workflowTemplateId: "finance-invoice",
    currentNodeId: "review-1",
    currentOwner: "review1@example.com",
    currentStep: "Review 1",
    pendingNodeIds: ["review-1", "review-2", "review-3"],
    pendingOwners: [
      "review1@example.com",
      "review2@example.com",
      "review3@example.com",
    ],
    participants: [
      "mandy@example.com",
      "review1@example.com",
      "review2@example.com",
      "review3@example.com",
    ],
    completedNodeIds: ["start"],
  };

  const first = applyTaskAction(task, {
    action: "approve",
    actor: { name: "Reviewer 1", email: "review1@example.com" },
    template,
  });

  assert.equal(first.currentOwner, "review2@example.com");
  assert.deepEqual(first.pendingNodeIds, ["review-2", "review-3"]);
  assert.equal(first.nodeDecisions["review-1"], "approved");

  const second = applyTaskAction(first, {
    action: "approve",
    actor: { name: "Reviewer 2", email: "review2@example.com" },
    template,
  });

  assert.equal(second.currentOwner, "cfo@example.com");
  assert.equal(second.currentNodeId, "cfo");
  assert.deepEqual(second.pendingNodeIds, ["cfo"]);
  assert.equal(second.activeBranchId, "case-2");
});

test("reject returns the task to the originator for amendment or cancellation", () => {
  const result = applyTaskAction(makeTask(), {
    action: "reject_with_comment",
    actor,
    comment: "Missing receipt",
  });

  assert.equal(result.status, "returned");
  assert.equal(result.currentOwner, "mandy@example.com");
  assert.equal(result.currentStep, "Originator action required");
  assert.equal(isActionableBy(result, "mandy@example.com"), true);
  assert.match(result.lastAction, /Rejected/);
});

test("reject follows a configured rejected branch when provided", () => {
  const result = applyTaskAction(
    {
      ...makeTask(),
      workflowTemplateId: "finance-invoice",
      currentNodeId: "approval-1",
      completedNodeIds: ["start"],
    },
    {
      action: "reject_with_comment",
      actor,
      comment: "Please amend",
      template: makeGraphTemplate(),
    },
  );

  assert.equal(result.status, "pending");
  assert.equal(result.currentOwner, "mandy@example.com");
  assert.equal(result.currentStep, "Originator amendment");
  assert.equal(result.currentNodeId, "originator-review");
  assert.equal(result.activeBranchId, "edge-approval-1-rejected");
  assert.ok(result.auditTrail.some((event) => event.detail.includes("Please amend")));
});

test("reassign keeps the task active and marks it as reassigned", () => {
  const result = applyTaskAction(makeTask(), {
    action: "reassign",
    actor,
    targetEmail: "alex@example.com",
    comment: "Please take this one",
  });

  assert.equal(result.status, "reassigned");
  assert.equal(result.currentOwner, "alex@example.com");
  assert.equal(isActionableBy(result, "alex@example.com"), true);
  assert.equal(isVisibleToParticipant(result, actor.email), true);
  assert.ok(result.participants.includes("alex@example.com"));
  assert.match(result.lastAction, /Reassigned to alex@example.com/);
});

test("originator can cancel a returned task and close it for everyone", () => {
  const returned = applyTaskAction(makeTask(), {
    action: "reject_with_comment",
    actor,
    comment: "Missing receipt",
  });
  const result = applyTaskAction(returned, {
    action: "cancel",
    actor: { name: "Mandy Chan", email: "mandy@example.com" },
    comment: "Will submit under a different budget",
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.currentOwner, "");
  assert.equal(isActionableBy(result, "mandy@example.com"), false);
  assert.equal(isVisibleToParticipant(result, actor.email), true);
  assert.match(result.lastAction, /Cancelled/);
});
