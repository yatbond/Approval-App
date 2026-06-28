import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTaskNotifications,
  publishWorkflowTemplateVersion,
} from "./workflow-system.ts";

test("publishes a workflow template as a new immutable version", () => {
  const template = {
    id: "template-1",
    name: "Invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    version: 1,
    isDraft: true,
  };

  const published = publishWorkflowTemplateVersion(
    template,
    new Date("2026-06-20T10:00:00.000Z"),
  );

  assert.equal(published.id, "template-1-v2");
  assert.equal(published.version, 2);
  assert.equal(published.isDraft, false);
  assert.equal(published.isActiveVersion, true);
  assert.equal(published.publishedAt, "2026-06-20T10:00:00.000Z");
  assert.equal(published.sourceTemplateId, "template-1");
});

test("builds task notifications for owners, originators, FYI participants, and overdue work", () => {
  const notifications = buildTaskNotifications([
    {
      id: "APR-1",
      title: "Invoice approval",
      workflow: "Finance",
      requester: "Mandy",
      requesterEmail: "mandy@example.com",
      department: "Finance",
      status: "overdue",
      due: "Yesterday",
      value: "HKD 100",
      currentStep: "Review",
      currentOwner: "reviewer@example.com",
      participants: ["mandy@example.com", "reviewer@example.com", "fyi@example.com"],
      lastAction: "Submitted",
      extractedFields: {},
      auditTrail: [],
    },
  ]);

  assert.deepEqual(
    notifications.map((notification) => notification.recipientEmail),
    ["reviewer@example.com", "mandy@example.com", "fyi@example.com"],
  );
  assert.equal(notifications[0].kind, "escalation");
  assert.equal(notifications[0].unread, true);
  assert.equal(notifications[0].requestId, "APR-1");
});
