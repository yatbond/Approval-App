import assert from "node:assert/strict";
import test from "node:test";
import { attachLibraryFormToWorkflow } from "./form-library-state.ts";
import { processExternalFormIntake } from "./external-form-processing.ts";
import { createApprovalTaskFromTemplate } from "./request-builder.ts";

const fingerprint = "schema-v1";
const definition = {
  id: "site-form-v1",
  formKey: "site-form",
  name: "Site intake",
  source: "microsoft_forms",
  version: 1,
  status: "ready",
  fields: [
    {
      name: "project_name",
      label: "Project name",
      type: "text",
      required: true,
      source: "manual",
      instructions: "",
    },
    {
      name: "approver_email",
      label: "Approver email",
      type: "email",
      required: true,
      source: "manual",
      instructions: "",
    },
  ],
  attachmentFields: [{ name: "site_photo", label: "Site photo", required: true }],
  responseMode: "start_workflow",
  responseUrl: "https://forms.cloud.microsoft/r/form-id",
  externalFormId: "form-id",
  schemaFingerprint: fingerprint,
  targetWorkflowTemplateId: "site-workflow",
  participantMappings: [
    { nodeId: "submit", source: "responder" },
    { nodeId: "approve", source: "form_field", fieldName: "approver_email" },
  ],
  createdByEmail: "owner@example.com",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const template = {
  id: "site-workflow",
  name: "Site workflow",
  business: "Chun Wo",
  department: "Projects",
  isDraft: false,
  isArchived: false,
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      { id: "submit", kind: "submit_request", label: "Submitter", x: 100, y: 0 },
      { id: "approve", kind: "approval", label: "Manager", x: 200, y: 0 },
      { id: "end", kind: "end", label: "End", x: 300, y: 0 },
    ],
    edges: [
      { id: "e1", sourceId: "start", targetId: "submit", label: "Main", branchType: "main" },
      { id: "e2", sourceId: "submit", targetId: "approve", label: "Main", branchType: "main" },
      { id: "e3", sourceId: "approve", targetId: "end", label: "Main", branchType: "main" },
    ],
  },
};

function snapshot(overrides = {}) {
  return {
    selectedTemplateId: template.id,
    approvalTasks: [],
    businessDirectory: [{ id: "cw", name: "Chun Wo", departments: ["Projects"] }],
    workflowTemplates: [template],
    userRoleAssignments: [],
    adminAuditEvents: [],
    formLibrary: [definition],
    ...overrides,
  };
}

function intake(overrides = {}) {
  return {
    provider: "microsoft_forms",
    workspaceOwnerEmail: "owner@example.com",
    formKey: "site-form",
    formVersion: 1,
    externalFormId: "form-id",
    externalResponseId: "response-1",
    responseMode: "start_workflow",
    schemaFingerprint: fingerprint,
    respondentName: "Mandy Chan",
    respondentEmail: "mandy@example.com",
    answers: {
      project_name: "Hospital extension",
      approver_email: "manager@example.com",
    },
    attachments: [
      {
        fieldName: "site_photo",
        fileName: "site.jpg",
        downloadUrl: "https://example.com/site.jpg",
        driveItemId: "drive-1",
      },
    ],
    ...overrides,
  };
}

test("starts a workflow from a valid Microsoft Forms response", () => {
  const result = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake(),
    now: new Date("2026-07-14T06:00:00.000Z"),
  });
  assert.equal(result.success, true);
  assert.match(result.requestNo, /^APR-FORM-/);
  const task = result.snapshot.approvalTasks[0];
  assert.equal(task.requesterEmail, "mandy@example.com");
  assert.equal(task.currentOwner, "manager@example.com");
  assert.equal(task.extractedFields["Project name"], "Hospital extension");
  assert.equal(task.attachments[0].publicUrl, "https://example.com/site.jpg");
  assert.equal(task.externalFormResponses[0].externalResponseId, "response-1");
});

test("rejects changed schemas and unexpected questions", () => {
  const fingerprintResult = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake({ schemaFingerprint: "changed" }),
  });
  assert.equal(fingerprintResult.success, false);
  assert.equal(fingerprintResult.status, "schema_changed");

  const questionResult = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake({ answers: { ...intake().answers, new_question: "value" } }),
  });
  assert.equal(questionResult.success, false);
  assert.equal(questionResult.status, "schema_changed");
});

test("rejects missing required answers, attachments, and participant emails", () => {
  const answerResult = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake({ answers: { approver_email: "manager@example.com" } }),
  });
  assert.equal(answerResult.success, false);
  assert.match(answerResult.message, /Project name/);

  const attachmentResult = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake({ attachments: [] }),
  });
  assert.equal(attachmentResult.success, false);
  assert.match(attachmentResult.message, /Site photo/);

  const participantResult = processExternalFormIntake({
    snapshot: snapshot(),
    intake: intake({ answers: { project_name: "Hospital", approver_email: "" } }),
  });
  assert.equal(participantResult.success, false);
});

test("merges AI attachment values without requiring matching Microsoft Forms questions", () => {
  const extractionDefinition = {
    ...definition,
    fields: [
      ...definition.fields,
      {
        name: "payment_amount",
        label: "Payment amount",
        type: "currency",
        required: true,
        source: "ai",
        inputSource: "attachment_extraction",
        attachmentFieldName: "site_photo",
        instructions: "Extract the payable amount.",
      },
    ],
  };
  const result = processExternalFormIntake({
    snapshot: snapshot({ formLibrary: [extractionDefinition] }),
    intake: intake(),
    attachmentExtractionAnswers: { payment_amount: "HKD 500,000.00" },
  });
  assert.equal(result.success, true);
  assert.equal(
    result.snapshot.approvalTasks[0].extractedFields["Payment amount"],
    "HKD 500,000.00",
  );

  const missing = processExternalFormIntake({
    snapshot: snapshot({ formLibrary: [extractionDefinition] }),
    intake: intake(),
  });
  assert.equal(missing.success, false);
  assert.match(missing.message, /Payment amount/);
});

test("applies a complete-node response to the referenced request without approving it", () => {
  const completeDefinition = { ...definition, responseMode: "complete_node", targetWorkflowTemplateId: undefined };
  const attached = attachLibraryFormToWorkflow({
    template,
    nodeId: "approve",
    definition: completeDefinition,
  });
  const assignedTemplate = {
    ...attached.template,
    graph: {
      ...attached.template.graph,
      nodes: attached.template.graph.nodes.map((node) =>
        node.id === "submit"
          ? { ...node, assigneeEmail: "mandy@example.com" }
          : node.id === "approve"
            ? { ...node, assigneeEmail: "manager@example.com" }
            : node,
      ),
    },
  };
  const task = createApprovalTaskFromTemplate({
    id: "APR-100",
    requester: { name: "Mandy", email: "mandy@example.com" },
    template: assignedTemplate,
    extractedFields: {},
  });
  const result = processExternalFormIntake({
    snapshot: snapshot({
      workflowTemplates: [assignedTemplate],
      formLibrary: [completeDefinition],
      approvalTasks: [task],
    }),
    intake: intake({
      responseMode: "complete_node",
      approvalRequestNo: "APR-100",
    }),
  });
  assert.equal(result.success, true);
  assert.equal(result.requestNo, "APR-100");
  assert.equal(result.snapshot.approvalTasks[0].status, "pending");
  assert.equal(result.snapshot.approvalTasks[0].externalFormResponses.length, 1);
});

test("complete-node responses require a request reference and pinned version", () => {
  const completeDefinition = { ...definition, responseMode: "complete_node", targetWorkflowTemplateId: undefined };
  const result = processExternalFormIntake({
    snapshot: snapshot({ formLibrary: [completeDefinition] }),
    intake: intake({ responseMode: "complete_node" }),
  });
  assert.equal(result.success, false);
  assert.match(result.message, /Reference/);
});
