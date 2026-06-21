import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceRequestSubmissionState } from "./workspace-request-submission-state.ts";

const actor = { name: "Derrick", email: "derrick@example.com" };

const template = {
  id: "invoice-template",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-doc",
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
      name: "Finance review",
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
};

const parseResult = {
  fields: {
    Vendor: "Northstar Cloud Limited",
    Total: "HKD 8,400",
  },
};

test("returns a missing required upload message before creating a task", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: template,
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(state.submissionMessage, "Missing required upload(s): Invoice.");
  assert.equal(state.tasks.length, 0);
  assert.equal(state.shouldClearUploadedAttachments, false);
});

test("creates a task, selects it, clears uploads, and returns a submission message", () => {
  const attachment = {
    id: "attachment-1",
    fileName: "invoice.pdf",
    documentId: "invoice-doc",
    documentType: "Invoice",
    format: "pdf",
    uploadedBy: "derrick@example.com",
    uploadedAt: "2026-06-21T02:00:00.000Z",
  };

  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: template,
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [attachment],
    tasks: [],
    now: new Date("2026-06-21T10:00:00+08:00"),
    taskId: "APR-TEST",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.selectedTaskId, "APR-TEST");
  assert.equal(state.shouldClearUploadedAttachments, true);
  assert.equal(state.tasks[0].attachments?.[0].id, "attachment-1");
  assert.equal(
    state.submissionMessage,
    "APR-TEST submitted and routed to approver@example.com. It is now visible in Tracking.",
  );
});

test("does not submit without a selected template or parse result", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: null,
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(state.submissionMessage, "");
  assert.equal(state.selectedTaskId, "");

  assert.equal(
    getWorkspaceRequestSubmissionState({
      selectedTemplate: template,
      parseResult: null,
      activeUser: actor,
      fileName: "invoice.pdf",
      editedFields: parseResult.fields,
      uploadedAttachments: [],
      tasks: [],
    }).didSubmit,
    false,
  );
});
