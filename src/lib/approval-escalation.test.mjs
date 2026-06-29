import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEscalationChecks } from "./approval-escalation.ts";

test("escalates overdue task to current node escalation email", () => {
  const tasks = [
    {
      id: "APR-1",
      title: "Invoice",
      workflow: "Finance approval",
      workflowTemplateId: "finance",
      requester: "Mandy",
      requesterEmail: "mandy@example.com",
      department: "Finance",
      status: "pending",
      due: "Overdue",
      dueAt: "2026-06-19T01:00:00.000Z",
      value: "HKD 1,000",
      currentStep: "Finance review",
      currentOwner: "reviewer@example.com",
      currentNodeId: "review-1",
      pendingNodeIds: ["review-1"],
      pendingOwners: ["reviewer@example.com"],
      participants: ["mandy@example.com", "reviewer@example.com"],
      lastAction: "Submitted",
      extractedFields: {},
      auditTrail: [],
    },
  ];
  const templates = [
    {
      id: "finance",
      name: "Finance approval",
      business: "Asia Allied Infrastructure",
      department: "Finance",
      documentTypes: [],
      documents: [],
      languages: ["English"],
      fields: [],
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
          {
            id: "review-1",
            kind: "review",
            label: "Finance review",
            x: 200,
            y: 0,
            assigneeEmail: "reviewer@example.com",
            escalationName: "Finance Head",
            escalationEmail: "finance.head@example.com",
          },
        ],
        edges: [],
      },
    },
  ];

  const [result] = applyEscalationChecks(
    tasks,
    templates,
    new Date("2026-06-20T01:00:00.000Z"),
  );

  assert.equal(result.status, "escalated");
  assert.equal(result.currentOwner, "finance.head@example.com");
  assert.deepEqual(result.pendingOwners, ["finance.head@example.com"]);
  assert.equal(result.auditTrail[0].action, "escalated");
});
