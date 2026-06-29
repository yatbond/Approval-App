import assert from "node:assert/strict";
import test from "node:test";
import { applyTaskAction } from "./approval-state.ts";
import { getApprovalWorkspaceTaskState } from "./approval-workspace-task-state.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import { getPathNodeState } from "./task-display.ts";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Invoice approval",
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
    attachments: [],
    auditTrail: [],
    ...overrides,
  };
}

const template = {
  id: "finance-invoice",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-pdf",
      documentType: "Invoice",
      format: "pdf",
      required: true,
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
        id: "review-1",
        kind: "review",
        label: "Department review",
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

test("derives actionable, tracking, selected task, template, and missing current documents", () => {
  const selected = makeTask({
    id: "task-selected",
    workflowTemplateId: "finance-invoice",
    currentNodeId: "review-1",
  });
  const originatorOnly = makeTask({
    id: "task-originator",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });
  const hidden = makeTask({
    id: "task-hidden",
    currentOwner: "someone@example.com",
    participants: ["someone@example.com"],
  });

  const state = getApprovalWorkspaceTaskState({
    tasks: [originatorOnly, selected, hidden],
    templates: [template],
    selectedTaskId: "task-selected",
    activeUserEmail: "derrick@example.com",
  });

  assert.deepEqual(
    state.actionableTasks.map((task) => task.id),
    ["task-selected"],
  );
  assert.deepEqual(
    state.trackingTasks.map((task) => task.id),
    ["task-originator", "task-selected"],
  );
  assert.equal(state.selectedTask?.id, "task-selected");
  assert.equal(state.selectedTaskTemplate?.id, "finance-invoice");
  assert.deepEqual(
    state.selectedTaskMissingDocuments.map((document) => document.id),
    ["invoice-pdf"],
  );
});

test("falls back to first actionable task before tracking-only tasks", () => {
  const trackingOnly = makeTask({
    id: "tracking-only",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });
  const actionable = makeTask({ id: "actionable" });

  const state = getApprovalWorkspaceTaskState({
    tasks: [trackingOnly, actionable],
    templates: [template],
    selectedTaskId: "missing",
    activeUserEmail: "derrick@example.com",
  });

  assert.equal(state.selectedTask?.id, "actionable");
});

test("honors a selected tracking-only task when nothing is actionable", () => {
  const trackingOnly = makeTask({
    id: "tracking-only",
    currentOwner: "someone@example.com",
    participants: ["derrick@example.com"],
  });

  const state = getApprovalWorkspaceTaskState({
    tasks: [trackingOnly],
    templates: [template],
    selectedTaskId: "tracking-only",
    activeUserEmail: "derrick@example.com",
  });

  assert.deepEqual(state.actionableTasks, []);
  assert.equal(state.selectedTask?.id, "tracking-only");
});

test("tracking follows condition-routed workflow actions for previous, current, originator, and FYI users", () => {
  const conditionTemplate = {
    id: "condition-tracking",
    name: "Condition tracking workflow",
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
          id: "condition-1",
          kind: "condition",
          label: "Approval count condition",
          x: 480,
          y: 70,
          conditionCases: [
            {
              id: "case-2-of-2",
              name: "Both approve",
              approvalRule: {
                upstreamNodeIds: ["approval-1", "review-1"],
                minimumApproved: 2,
                mode: "at_least",
              },
              join: "and",
              targetNodeIds: ["fyi-1", "extra-review"],
            },
          ],
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
        { id: "end", kind: "end", label: "End", x: 960, y: 140 },
      ],
      edges: [
        {
          id: "edge-start-approval",
          sourceId: "start",
          targetId: "approval-1",
          label: "Start approval",
          branchType: "main",
        },
        {
          id: "edge-start-review",
          sourceId: "start",
          targetId: "review-1",
          label: "Start review",
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
          id: "edge-review-condition",
          sourceId: "review-1",
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
      ],
    },
  };
  const submitted = createApprovalTaskFromTemplate({
    id: "APR-TRACK",
    now: new Date("2026-06-23T09:00:00+08:00"),
    requester: { name: "Mandy Chan", email: "mandy@example.com" },
    template: conditionTemplate,
    extractedFields: { invoice_total: "HKD 12,000" },
  });

  const afterFirstApproval = applyTaskAction(submitted, {
    action: "approve",
    actor: { name: "Approver 1", email: "approver1@example.com" },
    template: conditionTemplate,
  });
  const approverTracking = getApprovalWorkspaceTaskState({
    tasks: [afterFirstApproval],
    templates: [conditionTemplate],
    selectedTaskId: "APR-TRACK",
    activeUserEmail: "approver1@example.com",
  });
  const reviewerTracking = getApprovalWorkspaceTaskState({
    tasks: [afterFirstApproval],
    templates: [conditionTemplate],
    selectedTaskId: "APR-TRACK",
    activeUserEmail: "reviewer1@example.com",
  });

  assert.deepEqual(approverTracking.actionableTasks, []);
  assert.equal(approverTracking.trackingTasks[0]?.id, "APR-TRACK");
  assert.equal(reviewerTracking.actionableTasks[0]?.id, "APR-TRACK");
  assert.equal(afterFirstApproval.currentOwner, "reviewer1@example.com");

  const afterConditionRoute = applyTaskAction(afterFirstApproval, {
    action: "approve",
    actor: { name: "Reviewer 1", email: "reviewer1@example.com" },
    template: conditionTemplate,
  });
  const originatorTracking = getApprovalWorkspaceTaskState({
    tasks: [afterConditionRoute],
    templates: [conditionTemplate],
    selectedTaskId: "APR-TRACK",
    activeUserEmail: "mandy@example.com",
  });
  const fyiTracking = getApprovalWorkspaceTaskState({
    tasks: [afterConditionRoute],
    templates: [conditionTemplate],
    selectedTaskId: "APR-TRACK",
    activeUserEmail: "finance.fyi@example.com",
  });
  const extraReviewerTracking = getApprovalWorkspaceTaskState({
    tasks: [afterConditionRoute],
    templates: [conditionTemplate],
    selectedTaskId: "APR-TRACK",
    activeUserEmail: "extra@example.com",
  });
  const nodesById = new Map(
    conditionTemplate.graph.nodes.map((node) => [node.id, node]),
  );

  assert.equal(afterConditionRoute.currentOwner, "extra@example.com");
  assert.equal(afterConditionRoute.currentNodeId, "extra-review");
  assert.equal(afterConditionRoute.activeBranchId, "case-2-of-2");
  assert.ok(afterConditionRoute.participants.includes("finance.fyi@example.com"));
  assert.equal(originatorTracking.trackingTasks[0]?.id, "APR-TRACK");
  assert.equal(fyiTracking.trackingTasks[0]?.id, "APR-TRACK");
  assert.equal(extraReviewerTracking.actionableTasks[0]?.id, "APR-TRACK");
  assert.equal(getPathNodeState(afterConditionRoute, nodesById.get("approval-1")), "approved");
  assert.equal(getPathNodeState(afterConditionRoute, nodesById.get("review-1")), "approved");
  assert.equal(getPathNodeState(afterConditionRoute, nodesById.get("fyi-1")), "notified");
  assert.equal(getPathNodeState(afterConditionRoute, nodesById.get("extra-review")), "current");
});
