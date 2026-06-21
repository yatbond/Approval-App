import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNormalizedWorkspaceRows,
  restoreWorkspaceStateFromNormalizedRows,
} from "./normalized-workspace.ts";

const snapshot = {
  selectedTemplateId: "template-finance",
  businessDirectory: [
    {
      id: "business-aai",
      name: "Asia Allied Infrastructure",
      departments: ["Finance"],
    },
  ],
  workflowTemplates: [
    {
      id: "template-finance",
      name: "Finance invoice approval",
      business: "Asia Allied Infrastructure",
      department: "Finance",
      version: 4,
      isDraft: false,
      publishedAt: "2026-06-21T05:00:00.000Z",
      sourceTemplateId: "template-finance-draft",
      documentTypes: ["Invoice PDF"],
      documents: [
        {
          id: "document-invoice",
          documentType: "Invoice",
          format: "pdf",
          required: true,
          fields: [
            {
              name: "invoice_total",
              label: "Invoice total",
              type: "currency",
              required: true,
              source: "ai",
              instructions: "Extract total.",
              documentId: "document-invoice",
            },
          ],
        },
      ],
      languages: ["English"],
      fields: [],
      steps: [],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "review-1",
            kind: "review",
            label: "Review 1",
            x: 160,
            y: 0,
            assigneeName: "Reviewer",
            assigneeEmail: "reviewer@example.com",
            documentIds: ["document-invoice"],
          },
        ],
        edges: [
          {
            id: "edge-1",
            sourceId: "start",
            targetId: "review-1",
            label: "Route",
            branchType: "main",
          },
        ],
      },
    },
  ],
  approvalTasks: [
    {
      id: "APR-1",
      title: "Invoice approval",
      workflow: "Finance invoice approval",
      workflowTemplateId: "template-finance",
      workflowTemplateVersion: 3,
      requester: "Mandy Chan",
      requesterEmail: "mandy@example.com",
      department: "Finance",
      status: "pending",
      due: "24h",
      dueAt: "2026-06-21T00:00:00.000Z",
      value: "HKD 8,400",
      currentStep: "Review 1",
      currentOwner: "reviewer@example.com",
      currentNodeId: "review-1",
      pendingNodeIds: ["review-1"],
      pendingOwners: ["reviewer@example.com"],
      completedNodeIds: ["start"],
      notifiedNodeIds: ["review-1"],
      nodeDecisions: { start: "approved" },
      activeBranchId: "edge-1",
      participants: ["mandy@example.com", "reviewer@example.com"],
      lastAction: "Submitted",
      extractedFields: { invoice_total: "8400" },
      attachments: [
        {
          id: "attachment-1",
          fileName: "invoice.pdf",
          documentId: "document-invoice",
          documentType: "Invoice",
          format: "pdf",
          workflowNodeId: "review-1",
          uploadedBy: "mandy@example.com",
          uploadedAt: "2026-06-20T10:00:00.000Z",
        },
      ],
      auditTrail: [
        {
          id: "event-1",
          action: "submitted",
          actor: "Mandy Chan",
          actorEmail: "mandy@example.com",
          timestamp: "2026-06-20T09:00:00.000Z",
          detail: "Submitted request.",
        },
      ],
    },
  ],
};

test("builds normalized rows from workspace state", () => {
  const rows = buildNormalizedWorkspaceRows(snapshot, {
    userId: "user-1",
    email: "dpang@chunwo.com",
  });

  assert.deepEqual(rows.businessUnits, [
    { clientId: "business-aai", name: "Asia Allied Infrastructure" },
  ]);
  assert.deepEqual(rows.businessDepartments, [
    {
      businessClientId: "business-aai",
      name: "Finance",
    },
  ]);
  assert.equal(rows.workflowTemplateVersions[0].templateKey, "template-finance");
  assert.equal(rows.workflowTemplateVersions[0].versionNumber, 4);
  assert.equal(rows.workflowTemplateVersions[0].templateSnapshot.isDraft, false);
  assert.equal(
    rows.workflowTemplateVersions[0].templateSnapshot.sourceTemplateId,
    "template-finance-draft",
  );
  assert.equal(rows.approvalRequests[0].requestNo, "APR-1");
  assert.equal(rows.approvalRequestEvents[0].approvalRequestNo, "APR-1");
  assert.equal(rows.approvalRequestAttachments[0].approvalRequestNo, "APR-1");
});

test("restores workspace state from normalized rows before snapshot fallback", () => {
  const rows = buildNormalizedWorkspaceRows(snapshot, {
    userId: "user-1",
    email: "dpang@chunwo.com",
  });

  const restored = restoreWorkspaceStateFromNormalizedRows({
    selectedTemplateId: "template-finance",
    businessUnits: rows.businessUnits,
    businessDepartments: rows.businessDepartments,
    workflowTemplateVersions: rows.workflowTemplateVersions,
    approvalRequests: rows.approvalRequests,
    approvalRequestEvents: rows.approvalRequestEvents,
    approvalRequestAttachments: rows.approvalRequestAttachments,
  });

  assert.deepEqual(restored.businessDirectory, snapshot.businessDirectory);
  assert.deepEqual(restored.workflowTemplates, snapshot.workflowTemplates);
  assert.deepEqual(restored.approvalTasks, snapshot.approvalTasks);
  assert.equal(restored.selectedTemplateId, "template-finance");
});

test("uses the template version before task history when normalizing templates", () => {
  const rows = buildNormalizedWorkspaceRows(
    {
      ...snapshot,
      workflowTemplates: [
        {
          ...snapshot.workflowTemplates[0],
          version: 2,
        },
      ],
      approvalTasks: [
        {
          ...snapshot.approvalTasks[0],
          workflowTemplateVersion: 7,
        },
      ],
    },
    {
      userId: "user-1",
      email: "dpang@chunwo.com",
    },
  );

  assert.equal(rows.workflowTemplateVersions[0].versionNumber, 2);
  assert.equal(rows.workflowTemplateVersions[0].templateSnapshot.version, 2);
});
