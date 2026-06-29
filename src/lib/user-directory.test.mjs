import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDefaultRoleAssignments,
  buildUserDirectory,
} from "./user-directory.ts";

function task(overrides = {}) {
  return {
    id: "APR-1",
    title: "Invoice approval",
    workflow: "Finance approval",
    requester: "Originator",
    requesterEmail: "originator@example.com",
    department: "Finance",
    status: "pending",
    due: "24h",
    value: "HKD 8,400",
    currentStep: "Review",
    currentOwner: "reviewer@example.com",
    participants: [
      "originator@example.com",
      "reviewer@example.com",
      "observer@example.com",
    ],
    lastAction: "Submitted",
    extractedFields: {},
    auditTrail: [
      {
        id: "event-1",
        action: "submitted",
        actor: "Originator",
        actorEmail: "originator@example.com",
        timestamp: "2026-06-20T09:00:00.000Z",
        detail: "Submitted request.",
        targetEmail: "observer@example.com",
      },
    ],
    ...overrides,
  };
}

function template() {
  return {
    id: "template-finance",
    name: "Finance approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [
      {
        approverName: "Step Approver",
        approverEmail: "approver@example.com",
        dueHours: 24,
        escalationName: "Escalation Owner",
        escalationEmail: "escalation@example.com",
        branchCondition: "Always",
      },
    ],
    graph: {
      nodes: [
        {
          id: "review-1",
          kind: "review",
          label: "Review 1",
          x: 0,
          y: 0,
          assigneeName: "Review Owner",
          assigneeEmail: "reviewer@example.com",
        },
        {
          id: "fyi-1",
          kind: "for_information",
          label: "FYI",
          x: 160,
          y: 0,
          assigneeName: "FYI Owner",
          assigneeEmail: "fyi@example.com",
        },
      ],
      edges: [],
    },
  };
}

test("builds a deduplicated sorted user directory with strongest role", () => {
  const users = buildUserDirectory(
    [task()],
    [template()],
    {
      name: "Admin User",
      email: "observer@example.com",
      role: "superuser",
    },
  );

  assert.deepEqual(
    users.map((user) => `${user.name}:${user.email}:${user.role}`),
    [
      "Escalation Owner:escalation@example.com:approver",
      "FYI Owner:fyi@example.com:fyi",
      "observer@example.com:observer@example.com:superuser",
      "Originator:originator@example.com:originator",
      "Review Owner:reviewer@example.com:current actor",
      "Step Approver:approver@example.com:approver",
    ],
  );
});

test("uses graph role labels for review, fyi, and approval owners", () => {
  const approvalTemplate = template();
  approvalTemplate.graph.nodes.push({
    id: "approval-1",
    kind: "approval",
    label: "Approval",
    x: 320,
    y: 0,
    assigneeName: "Approval Owner",
    assigneeEmail: "approval@example.com",
  });

  const users = buildUserDirectory([], [approvalTemplate], {
    name: "Admin User",
    email: "admin@example.com",
    role: "superuser",
  });
  const roleByEmail = new Map(users.map((user) => [user.email, user.role]));

  assert.equal(roleByEmail.get("reviewer@example.com"), "reviewer");
  assert.equal(roleByEmail.get("fyi@example.com"), "fyi");
  assert.equal(roleByEmail.get("approval@example.com"), "approver");
});

test("creates default role assignments from the first business and department", () => {
  const users = [
    { name: "Reviewer", email: "reviewer@example.com", role: "reviewer" },
    { name: "Originator", email: "originator@example.com", role: "originator" },
  ];

  assert.deepEqual(
    buildDefaultRoleAssignments(users, [
      {
        id: "business-aai",
        name: "Asia Allied Infrastructure",
        departments: ["Finance", "Human Resources"],
      },
    ]),
    [
      {
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
        businessId: "business-aai",
        department: "Finance",
      },
      {
        name: "Originator",
        email: "originator@example.com",
        role: "originator",
        businessId: "business-aai",
        department: "Finance",
      },
    ],
  );
});

test("uses empty assignment scope when no business exists", () => {
  assert.deepEqual(
    buildDefaultRoleAssignments(
      [{ name: "Reviewer", email: "reviewer@example.com", role: "reviewer" }],
      [],
    ),
    [
      {
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
        businessId: "",
        department: "",
      },
    ],
  );
});
