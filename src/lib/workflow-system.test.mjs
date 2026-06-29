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

test("publishes workflow templates without duplicating sample page images", () => {
  const template = {
    id: "template-1",
    name: "Invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [
      {
        id: "document-1",
        documentType: "Invoice",
        format: "pdf",
        required: true,
        fields: [],
        sample: {
          fileName: "sample.pdf",
          mimeType: "application/pdf",
          previewPages: [
            {
              pageNumber: 1,
              mimeType: "image/png",
              imageBase64: "preview-image",
              pageText: "Vendor Northstar Cloud Limited",
            },
          ],
          pageImages: [
            {
              pageNumber: 1,
              mimeType: "image/png",
              imageBase64: "ocr-image",
              pageText: "Vendor Northstar Cloud Limited",
            },
          ],
          savedAt: "2026-06-29T01:00:00.000Z",
          trainingDraft: {
            selectedFieldName: "vendor",
            instructions: "Extract the vendor.",
            value: "Northstar Cloud Limited",
          },
        },
      },
    ],
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
  const publishedSample = published.documents[0].sample;

  assert.equal(publishedSample.previewPages[0].imageBase64, undefined);
  assert.equal(publishedSample.pageImages[0].imageBase64, undefined);
  assert.equal(publishedSample.pageImages[0].pageText, "Vendor Northstar Cloud Limited");
  assert.deepEqual(publishedSample.trainingDraft, {
    selectedFieldName: "vendor",
    instructions: "Extract the vendor.",
    value: "Northstar Cloud Limited",
  });
  assert.equal(template.documents[0].sample.pageImages[0].imageBase64, "ocr-image");
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
