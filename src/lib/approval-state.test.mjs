import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTaskAction,
  isActionableBy,
  isVisibleToParticipant,
} from "./approval-state.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";

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

function makeAllNodeKindsTemplate(conditionCases) {
  return {
    id: "all-node-kinds",
    name: "All node kinds workflow",
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
          label: "Approval 1",
          x: 200,
          y: 0,
          assigneeName: "Approver 1",
          assigneeEmail: "approver1@example.com",
        },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 200,
          y: 140,
          assigneeName: "Reviewer 1",
          assigneeEmail: "reviewer1@example.com",
        },
        {
          id: "approval-2",
          kind: "approval",
          label: "Approval 2",
          x: 200,
          y: 280,
          assigneeName: "Approver 2",
          assigneeEmail: "approver2@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Routing condition",
          x: 480,
          y: 140,
          conditionCases,
        },
        {
          id: "fyi-1",
          kind: "for_information",
          label: "Finance FYI",
          x: 720,
          y: 0,
          assigneeName: "Finance FYI",
          assigneeEmail: "finance.fyi@example.com",
          blocking: false,
        },
        {
          id: "extra-review",
          kind: "review",
          label: "Extra review",
          x: 720,
          y: 140,
          assigneeName: "Extra Reviewer",
          assigneeEmail: "extra@example.com",
        },
        {
          id: "return-1",
          kind: "return_reject",
          label: "Return/Reject",
          x: 720,
          y: 280,
        },
        { id: "end", kind: "end", label: "End", x: 960, y: 140 },
      ],
      edges: [
        {
          id: "edge-start-approval-1",
          sourceId: "start",
          targetId: "approval-1",
          label: "Start approval",
          branchType: "main",
        },
        {
          id: "edge-start-review-1",
          sourceId: "start",
          targetId: "review-1",
          label: "Start review",
          branchType: "main",
        },
        {
          id: "edge-start-approval-2",
          sourceId: "start",
          targetId: "approval-2",
          label: "Start approval 2",
          branchType: "main",
        },
        {
          id: "edge-approval-1-condition",
          sourceId: "approval-1",
          targetId: "condition-1",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-review-1-condition",
          sourceId: "review-1",
          targetId: "condition-1",
          label: "Reviewed",
          branchType: "approved",
        },
        {
          id: "edge-approval-2-condition",
          sourceId: "approval-2",
          targetId: "condition-1",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-extra-end",
          sourceId: "extra-review",
          targetId: "end",
          label: "Approved",
          branchType: "approved",
        },
        {
          id: "edge-extra-return",
          sourceId: "extra-review",
          targetId: "return-1",
          label: "Rejected",
          branchType: "rejected",
        },
      ],
    },
  };
}

function makeCreatedTask(template, extractedFields = {}) {
  return createApprovalTaskFromTemplate({
    id: "APR-MATRIX",
    now: new Date("2026-06-23T09:00:00+08:00"),
    requester: { name: "Mandy Chan", email: "mandy@example.com" },
    template,
    extractedFields,
  });
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
                mode: "at_least",
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

test("condition case can route a 2 of 3 approval count through FYI and review in a graph with every node kind", () => {
  const template = makeAllNodeKindsTemplate([
    {
      id: "case-2-of-3",
      name: "At least two approve",
      approvalRule: {
        upstreamNodeIds: ["approval-1", "review-1", "approval-2"],
        minimumApproved: 2,
        mode: "at_least",
      },
      join: "and",
      targetNodeIds: ["fyi-1", "extra-review"],
    },
  ]);
  const task = makeCreatedTask(template, { invoice_total: "HKD 12,000" });

  const first = applyTaskAction(task, {
    action: "approve",
    actor: { name: "Approver 1", email: "approver1@example.com" },
    template,
  });

  assert.equal(first.currentOwner, "reviewer1@example.com");
  assert.deepEqual(first.pendingNodeIds, ["review-1", "approval-2"]);
  assert.equal(first.notifiedNodeIds.includes("fyi-1"), false);

  const second = applyTaskAction(first, {
    action: "approve",
    actor: { name: "Reviewer 1", email: "reviewer1@example.com" },
    template,
  });

  assert.equal(second.status, "pending");
  assert.equal(second.currentOwner, "extra@example.com");
  assert.equal(second.currentNodeId, "extra-review");
  assert.deepEqual(second.pendingNodeIds, ["extra-review"]);
  assert.equal(second.activeBranchId, "case-2-of-3");
  assert.ok(second.notifiedNodeIds.includes("fyi-1"));
  assert.ok(second.participants.includes("finance.fyi@example.com"));

  const completed = applyTaskAction(second, {
    action: "approve",
    actor: { name: "Extra Reviewer", email: "extra@example.com" },
    template,
  });

  assert.equal(completed.status, "approved");
  assert.equal(completed.currentOwner, "");
  assert.ok(completed.completedNodeIds.includes("extra-review"));
});

test("condition case routes multiple actionable outcome boxes in parallel", () => {
  const template = makeAllNodeKindsTemplate([
    {
      id: "case-2-of-3",
      name: "At least two approve",
      approvalRule: {
        upstreamNodeIds: ["approval-1", "review-1", "approval-2"],
        minimumApproved: 2,
        mode: "at_least",
      },
      join: "and",
      targetNodeIds: ["fyi-1", "extra-review", "legal-review"],
    },
  ]);
  template.graph.nodes.push({
    id: "legal-review",
    kind: "review",
    label: "Legal review",
    x: 720,
    y: 220,
    assigneeName: "Legal Reviewer",
    assigneeEmail: "legal@example.com",
  });
  template.graph.edges.push({
    id: "edge-legal-end",
    sourceId: "legal-review",
    targetId: "end",
    label: "Approved",
    branchType: "approved",
  });
  const task = makeCreatedTask(template, { invoice_total: "HKD 12,000" });

  const first = applyTaskAction(task, {
    action: "approve",
    actor: { name: "Approver 1", email: "approver1@example.com" },
    template,
  });
  const second = applyTaskAction(first, {
    action: "approve",
    actor: { name: "Reviewer 1", email: "reviewer1@example.com" },
    template,
  });

  assert.equal(second.status, "pending");
  assert.equal(second.currentNodeId, "extra-review");
  assert.deepEqual(second.pendingNodeIds, ["extra-review", "legal-review"]);
  assert.deepEqual(second.pendingOwners, ["extra@example.com", "legal@example.com"]);
  assert.ok(second.notifiedNodeIds.includes("fyi-1"));
  assert.equal(second.activeBranchId, "case-2-of-3");

  const extraDone = applyTaskAction(second, {
    action: "approve",
    actor: { name: "Extra Reviewer", email: "extra@example.com" },
    template,
  });
  assert.equal(extraDone.status, "pending");
  assert.deepEqual(extraDone.pendingNodeIds, ["legal-review"]);
  assert.equal(extraDone.currentOwner, "legal@example.com");

  const completed = applyTaskAction(extraDone, {
    action: "approve",
    actor: { name: "Legal Reviewer", email: "legal@example.com" },
    template,
  });
  assert.equal(completed.status, "approved");
  assert.equal(completed.currentOwner, "");
  assert.ok(completed.completedNodeIds.includes("extra-review"));
  assert.ok(completed.completedNodeIds.includes("legal-review"));
});

test("fallback approval-count condition waits while unresolved upstream boxes could still match a specified case", () => {
  const template = makeAllNodeKindsTemplate([
    {
      id: "case-all-3",
      name: "All three approve",
      approvalRule: {
        upstreamNodeIds: ["approval-1", "review-1", "approval-2"],
        minimumApproved: 3,
        mode: "exactly",
      },
      join: "and",
      targetNodeIds: ["extra-review"],
    },
    {
      id: "case-fallback",
      name: "All other outcomes",
      isFallback: true,
      join: "and",
      targetNodeIds: ["return-1"],
    },
  ]);
  const task = makeCreatedTask(template, { invoice_total: "HKD 12,000" });

  const first = applyTaskAction(task, {
    action: "approve",
    actor: { name: "Approver 1", email: "approver1@example.com" },
    template,
  });

  assert.equal(first.status, "pending");
  assert.equal(first.currentOwner, "reviewer1@example.com");
  assert.equal(first.currentNodeId, "review-1");
  assert.deepEqual(first.pendingNodeIds, ["review-1", "approval-2"]);
  assert.equal(first.activeBranchId, undefined);
});

test("exact approval-count condition waits for unresolved upstream boxes before routing mixed decisions", () => {
  const template = makeAllNodeKindsTemplate([
    {
      id: "case-exactly-1",
      name: "Exactly one approved",
      approvalRule: {
        upstreamNodeIds: ["approval-1", "review-1", "approval-2"],
        minimumApproved: 1,
        mode: "exactly",
      },
      join: "and",
      targetNodeIds: ["return-1"],
    },
    {
      id: "case-fallback",
      name: "All other outcomes",
      isFallback: true,
      join: "and",
      targetNodeIds: ["end"],
    },
  ]);
  const graph = template.graph;
  graph.edges = [
    ...graph.edges,
    {
      id: "edge-approval-1-rejected-condition",
      sourceId: "approval-1",
      targetId: "condition-1",
      label: "Rejected",
      branchType: "rejected",
    },
    {
      id: "edge-review-1-rejected-condition",
      sourceId: "review-1",
      targetId: "condition-1",
      label: "Rejected",
      branchType: "rejected",
    },
    {
      id: "edge-approval-2-rejected-condition",
      sourceId: "approval-2",
      targetId: "condition-1",
      label: "Rejected",
      branchType: "rejected",
    },
  ];
  const task = makeCreatedTask(template, { invoice_total: "HKD 12,000" });

  const first = applyTaskAction(task, {
    action: "approve",
    actor: { name: "Approver 1", email: "approver1@example.com" },
    template,
  });
  assert.equal(first.status, "pending");
  assert.equal(first.currentOwner, "reviewer1@example.com");

  const second = applyTaskAction(first, {
    action: "reject",
    actor: { name: "Reviewer 1", email: "reviewer1@example.com" },
    template,
  });
  assert.equal(second.status, "pending");
  assert.equal(second.currentOwner, "approver2@example.com");
  assert.deepEqual(second.pendingNodeIds, ["approval-2"]);

  const routed = applyTaskAction(second, {
    action: "reject",
    actor: { name: "Approver 2", email: "approver2@example.com" },
    template,
  });
  assert.equal(routed.status, "returned");
  assert.equal(routed.currentOwner, "mandy@example.com");
  assert.equal(routed.currentNodeId, "return-1");
  assert.equal(routed.activeBranchId, "case-exactly-1");
});

test("condition supports numeric greater-than, fallback, and return-reject outcomes", () => {
  const template = {
    ...makeGraphTemplate(),
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
        {
          id: "review-1",
          kind: "review",
          label: "Initial review",
          x: 200,
          y: 0,
          assigneeName: "Reviewer",
          assigneeEmail: "reviewer@example.com",
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
              name: "High amount",
              numericRule: { field: "invoice_total", operator: ">", value: "5000" },
              join: "and",
              targetNodeIds: ["extra-review"],
            },
            {
              id: "case-zero",
              name: "Zero amount",
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
          id: "extra-review",
          kind: "review",
          label: "High value review",
          x: 600,
          y: 0,
          assigneeName: "High Value Reviewer",
          assigneeEmail: "high.value@example.com",
        },
        {
          id: "return-1",
          kind: "return_reject",
          label: "Return/Reject",
          x: 600,
          y: 140,
        },
        { id: "end", kind: "end", label: "End", x: 800, y: 0 },
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
          id: "edge-review-condition",
          sourceId: "review-1",
          targetId: "condition-1",
          label: "Reviewed",
          branchType: "approved",
        },
        {
          id: "edge-extra-end",
          sourceId: "extra-review",
          targetId: "end",
          label: "Approved",
          branchType: "approved",
        },
      ],
    },
  };

  const high = applyTaskAction(makeCreatedTask(template, { invoice_total: "HKD 8,400" }), {
    action: "approve",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    template,
  });
  assert.equal(high.status, "pending");
  assert.equal(high.currentNodeId, "extra-review");
  assert.equal(high.activeBranchId, "case-high");

  const normal = applyTaskAction(makeCreatedTask(template, { invoice_total: "HKD 3,000" }), {
    action: "approve",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    template,
  });
  assert.equal(normal.status, "approved");
  assert.equal(normal.activeBranchId, "case-fallback");

  const zero = applyTaskAction(makeCreatedTask(template, { invoice_total: "0" }), {
    action: "approve",
    actor: { name: "Reviewer", email: "reviewer@example.com" },
    template,
  });
  assert.equal(zero.status, "returned");
  assert.equal(zero.currentOwner, "mandy@example.com");
  assert.equal(zero.currentNodeId, "return-1");
  assert.equal(zero.activeBranchId, "case-zero");
});

test("condition supports combined approval and numeric rules with and/or joins", () => {
  const template = {
    ...makeGraphTemplate(),
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit request", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Department approval",
          x: 200,
          y: 0,
          assigneeName: "Department Approver",
          assigneeEmail: "approver@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Combined routing",
          x: 400,
          y: 0,
          conditionCases: [
            {
              id: "case-approval-and-high",
              name: "Approved and high amount",
              approvalRule: {
                upstreamNodeIds: ["approval-1"],
                minimumApproved: 1,
                mode: "at_least",
              },
              numericRule: { field: "invoice_total", operator: ">=", value: "10000" },
              join: "and",
              targetNodeIds: ["extra-review"],
            },
            {
              id: "case-approval-or-high",
              name: "Approved or high amount",
              approvalRule: {
                upstreamNodeIds: ["approval-1"],
                minimumApproved: 2,
                mode: "at_least",
              },
              numericRule: { field: "invoice_total", operator: ">=", value: "5000" },
              join: "or",
              targetNodeIds: ["end"],
            },
            {
              id: "case-fallback",
              name: "All other cases",
              isFallback: true,
              join: "and",
              targetNodeIds: ["return-1"],
            },
          ],
        },
        {
          id: "extra-review",
          kind: "review",
          label: "High value review",
          x: 600,
          y: 0,
          assigneeName: "High Value Reviewer",
          assigneeEmail: "high.value@example.com",
        },
        {
          id: "return-1",
          kind: "return_reject",
          label: "Return/Reject",
          x: 600,
          y: 140,
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
  };

  const andMatch = applyTaskAction(
    makeCreatedTask(template, { invoice_total: "HKD 12,000" }),
    {
      action: "approve",
      actor: { name: "Department Approver", email: "approver@example.com" },
      template,
    },
  );
  assert.equal(andMatch.status, "pending");
  assert.equal(andMatch.currentNodeId, "extra-review");
  assert.equal(andMatch.activeBranchId, "case-approval-and-high");

  const orMatch = applyTaskAction(
    makeCreatedTask(template, { invoice_total: "HKD 6,000" }),
    {
      action: "approve",
      actor: { name: "Department Approver", email: "approver@example.com" },
      template,
    },
  );
  assert.equal(orMatch.status, "approved");
  assert.equal(orMatch.activeBranchId, "case-approval-or-high");

  const fallback = applyTaskAction(
    makeCreatedTask(template, { invoice_total: "HKD 3,000" }),
    {
      action: "approve",
      actor: { name: "Department Approver", email: "approver@example.com" },
      template,
    },
  );
  assert.equal(fallback.status, "returned");
  assert.equal(fallback.currentOwner, "mandy@example.com");
  assert.equal(fallback.activeBranchId, "case-fallback");
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
