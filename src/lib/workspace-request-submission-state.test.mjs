import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceBatchRequestSubmissionState,
  getWorkspaceRequestSubmissionPersistenceMessage,
  getWorkspaceRequestSubmissionState,
} from "./workspace-request-submission-state.ts";

const actor = { name: "Derrick", email: "derrick@example.com" };

const template = {
  id: "invoice-template",
  name: "Invoice approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  version: 2,
  isDraft: false,
  publishedAt: "2026-06-21T05:00:00.000Z",
  documentTypes: ["Invoice"],
  documents: [
    {
      id: "invoice-doc",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [
        {
          name: "invoice_total",
          label: "Total",
          type: "currency",
          required: true,
          source: "ocr",
          instructions: "Extract invoice total.",
          documentId: "invoice-doc",
        },
      ],
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

function makeAttachment(id, fileName = "invoice.pdf") {
  return {
    id,
    fileName,
    documentId: "invoice-doc",
    documentType: "Invoice",
    format: "pdf",
    uploadedBy: "derrick@example.com",
    uploadedAt: "2026-06-21T02:00:00.000Z",
  };
}

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

test("returns a missing required extracted field message before creating a task", () => {
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
    editedFields: { Vendor: "Northstar Cloud Limited" },
    uploadedAttachments: [attachment],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(state.submissionMessage, "Missing required extracted field(s): Total.");
  assert.equal(state.tasks.length, 0);
});

test("warns before submitting low confidence extracted values", () => {
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
    parseResult: {
      fields: parseResult.fields,
      confidence: { Total: "low" },
    },
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [attachment],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(
    state.submissionMessage,
    "Review low confidence field(s) before submitting: Total.",
  );
});

test("requires workflow participant emails when a request is submitted", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: {
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "approval-1",
            kind: "approval",
            label: "Finance approval",
            x: 160,
            y: 0,
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
        ],
      },
    },
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [makeAttachment("attachment-1")],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(
    state.submissionMessage,
    "Missing workflow participant email(s): Finance approval.",
  );
});

test("applies request-start participant emails before creating a task", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: {
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "approval-1",
            kind: "approval",
            label: "Finance approval",
            x: 160,
            y: 0,
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
        ],
      },
    },
    participantEmails: { "approval-1": "finance@example.com" },
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [makeAttachment("attachment-1")],
    tasks: [],
    taskId: "APR-ASSIGNED",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.tasks[0].currentOwner, "finance@example.com");
  assert.equal(
    state.tasks[0].workflowTemplateSnapshot?.graph?.nodes.find(
      (node) => node.id === "approval-1",
    )?.assigneeEmail,
    "finance@example.com",
  );
});

test("keeps fixed template participant emails when request-start values try to override them", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: {
      ...template,
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "approval-1",
            kind: "approval",
            label: "Finance approval",
            x: 160,
            y: 0,
            assigneeEmail: "fixed-finance@example.com",
            assigneeEmailFixed: true,
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
        ],
      },
    },
    participantEmails: { "approval-1": "changed@example.com" },
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [makeAttachment("attachment-1")],
    tasks: [],
    taskId: "APR-FIXED",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.tasks[0].currentOwner, "fixed-finance@example.com");
  assert.equal(
    state.tasks[0].workflowTemplateSnapshot?.graph?.nodes.find(
      (node) => node.id === "approval-1",
    )?.assigneeEmail,
    "fixed-finance@example.com",
  );
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

test("submits a manual form request without a parsed upload", () => {
  const manualTemplate = {
    ...template,
    documents: [
      {
        id: "manual-leave-form",
        documentType: "Leave request form",
        format: "text",
        inputMode: "manual_form",
        required: true,
        fields: [
          {
            name: "leave_reason",
            label: "Leave reason",
            type: "text",
            required: true,
            source: "manual",
            instructions: "Requester enters the reason.",
            documentId: "manual-leave-form",
          },
        ],
      },
    ],
  };

  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: manualTemplate,
    parseResult: null,
    activeUser: actor,
    fileName: "",
    editedFields: { "Leave reason": "Family event" },
    uploadedAttachments: [],
    tasks: [],
    taskId: "APR-MANUAL",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.selectedTaskId, "APR-MANUAL");
  assert.equal(state.tasks[0].extractedFields["Leave reason"], "Family event");
  assert.deepEqual(state.tasks[0].attachments, []);
});

test("blocks a manual form request when a required manual value is missing", () => {
  const manualTemplate = {
    ...template,
    documents: [
      {
        id: "manual-leave-form",
        documentType: "Leave request form",
        format: "text",
        inputMode: "manual_form",
        required: true,
        fields: [
          {
            name: "leave_reason",
            label: "Leave reason",
            type: "text",
            required: true,
            source: "manual",
            instructions: "Requester enters the reason.",
            documentId: "manual-leave-form",
          },
        ],
      },
    ],
  };

  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: manualTemplate,
    parseResult: null,
    activeUser: actor,
    fileName: "",
    editedFields: {},
    uploadedAttachments: [],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.equal(state.submissionMessage, "Missing required extracted field(s): Leave reason.");
});

test("does not submit a request from a draft template", () => {
  const state = getWorkspaceRequestSubmissionState({
    selectedTemplate: { ...template, isDraft: true, publishedAt: undefined },
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [],
    tasks: [],
  });

  assert.equal(state.didSubmit, false);
  assert.match(state.submissionMessage, /Publish/i);
  assert.equal(state.tasks.length, 0);
});

test("allows legacy templates without draft metadata to submit requests", () => {
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
    selectedTemplate: { ...template, isDraft: undefined, publishedAt: undefined },
    parseResult,
    activeUser: actor,
    fileName: "invoice.pdf",
    editedFields: parseResult.fields,
    uploadedAttachments: [attachment],
    tasks: [],
    taskId: "APR-LEGACY",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.selectedTaskId, "APR-LEGACY");
});

test("submits multiple request drafts as separate workflow tasks", () => {
  const state = getWorkspaceBatchRequestSubmissionState({
    selectedTemplate: template,
    activeUser: actor,
    drafts: [
      {
        id: "draft-1",
        fileName: "invoice-a.pdf",
        parseResult,
        editedFields: parseResult.fields,
        uploadedAttachments: [makeAttachment("attachment-1", "invoice-a.pdf")],
      },
      {
        id: "draft-2",
        fileName: "invoice-b.pdf",
        parseResult: {
          fields: {
            Vendor: "Southstar Cloud Limited",
            Total: "HKD 12,000",
          },
        },
        editedFields: {
          Vendor: "Southstar Cloud Limited",
          Total: "HKD 12,000",
        },
        uploadedAttachments: [makeAttachment("attachment-2", "invoice-b.pdf")],
      },
    ],
    tasks: [],
    now: new Date("2026-06-21T10:00:00+08:00"),
    taskIdPrefix: "APR-BATCH",
  });

  assert.equal(state.didSubmit, true);
  assert.equal(state.tasks.length, 2);
  assert.deepEqual(
    state.tasks.map((task) => task.id),
    ["APR-BATCH-2", "APR-BATCH-1"],
  );
  assert.equal(state.selectedTaskId, "APR-BATCH-2");
  assert.equal(state.shouldClearUploadedAttachments, true);
  assert.equal(state.tasks[0].title, "Invoice approval - invoice-b.pdf");
  assert.equal(state.tasks[1].attachments?.[0].fileName, "invoice-a.pdf");
  assert.equal(
    state.submissionMessage,
    "2 requests submitted and routed. Latest request: APR-BATCH-2. They are now visible in Tracking.",
  );
});

test("blocks batch submission when any request draft is invalid", () => {
  const state = getWorkspaceBatchRequestSubmissionState({
    selectedTemplate: template,
    activeUser: actor,
    drafts: [
      {
        id: "draft-1",
        fileName: "invoice-a.pdf",
        parseResult,
        editedFields: parseResult.fields,
        uploadedAttachments: [makeAttachment("attachment-1", "invoice-a.pdf")],
      },
      {
        id: "draft-2",
        fileName: "invoice-b.pdf",
        parseResult,
        editedFields: { Vendor: "Southstar Cloud Limited" },
        uploadedAttachments: [makeAttachment("attachment-2", "invoice-b.pdf")],
      },
    ],
    tasks: [],
    taskIdPrefix: "APR-BATCH",
  });

  assert.equal(state.didSubmit, false);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.selectedTaskId, "");
  assert.equal(state.shouldClearUploadedAttachments, false);
  assert.equal(
    state.submissionMessage,
    "Request 2 (invoice-b.pdf): Missing required extracted field(s): Total.",
  );
});

test("formats request submission persistence messages", () => {
  assert.equal(
    getWorkspaceRequestSubmissionPersistenceMessage({
      submissionMessage: "APR-1 submitted.",
      syncMode: "supabase",
    }),
    "APR-1 submitted. Saved to Supabase.",
  );

  assert.equal(
    getWorkspaceRequestSubmissionPersistenceMessage({
      submissionMessage: "APR-1 submitted.",
      syncMode: "local",
      syncReason: "POST failed: 503",
    }),
    "APR-1 submitted. Saved locally. Supabase save failed: POST failed: 503.",
  );
});
