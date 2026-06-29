import assert from "node:assert/strict";
import { test } from "node:test";
import { getCollaborationStatusPanelState } from "./collaboration-status-panel-state.ts";

const template = {
  id: "template-1",
  name: "Collaborative approval",
  business: "Asia Allied Infrastructure",
  department: "Finance",
  documentTypes: ["Invoice", "Delivery Note"],
  documents: [
    {
      id: "doc-invoice",
      documentType: "Invoice",
      format: "pdf",
      required: true,
      fields: [],
    },
    {
      id: "doc-delivery",
      documentType: "Delivery Note",
      format: "pdf",
      required: true,
      fields: [],
    },
  ],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "submit-contractor",
        kind: "submit_request",
        label: "Contractor upload",
        x: 100,
        y: 0,
        assigneeName: "Contractor",
        assigneeEmail: "contractor@example.com",
        documentIds: ["doc-invoice"],
      },
      {
        id: "submit-site",
        kind: "submit_request",
        label: "Site upload",
        x: 200,
        y: 0,
        assigneeName: "Site Team",
        assigneeEmail: "site@example.com",
        documentIds: ["doc-delivery"],
        requireSharedFulfillmentConfirmation: true,
      },
    ],
    edges: [],
  },
};

const baseTask = {
  id: "APR-1001",
  title: "Invoice approval",
  workflow: "Collaborative approval",
  workflowTemplateId: "template-1",
  requester: "Mandy Chan",
  requesterEmail: "mandy@example.com",
  department: "Finance",
  status: "pending",
  due: "Due today",
  value: "HKD 8,400",
  currentStep: "Review",
  currentOwner: "reviewer@example.com",
  participants: ["mandy@example.com", "reviewer@example.com", "site@example.com"],
  lastAction: "Submitted by Mandy Chan",
  extractedFields: {},
  attachments: [
    {
      id: "attachment-invoice",
      fileName: "invoice.pdf",
      documentId: "doc-invoice",
      documentType: "Invoice",
      format: "pdf",
      workflowNodeId: "submit-contractor",
      uploadedBy: "contractor@example.com",
      uploadedAt: "2026-06-26T10:00:00.000Z",
    },
  ],
  auditTrail: [],
};

test("lists required submit box documents and missing required uploads", () => {
  const state = getCollaborationStatusPanelState({
    task: baseTask,
    template,
    activeUserEmail: "reviewer@example.com",
  });

  assert.deepEqual(
    state.requiredSubmissions.map((item) => ({
      id: item.id,
      label: item.label,
      assignedEmail: item.assignedEmail,
      status: item.status,
    })),
    [
      {
        id: "submit-contractor:doc-invoice",
        label: "Invoice",
        assignedEmail: "contractor@example.com",
        status: "submitted",
      },
      {
        id: "submit-site:doc-delivery",
        label: "Delivery Note",
        assignedEmail: "site@example.com",
        status: "missing",
      },
    ],
  );
  assert.deepEqual(state.blockingReasons, ["Delivery Note has not been uploaded."]);
});

test("lists pending shared fulfillment confirmations", () => {
  const state = getCollaborationStatusPanelState({
    task: {
      ...baseTask,
      sharedFulfillments: [
        {
          id: "APR-1001-shared-1",
          taskId: "APR-1001",
          requirementNodeId: "submit-site",
          documentId: "doc-delivery",
          documentType: "Delivery Note",
          assignedSubmitterEmail: "site@example.com",
          assignedSubmitterName: "Site Team",
          uploaderEmail: "contractor@example.com",
          uploaderName: "Contractor",
          attachmentId: "attachment-shared",
          required: true,
          status: "pending_confirmation",
          submittedAt: "2026-06-26 11:00",
        },
      ],
    },
    template,
    activeUserEmail: "site@example.com",
  });

  assert.equal(state.pendingConfirmations.length, 1);
  assert.equal(state.pendingConfirmations[0].label, "Delivery Note");
  assert.equal(state.pendingConfirmations[0].actualActorEmail, "contractor@example.com");
  assert.equal(state.pendingConfirmations[0].canAct, true);
  assert.deepEqual(state.blockingReasons, ["Delivery Note is pending confirmation."]);
});

test("lists blocking correction requests", () => {
  const state = getCollaborationStatusPanelState({
    task: {
      ...baseTask,
      sharedFulfillments: [
        {
          id: "APR-1001-shared-1",
          taskId: "APR-1001",
          requirementNodeId: "submit-site",
          documentId: "doc-delivery",
          documentType: "Delivery Note",
          assignedSubmitterEmail: "site@example.com",
          assignedSubmitterName: "Site Team",
          uploaderEmail: "contractor@example.com",
          uploaderName: "Contractor",
          attachmentId: "attachment-shared",
          required: true,
          status: "rejected",
          submittedAt: "2026-06-26 11:00",
          correctionRequestId: "APR-1001-correction-1",
        },
      ],
      correctionRequests: [
        {
          id: "APR-1001-correction-1",
          taskId: "APR-1001",
          sharedFulfillmentId: "APR-1001-shared-1",
          requestedByEmail: "reviewer@example.com",
          requestedByName: "Reviewer",
          assignedSubmitterEmail: "site@example.com",
          uploaderEmail: "contractor@example.com",
          rejectionNote: "Missing stamp.",
          status: "requested",
          blocksApproval: true,
          createdAt: "2026-06-26 11:40",
        },
      ],
    },
    template,
    activeUserEmail: "contractor@example.com",
  });

  assert.equal(state.corrections.length, 1);
  assert.equal(state.corrections[0].status, "requested");
  assert.equal(state.corrections[0].canAct, true);
  assert.deepEqual(state.blockingReasons, ["Delivery Note correction is still required."]);
});

test("lists contributor requests with submitted state", () => {
  const state = getCollaborationStatusPanelState({
    task: {
      ...baseTask,
      collaborationRequests: [
        {
          id: "APR-1001-collab-1",
          contributorName: "QS Team",
          contributorEmail: "qs@example.com",
          requestedByName: "Reviewer",
          requestedByEmail: "reviewer@example.com",
          requestNote: "Upload QS assessment.",
          dueAt: "2026-06-28T10:00",
          blocksApproval: true,
          status: "submitted",
          createdAt: "2026-06-26 10:15",
          submittedAt: "2026-06-26 12:00",
        },
      ],
    },
    template,
    activeUserEmail: "reviewer@example.com",
  });

  assert.deepEqual(state.contributorRequests, [
    {
      id: "APR-1001-collab-1",
      label: "QS Team",
      assignedEmail: "qs@example.com",
      actualActorEmail: "qs@example.com",
      status: "submitted",
      detail: "Upload QS assessment.",
      canAct: false,
      dueAt: "2026-06-28T10:00",
    },
  ]);
});
