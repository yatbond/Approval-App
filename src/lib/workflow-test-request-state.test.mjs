import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowTestNotification,
  createWorkflowTestRequestState,
  getWorkflowTestTasks,
  isWorkflowTestTask,
} from "./workflow-test-request-state.ts";

const template = {
  id: "payment-v1",
  name: "Payment approval",
  business: "Chun Wo Construction",
  department: "Commercial",
  version: 3,
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "submit", kind: "submit_request", label: "QS", x: 100, y: 0 },
      { id: "approval", kind: "approval", label: "PQS", x: 200, y: 0 },
      { id: "end", kind: "end", label: "End", x: 300, y: 0 },
    ],
    edges: [
      { id: "e1", sourceId: "start", targetId: "submit", label: "Main", branchType: "main" },
      { id: "e2", sourceId: "submit", targetId: "approval", label: "Main", branchType: "main" },
      { id: "e3", sourceId: "approval", targetId: "end", label: "Main", branchType: "main" },
    ],
  },
};

test("creates a dedicated test request assigned only to the entered tester", () => {
  const result = createWorkflowTestRequestState({
    tasks: [],
    template,
    testerEmail: "Tester@Example.com",
    startedByEmail: "admin@example.com",
    now: new Date("2026-07-14T12:00:00.000Z"),
  });

  assert.equal(result.didCreate, true);
  assert.equal(result.task?.id, "TEST-1784030400000");
  assert.equal(result.task?.title, "[TEST] Payment approval");
  assert.equal(result.task?.currentStep, "PQS");
  assert.equal(result.task?.currentOwner, "tester@example.com");
  assert.deepEqual(result.task?.participants, ["tester@example.com"]);
  assert.equal(result.task?.workflowTemplateVersion, 3);
  assert.equal(result.notification?.recipientEmail, "tester@example.com");
  assert.equal(result.notification?.targetTab, "queue");
  assert.match(result.notification?.body || "", /now at PQS/);
});

test("replaces the previous test run without removing real requests", () => {
  const previousTest = {
    id: "TEST-1",
    workflowTemplateId: template.id,
    workflow: template.name,
  };
  const realTask = {
    id: "APR-1",
    workflowTemplateId: template.id,
    workflow: template.name,
  };
  const result = createWorkflowTestRequestState({
    tasks: [previousTest, realTask],
    template,
    testerEmail: "tester@example.com",
    startedByEmail: "admin@example.com",
    now: new Date("2026-07-14T12:00:00.000Z"),
  });

  assert.deepEqual(result.tasks.map((task) => task.id), [
    "TEST-1784030400000",
    "APR-1",
  ]);
  assert.deepEqual(getWorkflowTestTasks(result.tasks, template).map((task) => task.id), [
    "TEST-1784030400000",
  ]);
});

test("rejects invalid tester email and templates with routing errors", () => {
  const invalidEmail = createWorkflowTestRequestState({
    tasks: [],
    template,
    testerEmail: "not-an-email",
    startedByEmail: "admin@example.com",
  });
  const invalidWorkflow = createWorkflowTestRequestState({
    tasks: [],
    template: {
      ...template,
      graph: {
        nodes: [{ id: "start", kind: "start", label: "Start", x: 0, y: 0 }],
        edges: [],
      },
    },
    testerEmail: "tester@example.com",
    startedByEmail: "admin@example.com",
  });

  assert.equal(invalidEmail.didCreate, false);
  assert.match(invalidEmail.message, /valid tester email/i);
  assert.equal(invalidWorkflow.didCreate, false);
  assert.match(invalidWorkflow.message, /validation errors/i);
});

test("builds a detailed update email for the tester", () => {
  const result = createWorkflowTestRequestState({
    tasks: [],
    template,
    testerEmail: "tester@example.com",
    startedByEmail: "admin@example.com",
    now: new Date("2026-07-14T12:00:00.000Z"),
  });
  const notification = buildWorkflowTestNotification(result.task);

  assert.equal(isWorkflowTestTask(result.task), true);
  assert.deepEqual(
    notification.details.map((detail) => detail.label),
    [
      "Workflow",
      "Current position",
      "Arrived from",
      "Status",
      "Required action",
      "Latest decision or update",
    ],
  );
  assert.equal(
    notification.details.find((detail) => detail.label === "Arrived from")?.value,
    "QS",
  );
});
