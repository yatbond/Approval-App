import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addWorkflowBranch,
  addWorkflowConditionCase,
  addWorkflowDocumentToNode,
  addWorkflowNode,
  analyzeConditionCoverage,
  createWorkflowGraphFromTemplate,
  deleteWorkflowConditionCase,
  deleteWorkflowBranch,
  deleteWorkflowNode,
  findInitialWorkflowRoute,
  simulateWorkflowTemplate,
  updateWorkflowConditionCase,
  updateWorkflowDocumentRequirement,
  validateWorkflowTemplate,
} from "./workflow-graph.ts";

const template = {
  id: "finance-invoice",
  name: "Finance invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [
    {
      name: "invoice_total",
      label: "Invoice total",
      type: "currency",
      required: true,
      source: "ocr",
      instructions: "Use the grand total.",
    },
  ],
  steps: [
    {
      name: "Department review",
      role: "Department reviewer",
      approverName: "Department reviewer",
      approverEmail: "department@example.com",
      department: "Finance",
      dueInHours: 24,
      escalationRole: "Manager",
      escalationName: "Manager",
      escalationEmail: "manager@example.com",
      condition: "Always",
    },
    {
      name: "CFO approval",
      role: "CFO",
      approverName: "CFO delegate",
      approverEmail: "cfo@example.com",
      department: "Finance",
      dueInHours: 24,
      escalationRole: "CFO",
      escalationName: "CFO",
      escalationEmail: "cfo.escalation@example.com",
      condition: "invoice_total >= 10000",
    },
  ],
};

test("creates a workflow graph from a linear template", () => {
  const graph = createWorkflowGraphFromTemplate(template);

  assert.deepEqual(
    graph.nodes.map((node) => node.kind),
    ["start", "approval", "approval", "end"],
  );
  assert.deepEqual(
    graph.edges.map((edge) => [edge.sourceId, edge.targetId, edge.branchType]),
    [
      ["start", "step-1", "main"],
      ["step-1", "step-2", "main"],
      ["step-2", "end", "main"],
    ],
  );
  assert.deepEqual(graph.nodes.find((node) => node.id === "step-1")?.documentIds, [
    "invoice",
  ]);
});

test("adds a dropdown condition branch", () => {
  const graph = createWorkflowGraphFromTemplate(template);
  const cfoNode = graph.nodes.find((node) => node.label === "CFO approval");
  assert.ok(cfoNode);

  const next = addWorkflowBranch(graph, {
    sourceId: "step-1",
    targetId: cfoNode.id,
    branchType: "condition",
    label: "Invoice total >= 10000",
    rule: {
      field: "invoice_total",
      operator: ">=",
      value: "10000",
    },
  });

  const branch = next.edges.at(-1);
  assert.equal(branch.branchType, "condition");
  assert.deepEqual(branch.rule, {
    field: "invoice_total",
    operator: ">=",
    value: "10000",
  });
});

test("adds a non-blocking for-information node and branch", () => {
  const graph = createWorkflowGraphFromTemplate(template);
  const withNode = addWorkflowNode(graph, "for_information", {
    label: "Notify Finance Manager",
    assigneeName: "Finance Manager",
    assigneeEmail: "finance.manager@example.com",
  });
  const infoNode = withNode.nodes.at(-1);
  const withBranch = addWorkflowBranch(withNode, {
    sourceId: "step-1",
    targetId: infoNode.id,
    branchType: "for_information",
    label: "For information",
    blocking: false,
  });

  assert.equal(infoNode.kind, "for_information");
  assert.equal(infoNode.blocking, false);
  assert.equal(withBranch.edges.at(-1).blocking, false);
});

test("adds a return-reject node", () => {
  const graph = createWorkflowGraphFromTemplate(template);
  const withNode = addWorkflowNode(graph, "return_reject", {
    label: "Return to originator",
  });
  const rejectNode = withNode.nodes.at(-1);

  assert.equal(rejectNode.kind, "return_reject");
  assert.equal(rejectNode.blocking, false);
});

test("adds a document requirement to a workflow box", () => {
  const updated = addWorkflowDocumentToNode(template, "step-1", {
    documentType: "Doctor slip",
    format: "image",
    required: true,
    fields: [
      {
        name: "sick_leave_date",
        label: "Sick leave date",
        type: "date",
        required: true,
        source: "ocr",
        instructions: "Extract the sick leave date from the document.",
      },
    ],
  });
  const createdDocument = updated.documents.at(-1);
  const graphNode = updated.graph?.nodes.find((node) => node.id === "step-1");

  assert.equal(createdDocument?.documentType, "Doctor slip");
  assert.equal(createdDocument?.required, true);
  assert.equal(graphNode?.documentIds?.includes(createdDocument?.id || ""), true);
});

test("updates a workflow box document attachment configuration", () => {
  const updated = updateWorkflowDocumentRequirement(template, "invoice", {
    documentType: "Receipt",
    format: "image",
    required: false,
  });

  assert.equal(updated.documents[0].documentType, "Receipt");
  assert.equal(updated.documents[0].format, "image");
  assert.equal(updated.documents[0].required, false);
  assert.deepEqual(updated.documentTypes, ["Receipt"]);
});

test("deletes a workflow box and its connected branches", () => {
  const graph = createWorkflowGraphFromTemplate(template);
  const next = deleteWorkflowNode(graph, "step-1");

  assert.equal(next.nodes.some((node) => node.id === "step-1"), false);
  assert.equal(
    next.edges.some((edge) => edge.sourceId === "step-1" || edge.targetId === "step-1"),
    false,
  );
});

test("deletes a workflow branch", () => {
  const graph = createWorkflowGraphFromTemplate(template);
  const edgeId = graph.edges[0].id;
  const next = deleteWorkflowBranch(graph, edgeId);

  assert.equal(next.edges.some((edge) => edge.id === edgeId), false);
});

test("finds initial route from the canvas graph", () => {
  const graph = createWorkflowGraphFromTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 200,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance.reviewer@example.com",
          dueInHours: 12,
          escalationName: "Finance Manager",
          escalationEmail: "finance.manager@example.com",
          blocking: true,
        },
        {
          id: "info-1",
          kind: "for_information",
          label: "Notify CFO",
          x: 200,
          y: 160,
          assigneeName: "CFO",
          assigneeEmail: "cfo@example.com",
          blocking: false,
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceId: "start",
          targetId: "approval-1",
          label: "Submit",
          branchType: "main",
          blocking: true,
        },
        {
          id: "edge-2",
          sourceId: "start",
          targetId: "info-1",
          label: "FYI",
          branchType: "for_information",
          blocking: false,
        },
      ],
    },
  });
  const route = findInitialWorkflowRoute(graph);

  assert.equal(route.currentNode?.id, "approval-1");
  assert.equal(route.currentNode?.assigneeEmail, "finance.reviewer@example.com");
  assert.deepEqual(route.notifiedNodes.map((node) => node.id), ["info-1"]);
});

test("finds initial routes for supported parallel canvas combinations", () => {
  const cases = [
    {
      name: "direct approval and review split",
      nodes: [
        {
          id: "approval-1",
          kind: "approval",
          label: "Approval 1",
          x: 200,
          y: 0,
          assigneeEmail: "approval1@example.com",
        },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 200,
          y: 140,
          assigneeEmail: "review1@example.com",
        },
      ],
      edges: [
        ["start", "approval-1", "main"],
        ["start", "review-1", "main"],
      ],
      fields: {},
      expectedCurrentNodeIds: ["approval-1", "review-1"],
      expectedNotifiedNodeIds: [],
    },
    {
      name: "parallel submit boxes route to separate actors",
      nodes: [
        {
          id: "submit-site",
          kind: "submit_request",
          label: "Site submission",
          x: 200,
          y: 0,
        },
        {
          id: "submit-qs",
          kind: "submit_request",
          label: "QS submission",
          x: 200,
          y: 140,
        },
        {
          id: "site-review",
          kind: "review",
          label: "Site review",
          x: 440,
          y: 0,
          assigneeEmail: "site@example.com",
        },
        {
          id: "qs-review",
          kind: "review",
          label: "QS review",
          x: 440,
          y: 140,
          assigneeEmail: "qs@example.com",
        },
      ],
      edges: [
        ["start", "submit-site", "main"],
        ["start", "submit-qs", "main"],
        ["submit-site", "site-review", "main"],
        ["submit-qs", "qs-review", "main"],
      ],
      fields: {},
      expectedCurrentNodeIds: ["site-review", "qs-review"],
      expectedNotifiedNodeIds: [],
    },
    {
      name: "mixed direct and submit split",
      nodes: [
        {
          id: "submit-qs",
          kind: "submit_request",
          label: "QS submission",
          x: 200,
          y: 0,
        },
        {
          id: "qs-review",
          kind: "review",
          label: "QS review",
          x: 440,
          y: 0,
          assigneeEmail: "qs@example.com",
        },
        {
          id: "director-approval",
          kind: "approval",
          label: "Director approval",
          x: 200,
          y: 140,
          assigneeEmail: "director@example.com",
        },
      ],
      edges: [
        ["start", "submit-qs", "main"],
        ["start", "director-approval", "main"],
        ["submit-qs", "qs-review", "main"],
      ],
      fields: {},
      expectedCurrentNodeIds: ["qs-review", "director-approval"],
      expectedNotifiedNodeIds: [],
    },
    {
      name: "submit condition routes to FYI and review",
      nodes: [
        {
          id: "submit-invoice",
          kind: "submit_request",
          label: "Invoice submission",
          x: 200,
          y: 0,
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Amount routing",
          x: 440,
          y: 0,
          conditionCases: [
            {
              id: "case-high",
              name: "High amount",
              numericRule: { field: "invoice_total", operator: ">", value: "5000" },
              join: "and",
              targetNodeIds: ["finance-fyi", "finance-review"],
            },
          ],
        },
        {
          id: "finance-fyi",
          kind: "for_information",
          label: "Finance FYI",
          x: 680,
          y: -80,
          assigneeEmail: "finance@example.com",
        },
        {
          id: "finance-review",
          kind: "review",
          label: "Finance review",
          x: 680,
          y: 80,
          assigneeEmail: "review@example.com",
        },
      ],
      edges: [
        ["start", "submit-invoice", "main"],
        ["submit-invoice", "condition-1", "main"],
      ],
      fields: { invoice_total: "HKD 8,400" },
      expectedCurrentNodeIds: ["finance-review"],
      expectedNotifiedNodeIds: ["finance-fyi"],
    },
    {
      name: "parallel submit boxes join to one shared actor",
      nodes: [
        {
          id: "submit-site",
          kind: "submit_request",
          label: "Site submission",
          x: 200,
          y: 0,
        },
        {
          id: "submit-qs",
          kind: "submit_request",
          label: "QS submission",
          x: 200,
          y: 140,
        },
        {
          id: "joint-review",
          kind: "review",
          label: "Joint review",
          x: 440,
          y: 70,
          assigneeEmail: "joint@example.com",
        },
      ],
      edges: [
        ["start", "submit-site", "main"],
        ["start", "submit-qs", "main"],
        ["submit-site", "joint-review", "main"],
        ["submit-qs", "joint-review", "main"],
      ],
      fields: {},
      expectedCurrentNodeIds: ["joint-review"],
      expectedNotifiedNodeIds: [],
    },
  ];

  cases.forEach((routeCase) => {
    const graph = createWorkflowGraphFromTemplate({
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          ...routeCase.nodes,
        ],
        edges: routeCase.edges.map(([sourceId, targetId, branchType]) => ({
          id: `edge-${sourceId}-${targetId}`,
          sourceId,
          targetId,
          label: "Next",
          branchType,
        })),
      },
    });

    const route = findInitialWorkflowRoute(graph, {
      extractedFields: routeCase.fields,
    });

    assert.deepEqual(
      route.currentNodes.map((node) => node.id),
      routeCase.expectedCurrentNodeIds,
      routeCase.name,
    );
    assert.deepEqual(
      route.notifiedNodes.map((node) => node.id),
      routeCase.expectedNotifiedNodeIds,
      routeCase.name,
    );
  });
});

test("validates missing first approver and document extraction fields", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    documents: [
      {
        id: "invoice",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [],
      },
    ],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "document-invoice",
          kind: "document",
          label: "Invoice",
          x: 180,
          y: 0,
          documentIds: ["invoice"],
          blocking: true,
        },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 360,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "",
          blocking: true,
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceId: "start",
          targetId: "document-invoice",
          label: "Submit",
          branchType: "main",
          blocking: true,
        },
        {
          id: "edge-2",
          sourceId: "document-invoice",
          targetId: "approval-1",
          label: "Next",
          branchType: "main",
          blocking: true,
        },
      ],
    },
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.nodeId === "approval-1" &&
        issue.message.includes("Person email"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.severity === "warning" &&
        issue.nodeId === "approval-1" &&
        issue.message.includes("no fields"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.message.includes("first approver"),
    ),
  );
});

test("warns when condition outcomes can both match the same numeric field", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 160,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Amount routing",
          x: 320,
          y: 0,
        },
        {
          id: "cfo",
          kind: "approval",
          label: "CFO approval",
          x: 520,
          y: -80,
          assigneeName: "CFO",
          assigneeEmail: "cfo@example.com",
        },
        {
          id: "director",
          kind: "approval",
          label: "Director approval",
          x: 520,
          y: 80,
          assigneeName: "Director",
          assigneeEmail: "director@example.com",
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
          id: "edge-high",
          sourceId: "condition-1",
          targetId: "cfo",
          label: "High amount",
          branchType: "condition",
          rule: { field: "invoice_total", operator: ">=", value: "10000" },
        },
        {
          id: "edge-also-high",
          sourceId: "condition-1",
          targetId: "director",
          label: "Also high amount",
          branchType: "condition",
          rule: { field: "invoice_total", operator: ">", value: "5000" },
        },
      ],
    },
  });

  assert.ok(
    issues.some((issue) => issue.message.includes("can both match invoice_total")),
  );
});

test("warns when connected boxes cannot be reached from start", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 160,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance@example.com",
        },
        {
          id: "orphan-review",
          kind: "review",
          label: "Unreachable review",
          x: 160,
          y: 180,
          assigneeEmail: "review@example.com",
        },
        {
          id: "orphan-approval",
          kind: "approval",
          label: "Unreachable approval",
          x: 320,
          y: 180,
          assigneeEmail: "approval@example.com",
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
          id: "edge-orphan",
          sourceId: "orphan-review",
          targetId: "orphan-approval",
          label: "Next",
          branchType: "main",
        },
      ],
    },
  });

  assert.ok(
    issues.some(
      (issue) =>
        issue.nodeId === "orphan-review" &&
        issue.message.includes("cannot be reached from Start"),
    ),
  );
});

test("warns when condition numeric fields are not extracted", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    fields: [],
    documents: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 160,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Amount routing",
          x: 320,
          y: 0,
          conditionCases: [
            {
              id: "case-1",
              name: "High quantity",
              numericRule: { field: "quantity", operator: ">=", value: "10" },
              join: "and",
              targetNodeIds: ["approval-2"],
            },
          ],
        },
        {
          id: "approval-2",
          kind: "approval",
          label: "Second approval",
          x: 520,
          y: 0,
          assigneeEmail: "second@example.com",
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
      ],
    },
  });

  assert.ok(
    issues.some((issue) =>
      issue.message.includes("no upstream document extracts that numeric field"),
    ),
  );
});

test("adds and updates named condition cases with multiple outcome boxes", () => {
  const graph = createWorkflowGraphFromTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 120,
          y: 0,
          assigneeEmail: "review1@example.com",
        },
        {
          id: "review-2",
          kind: "review",
          label: "Review 2",
          x: 120,
          y: 120,
          assigneeEmail: "review2@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Approval count",
          x: 320,
          y: 60,
        },
        {
          id: "cfo",
          kind: "approval",
          label: "CFO approval",
          x: 520,
          y: 0,
          assigneeEmail: "cfo@example.com",
        },
        {
          id: "finance-fyi",
          kind: "for_information",
          label: "Finance FYI",
          x: 520,
          y: 140,
          assigneeEmail: "finance@example.com",
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
      ],
    },
  });

  const withCase = addWorkflowConditionCase(graph, "condition-1", [
    "review-1",
    "review-2",
  ]);
  const conditionCase = withCase.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases?.[0];

  assert.equal(conditionCase?.name, "Condition 1");
  assert.equal(conditionCase?.approvalRule?.minimumApproved, 1);

  const updated = updateWorkflowConditionCase(
    withCase,
    "condition-1",
    conditionCase.id,
    {
      name: "2 out of 2 approve",
      approvalRule: {
        upstreamNodeIds: ["review-1", "review-2"],
        minimumApproved: 2,
      },
      targetNodeIds: ["cfo", "finance-fyi"],
    },
  );
  const updatedCase = updated.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases?.[0];

  assert.equal(updatedCase?.name, "2 out of 2 approve");
  assert.deepEqual(updatedCase?.targetNodeIds, ["cfo", "finance-fyi"]);

  const deleted = deleteWorkflowConditionCase(
    updated,
    "condition-1",
    conditionCase.id,
  );
  assert.equal(
    deleted.nodes.find((node) => node.id === "condition-1")?.conditionCases?.length,
    0,
  );
});

test("adds new condition cases before the fallback case", () => {
  const graph = createWorkflowGraphFromTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 120,
          y: 0,
          assigneeEmail: "review1@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Approval routing",
          x: 320,
          y: 0,
          conditionCases: [
            {
              id: "fallback",
              name: "All other conditions",
              isFallback: true,
              join: "and",
              targetNodeIds: ["end"],
            },
          ],
        },
        {
          id: "end",
          kind: "end",
          label: "End",
          x: 520,
          y: 0,
        },
      ],
      edges: [
        {
          id: "edge-review-condition",
          sourceId: "review-1",
          targetId: "condition-1",
          label: "Done",
          branchType: "main",
        },
      ],
    },
  });

  const withCondition = addWorkflowConditionCase(graph, "condition-1", ["review-1"]);
  const conditionCases = withCondition.nodes.find((node) => node.id === "condition-1")
    ?.conditionCases;

  assert.equal(conditionCases?.[0].name, "Condition 1");
  assert.equal(conditionCases?.[1].isFallback, true);
});

test("warns when a numbered condition has no rule", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Review",
          x: 160,
          y: 0,
          assigneeEmail: "review@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Approval routing",
          x: 320,
          y: 0,
          conditionCases: [
            {
              id: "case-1",
              name: "Special route",
              join: "and",
              targetNodeIds: ["end"],
            },
          ],
        },
        { id: "end", kind: "end", label: "End", x: 520, y: 0 },
      ],
      edges: [
        {
          id: "edge-start-approval",
          sourceId: "start",
          targetId: "approval-1",
          label: "Start",
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
  });

  assert.ok(
    issues.some((issue) =>
      issue.message.includes(
        "Approval routing: Condition 1 - Special route has no rule.",
      ),
    ),
  );
});

test("warns when approval condition cases can both match", () => {
  const issues = validateWorkflowTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 160,
          y: -80,
          assigneeEmail: "review1@example.com",
        },
        {
          id: "review-2",
          kind: "review",
          label: "Review 2",
          x: 160,
          y: 80,
          assigneeEmail: "review2@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Approval routing",
          x: 360,
          y: 0,
          conditionCases: [
            {
              id: "case-specific",
              name: "Reviews 1 and 2",
              approvalRule: {
                upstreamNodeIds: ["review-1", "review-2"],
                minimumApproved: 2,
                mode: "at_least",
              },
              join: "and",
              targetNodeIds: ["end"],
            },
            {
              id: "case-count",
              name: "Two of two",
              isApprovalCount: true,
              approvalRule: {
                upstreamNodeIds: ["review-1", "review-2"],
                minimumApproved: 2,
                mode: "exactly",
              },
              join: "and",
              targetNodeIds: ["end"],
            },
          ],
        },
        { id: "end", kind: "end", label: "End", x: 560, y: 0 },
      ],
      edges: [
        {
          id: "edge-start-review-1",
          sourceId: "start",
          targetId: "review-1",
          label: "Start",
          branchType: "main",
        },
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
      ],
    },
  });

  assert.ok(
    issues.some((issue) =>
      issue.message.includes(
        "Approval routing: Condition 1 - Reviews 1 and 2 and Condition 2 - Two of two can both match the same request.",
      ),
    ),
  );
});

test("detects missing approval count coverage for condition cases", () => {
  const graph = {
    nodes: [
      { id: "review-1", kind: "review", label: "Review 1", x: 0, y: 0 },
      { id: "review-2", kind: "review", label: "Review 2", x: 0, y: 120 },
      { id: "review-3", kind: "review", label: "Review 3", x: 0, y: 240 },
      {
        id: "condition-1",
        kind: "condition",
        label: "Approval count",
        x: 240,
        y: 120,
        conditionCases: [
          {
            id: "case-1",
            name: "2 out of 3 approve",
            approvalRule: {
              upstreamNodeIds: ["review-1", "review-2", "review-3"],
              minimumApproved: 2,
            },
            join: "and",
            targetNodeIds: ["approval-1"],
          },
        ],
      },
      { id: "approval-1", kind: "approval", label: "Approval", x: 480, y: 120 },
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
  };

  const coverage = analyzeConditionCoverage(graph, "condition-1");
  assert.deepEqual(coverage?.missingApprovalCounts, [0, 1]);
});

test("fallback condition suppresses missing approval coverage warning", () => {
  const graph = {
    nodes: [
      { id: "review-1", kind: "review", label: "Review 1", x: 0, y: 0 },
      { id: "review-2", kind: "review", label: "Review 2", x: 0, y: 120 },
      {
        id: "condition-1",
        kind: "condition",
        label: "Approval count",
        x: 240,
        y: 60,
        conditionCases: [
          {
            id: "case-1",
            name: "Review 1 approved",
            approvalRule: {
              upstreamNodeIds: ["review-1"],
              minimumApproved: 1,
              mode: "at_least",
            },
            join: "and",
            targetNodeIds: ["approval-1"],
          },
          {
            id: "case-fallback",
            name: "All other conditions",
            isFallback: true,
            join: "and",
            targetNodeIds: ["return-1"],
          },
        ],
      },
      { id: "approval-1", kind: "approval", label: "Approval", x: 480, y: 0 },
      { id: "return-1", kind: "return_reject", label: "Return", x: 480, y: 120 },
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
    ],
  };

  assert.equal(analyzeConditionCoverage(graph, "condition-1"), undefined);
});

test("uses user-facing condition validation messages", () => {
  const simulated = simulateWorkflowTemplate({
    id: "condition-copy",
    name: "Condition copy",
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
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 180,
          y: 0,
          assigneeEmail: "review1@example.com",
        },
        {
          id: "condition-1",
          kind: "condition",
          label: "Condition 1",
          x: 360,
          y: 0,
          conditionCases: [
            {
              id: "case-1",
              name: "Condition 1",
              approvalRule: {
                upstreamNodeIds: ["review-1"],
                minimumApproved: 1,
                mode: "at_least",
              },
              join: "and",
              targetNodeIds: [],
            },
          ],
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
          id: "edge-review-condition",
          sourceId: "review-1",
          targetId: "condition-1",
          label: "Next",
          branchType: "main",
        },
      ],
    },
  });

  assert.ok(
    simulated.issues.some((issue) =>
      issue.message.includes("Condition 1: Condition 1 has no outcome boxes selected."),
    ),
  );
  assert.ok(
    simulated.issues.some((issue) =>
      issue.message.includes("Condition 1: 0 approved upstream box(es) are not routed."),
    ),
  );
});

test("simulates the starting workflow route", () => {
  const simulated = simulateWorkflowTemplate({
    ...template,
    documents: [
      {
        id: "invoice",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [
          {
            name: "vendor",
            label: "Vendor",
            type: "text",
            required: true,
            source: "ocr",
            instructions: "Extract the vendor.",
            documentId: "invoice",
          },
        ],
      },
      {
        id: "quote",
        documentType: "Quote",
        format: "pdf",
        required: false,
        fields: [],
      },
    ],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "document-invoice",
          kind: "document",
          label: "Invoice",
          x: 180,
          y: 0,
          documentIds: ["invoice"],
          blocking: true,
        },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 360,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance.reviewer@example.com",
          documentIds: ["quote"],
          blocking: true,
        },
        {
          id: "info-1",
          kind: "for_information",
          label: "Notify CFO",
          x: 360,
          y: 180,
          assigneeName: "CFO",
          assigneeEmail: "cfo@example.com",
          blocking: false,
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceId: "start",
          targetId: "document-invoice",
          label: "Submit",
          branchType: "main",
          blocking: true,
        },
        {
          id: "edge-2",
          sourceId: "document-invoice",
          targetId: "approval-1",
          label: "Next",
          branchType: "main",
          blocking: true,
        },
        {
          id: "edge-3",
          sourceId: "start",
          targetId: "info-1",
          label: "FYI",
          branchType: "for_information",
          blocking: false,
        },
      ],
    },
  });

  assert.equal(simulated.currentNode?.id, "approval-1");
  assert.deepEqual(
    simulated.notifiedNodes.map((node) => node.id),
    ["info-1"],
  );
  assert.deepEqual(
    simulated.requiredDocuments.map((document) => document.id),
    ["invoice", "quote"],
  );
  assert.equal(simulated.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("collapses saved document boxes into the next approval box", () => {
  const graph = createWorkflowGraphFromTemplate({
    ...template,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "document-invoice",
          kind: "document",
          label: "Invoice",
          x: 180,
          y: 0,
          documentIds: ["invoice"],
          blocking: true,
        },
        {
          id: "approval-1",
          kind: "approval",
          label: "Finance approval",
          x: 360,
          y: 0,
          assigneeName: "Finance Reviewer",
          assigneeEmail: "finance.reviewer@example.com",
          blocking: true,
        },
      ],
      edges: [
        {
          id: "edge-1",
          sourceId: "start",
          targetId: "document-invoice",
          label: "Submit",
          branchType: "main",
          blocking: true,
        },
        {
          id: "edge-2",
          sourceId: "document-invoice",
          targetId: "approval-1",
          label: "Next",
          branchType: "main",
          blocking: true,
        },
      ],
    },
  });

  assert.equal(graph.nodes.some((node) => node.kind === "document"), false);
  assert.deepEqual(
    graph.edges.map((edge) => [edge.sourceId, edge.targetId]),
    [["start", "approval-1"]],
  );
  assert.deepEqual(graph.nodes.find((node) => node.id === "approval-1")?.documentIds, [
    "invoice",
  ]);
});
