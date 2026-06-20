import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseWorkspaceState,
  serializeWorkspaceState,
} from "./workspace-persistence.ts";

test("serializes and parses workspace state", () => {
  const state = {
    selectedTemplateId: "template-1",
    approvalTasks: [
      {
        id: "APR-1",
        title: "Request 1",
        workflow: "Template 1",
        requester: "Derrick",
        requesterEmail: "derrick@example.com",
        department: "Finance",
        status: "pending",
        due: "Today",
        value: "HKD 100",
        currentStep: "Approval",
        currentOwner: "approver@example.com",
        participants: ["derrick@example.com", "approver@example.com"],
        lastAction: "Submitted",
        extractedFields: { Total: "HKD 100" },
        auditTrail: [],
      },
    ],
    businessDirectory: [
      {
        id: "business-1",
        name: "Business 1",
        departments: ["Finance"],
      },
    ],
    workflowTemplates: [
      {
        id: "template-1",
        name: "Template 1",
        business: "Business 1",
        department: "Finance",
        documentTypes: ["Invoice"],
        documents: [
          {
            id: "document-1",
            documentType: "Invoice",
            format: "pdf",
            required: true,
            fields: [],
          },
        ],
        languages: ["English"],
        fields: [],
        steps: [
          {
            name: "Finance approval 1",
            role: "Approver",
            approverName: "Approver",
            approverEmail: "approver@example.com",
            department: "Finance",
            dueInHours: 24,
            escalationRole: "Manager",
            escalationName: "Manager",
            escalationEmail: "manager@example.com",
            condition: "Always",
          },
        ],
      },
    ],
    userRoleAssignments: [
      {
        email: "approver@example.com",
        name: "Approver",
        role: "approver",
        businessId: "business-1",
        department: "Finance",
      },
    ],
  };

  assert.deepEqual(parseWorkspaceState(serializeWorkspaceState(state)), state);
});

test("returns null for invalid saved workspace state", () => {
  assert.equal(parseWorkspaceState("{not valid json"), null);
  assert.equal(parseWorkspaceState(JSON.stringify({ selectedTemplateId: 42 })), null);
});

test("parses older workspace state without saved approval tasks", () => {
  const parsed = parseWorkspaceState(
    JSON.stringify({
      selectedTemplateId: "template-1",
      businessDirectory: [],
      workflowTemplates: [],
    }),
  );

  assert.deepEqual(parsed?.approvalTasks, []);
});
