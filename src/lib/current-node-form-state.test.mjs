import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentNodeFormCompletionIssues,
  getCurrentNodeFormRequirements,
} from "./current-node-form-state.ts";

function makeTemplate(document) {
  return {
    id: "form-approval",
    name: "Form approval",
    business: "Chun Wo",
    department: "Commercial",
    documentTypes: [],
    documents: [document],
    languages: ["English"],
    fields: document.fields,
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
        {
          id: "approval",
          kind: "approval",
          label: "Approval",
          x: 200,
          y: 0,
          assigneeEmail: "approver@example.com",
          documentIds: [document.id],
        },
        { id: "end", kind: "end", label: "End", x: 400, y: 0 },
      ],
      edges: [
        { id: "start-approval", sourceId: "start", targetId: "approval", label: "Start", branchType: "main" },
        { id: "approval-end", sourceId: "approval", targetId: "end", label: "Approved", branchType: "approved" },
      ],
    },
  };
}

function makeTask(overrides = {}) {
  return {
    id: "APR-FORM",
    currentNodeId: "approval",
    extractedFields: {},
    attachments: [],
    ...overrides,
  };
}

const nativeForm = {
  id: "native-form",
  documentType: "Site review form",
  format: "text",
  inputMode: "manual_form",
  required: true,
  fields: [
    { name: "site_status", label: "Site status", type: "text", required: true, source: "manual", instructions: "Enter status." },
    { name: "comment", label: "Comment", type: "text", required: false, source: "manual", instructions: "Optional." },
  ],
  formLibraryRef: {
    definitionId: "native-v1",
    formKey: "native",
    version: 1,
    source: "native",
    responseMode: "manual",
    completionRequired: true,
    selectedFieldNames: ["site_status", "comment"],
    selectedAttachmentNames: [],
    attachmentFields: [],
  },
};

test("required native Approval forms block until required fields are filled", () => {
  const template = makeTemplate(nativeForm);
  assert.deepEqual(getCurrentNodeFormRequirements(makeTask(), template), [nativeForm]);
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(makeTask(), template)[0].missingFieldLabels,
    ["Site status"],
  );
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(
      makeTask({ extractedFields: { "Site status": "Complete" } }),
      template,
    ),
    [],
  );
});

test("optional Approval forms never block approval", () => {
  const document = {
    ...nativeForm,
    required: false,
    formLibraryRef: { ...nativeForm.formLibraryRef, completionRequired: false },
  };
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(makeTask(), makeTemplate(document)),
    [],
  );
});

test("required native form attachments block until the matching file is attached", () => {
  const document = {
    ...nativeForm,
    fields: [],
    formLibraryRef: {
      ...nativeForm.formLibraryRef,
      selectedFieldNames: [],
      selectedAttachmentNames: ["site_photo"],
      attachmentFields: [{ name: "site_photo", label: "Site photo", required: true }],
    },
  };
  const template = makeTemplate(document);
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(makeTask(), template)[0].missingAttachmentLabels,
    ["Site photo"],
  );
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(
      makeTask({
        attachments: [
          { documentId: document.id, documentType: "Site photo", fileName: "site.jpg" },
        ],
      }),
      template,
    ),
    [],
  );
});

test("Microsoft Approval forms block until the pinned response is applied", () => {
  const document = {
    ...nativeForm,
    id: "microsoft-form",
    documentType: "External review",
    fields: [],
    formLibraryRef: {
      ...nativeForm.formLibraryRef,
      definitionId: "microsoft-v2",
      formKey: "microsoft",
      version: 2,
      source: "microsoft_forms",
      responseMode: "complete_node",
      responseUrl: "https://forms.cloud.microsoft/r/5raJmEfjPA",
      selectedFieldNames: [],
    },
  };
  const template = makeTemplate(document);
  assert.equal(
    getCurrentNodeFormCompletionIssues(makeTask(), template)[0].waitingForExternalResponse,
    true,
  );
  assert.equal(
    getCurrentNodeFormCompletionIssues(
      makeTask({
        externalFormResponses: [
          {
            provider: "microsoft_forms",
            formKey: "microsoft",
            formVersion: 1,
            definitionId: "microsoft-v1",
            externalResponseId: "old",
            responseMode: "complete_node",
            status: "applied",
            answers: {},
            attachmentIds: [],
            submittedAt: "2026-07-16T00:00:00.000Z",
          },
        ],
      }),
      template,
    )[0].waitingForExternalResponse,
    true,
  );
  assert.deepEqual(
    getCurrentNodeFormCompletionIssues(
      makeTask({
        externalFormResponses: [
          {
            provider: "microsoft_forms",
            formKey: "microsoft",
            formVersion: 2,
            definitionId: "microsoft-v2",
            externalResponseId: "current",
            responseMode: "complete_node",
            status: "applied",
            answers: {},
            attachmentIds: [],
            submittedAt: "2026-07-16T00:00:00.000Z",
          },
        ],
      }),
      template,
    ),
    [],
  );
});
