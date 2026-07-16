import assert from "node:assert/strict";
import test from "node:test";
import { applyTaskAction } from "./approval-state.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import { validateWorkflowTemplate } from "./workflow-graph.ts";

const requester = { name: "Request Owner", email: "owner@example.com" };

function makeTemplate(nodes, edges, fields = []) {
  return {
    id: "matrix-workflow",
    name: "Matrix workflow",
    business: "Chun Wo",
    department: "Commercial",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields,
    steps: [],
    graph: { nodes, edges },
  };
}

function createTask(template, extractedFields = {}) {
  return createApprovalTaskFromTemplate({
    id: "APR-COMBINATION-MATRIX",
    now: new Date("2026-07-16T09:00:00+08:00"),
    requester,
    template,
    extractedFields,
  });
}

function act(task, template, action, email = task.currentOwner, extra = {}) {
  return applyTaskAction(task, {
    action,
    actor: { name: email.split("@")[0], email },
    template,
    ...extra,
  });
}

function approveUntilClosed(task, template) {
  let current = task;
  for (let attempt = 0; attempt < 20 && current.status !== "approved"; attempt += 1) {
    assert.ok(current.currentOwner, `missing owner while ${current.status}`);
    const next = act(current, template, "approve");
    assert.notEqual(next, current, `approval was blocked at ${current.currentNodeId}`);
    current = next;
  }
  assert.equal(current.status, "approved");
  return current;
}

function makeLinearTemplate(approvalCount, fyiMask) {
  const nodes = [
    { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
    { id: "submit", kind: "submit_request", label: "Submit", x: 160, y: 0, documentIds: [] },
  ];
  const edges = [
    { id: "start-submit", sourceId: "start", targetId: "submit", label: "Start", branchType: "main" },
  ];

  for (let index = 0; index < approvalCount; index += 1) {
    const id = `approval-${index + 1}`;
    nodes.push({
      id,
      kind: "approval",
      label: `Approval ${index + 1}`,
      x: 320 + index * 200,
      y: 0,
      assigneeEmail: `approver${index + 1}@example.com`,
    });
    edges.push({
      id: index === 0 ? "submit-approval-1" : `approval-${index}-approval-${index + 1}`,
      sourceId: index === 0 ? "submit" : `approval-${index}`,
      targetId: id,
      label: "Continue",
      branchType: index === 0 ? "main" : "approved",
    });

    if ((fyiMask & (1 << index)) !== 0) {
      const fyiId = `fyi-${index + 1}`;
      nodes.push({
        id: fyiId,
        kind: "for_information",
        label: `FYI ${index + 1}`,
        x: 320 + index * 200,
        y: 140,
        assigneeEmail: `fyi${index + 1}@example.com`,
        blocking: false,
      });
      edges.push({
        id: `${id}-${fyiId}`,
        sourceId: id,
        targetId: fyiId,
        label: "FYI",
        branchType: "for_information",
        blocking: false,
      });
    }
  }

  nodes.push({ id: "end", kind: "end", label: "End", x: 1000, y: 0 });
  edges.push({
    id: "last-approval-end",
    sourceId: `approval-${approvalCount}`,
    targetId: "end",
    label: "Approved",
    branchType: "approved",
  });
  return makeTemplate(nodes, edges);
}

test("linear Approval and FYI combinations complete and notify the selected FYI boxes", () => {
  let scenarioCount = 0;
  for (let approvalCount = 1; approvalCount <= 3; approvalCount += 1) {
    for (let fyiMask = 0; fyiMask < 2 ** approvalCount; fyiMask += 1) {
      scenarioCount += 1;
      const template = makeLinearTemplate(approvalCount, fyiMask);
      assert.deepEqual(
        validateWorkflowTemplate(template).filter((issue) => issue.severity === "error"),
        [],
      );
      const completed = approveUntilClosed(createTask(template), template);
      const expectedFyiIds = Array.from({ length: approvalCount }, (_, index) => index + 1)
        .filter((number) => (fyiMask & (1 << (number - 1))) !== 0)
        .map((number) => `fyi-${number}`);
      assert.deepEqual(completed.notifiedNodeIds || [], expectedFyiIds);
      assert.ok(completed.completedNodeIds.includes("end"));
    }
  }
  assert.equal(scenarioCount, 14);
});

test("reject at every linear Approval position can return, resubmit, and finish", () => {
  let scenarioCount = 0;
  for (let approvalCount = 1; approvalCount <= 3; approvalCount += 1) {
    for (let rejectIndex = 0; rejectIndex < approvalCount; rejectIndex += 1) {
      scenarioCount += 1;
      const template = makeLinearTemplate(approvalCount, 0);
      let task = createTask(template);
      for (let index = 0; index < rejectIndex; index += 1) {
        task = act(task, template, "approve");
      }
      task = act(task, template, "reject_with_comment", task.currentOwner, {
        comment: `Correction required at stage ${rejectIndex + 1}`,
      });
      assert.equal(task.status, "returned");
      assert.equal(task.currentOwner, requester.email);
      assert.match(task.auditTrail.at(-1).detail, /Correction required/);

      task = act(task, template, "amend_resubmit", requester.email, {
        comment: "Corrected and resubmitted",
      });
      assert.equal(task.status, "pending");
      const completed = approveUntilClosed(task, template);
      assert.equal(completed.currentOwner, "");
    }
  }
  assert.equal(scenarioCount, 6);
});

function makeParallelConditionTemplate(approvalCount) {
  const approvalIds = Array.from({ length: approvalCount }, (_, index) => `parallel-${index + 1}`);
  const outcomeNodes = Array.from({ length: approvalCount + 1 }, (_, approved) => ({
    id: `outcome-${approved}`,
    kind: "approval",
    label: `${approved} approved outcome`,
    x: 720,
    y: approved * 120,
    assigneeEmail: `outcome${approved}@example.com`,
  }));
  const nodes = [
    { id: "start", kind: "start", label: "Start", x: 0, y: 100 },
    ...approvalIds.map((id, index) => ({
      id,
      kind: "approval",
      label: `Parallel ${index + 1}`,
      x: 220,
      y: index * 140,
      assigneeEmail: `parallel${index + 1}@example.com`,
    })),
    {
      id: "condition",
      kind: "condition",
      label: "Approval result",
      x: 480,
      y: 100,
      conditionCases: Array.from({ length: approvalCount + 1 }, (_, approved) => ({
        id: `exact-${approved}`,
        name: `Exactly ${approved} approved`,
        approvalRule: {
          upstreamNodeIds: approvalIds,
          minimumApproved: approved,
          mode: "exactly",
        },
        join: "and",
        targetNodeIds: [`outcome-${approved}`],
      })),
    },
    ...outcomeNodes,
    { id: "end", kind: "end", label: "End", x: 720, y: 100 },
  ];
  const edges = [
    ...approvalIds.flatMap((id) => [
    { id: `start-${id}`, sourceId: "start", targetId: id, label: "Start", branchType: "main" },
    { id: `${id}-approved-condition`, sourceId: id, targetId: "condition", label: "Approved", branchType: "approved" },
    { id: `${id}-rejected-condition`, sourceId: id, targetId: "condition", label: "Rejected", branchType: "rejected" },
    ]),
    ...outcomeNodes.map((node) => ({
      id: `${node.id}-end`,
      sourceId: node.id,
      targetId: "end",
      label: "Approved",
      branchType: "approved",
    })),
  ];
  return makeTemplate(nodes, edges);
}

test("every parallel Approval decision vector reaches its exact-count condition", () => {
  let scenarioCount = 0;
  for (const approvalCount of [2, 3]) {
    for (let decisionMask = 0; decisionMask < 2 ** approvalCount; decisionMask += 1) {
      scenarioCount += 1;
      const template = makeParallelConditionTemplate(approvalCount);
      const validationErrors = validateWorkflowTemplate(template).filter(
        (issue) => issue.severity === "error",
      );
      assert.deepEqual(validationErrors, []);
      let task = createTask(template);
      for (let index = 0; index < approvalCount; index += 1) {
        const email = `parallel${index + 1}@example.com`;
        const decision = (decisionMask & (1 << index)) !== 0 ? "approve" : "reject";
        task = act(task, template, decision, email);
        if (index < approvalCount - 1) {
          assert.equal(task.status, "pending");
        }
      }
      const approvedCount = decisionMask.toString(2).split("1").length - 1;
      assert.equal(task.status, "pending", `${approvalCount} approvals / mask ${decisionMask}`);
      assert.equal(
        task.activeBranchId,
        `exact-${approvedCount}`,
        `${approvalCount} approvals / mask ${decisionMask}`,
      );
      assert.equal(Object.keys(task.nodeDecisions || {}).length, approvalCount);
      assert.equal(task.currentNodeId, `outcome-${approvedCount}`);
      task = act(task, template, "approve");
      assert.equal(task.status, "approved");
    }
  }
  assert.equal(scenarioCount, 12);
});

const numericScenarios = [
  { operator: "=", match: "1,000.00", miss: "999", expected: "1000" },
  { operator: "!=", match: "999", miss: "1,000", expected: "1000" },
  { operator: ">", match: "1001", miss: "1000", expected: "1000" },
  { operator: ">=", match: "1000", miss: "999", expected: "1000" },
  { operator: "<", match: "999", miss: "1000", expected: "1000" },
  { operator: "<=", match: "1000", miss: "1001", expected: "1000" },
  { operator: "contains", match: "Purchase Order 123", miss: "Invoice 123", expected: "order" },
];

function makeNumericTemplate(operator, expected) {
  return makeTemplate(
    [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "approval", kind: "approval", label: "Approval", x: 200, y: 0, assigneeEmail: "approver@example.com" },
      {
        id: "condition",
        kind: "condition",
        label: "Value condition",
        x: 400,
        y: 0,
        conditionCases: [
          {
            id: "matched",
            name: "Matched",
            numericRule: { field: "matrix_value", operator, value: expected },
            join: "and",
            targetNodeIds: ["end"],
          },
          {
            id: "fallback",
            name: "Fallback",
            isFallback: true,
            join: "and",
            targetNodeIds: ["fallback-approval"],
          },
        ],
      },
      { id: "fallback-approval", kind: "approval", label: "Fallback approval", x: 600, y: 100, assigneeEmail: "fallback@example.com" },
      { id: "end", kind: "end", label: "End", x: 800, y: 0 },
    ],
    [
      { id: "start-approval", sourceId: "start", targetId: "approval", label: "Start", branchType: "main" },
      { id: "approval-condition", sourceId: "approval", targetId: "condition", label: "Approved", branchType: "approved" },
      { id: "fallback-end", sourceId: "fallback-approval", targetId: "end", label: "Approved", branchType: "approved" },
    ],
    [{ name: "matrix_value", label: "Matrix value", type: "text", required: true, source: "manual", instructions: "Enter a value." }],
  );
}

test("every numeric condition operator routes both matching and fallback values", () => {
  let scenarioCount = 0;
  for (const scenario of numericScenarios) {
    const template = makeNumericTemplate(scenario.operator, scenario.expected);
    for (const [value, expectedBranch] of [
      [scenario.match, "matched"],
      [scenario.miss, "fallback"],
    ]) {
      scenarioCount += 1;
      let task = act(createTask(template, { matrix_value: value }), template, "approve");
      assert.equal(task.activeBranchId, expectedBranch, `${scenario.operator}/${value}`);
      if (expectedBranch === "fallback") {
        assert.equal(task.currentOwner, "fallback@example.com");
        task = act(task, template, "approve");
      }
      assert.equal(task.status, "approved", `${scenario.operator}/${value}`);
    }
  }
  assert.equal(scenarioCount, 14);
});
