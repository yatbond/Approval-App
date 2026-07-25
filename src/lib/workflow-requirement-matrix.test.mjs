import assert from "node:assert/strict";
import test from "node:test";
import {
  attachLibraryFormToWorkflow,
  createEmptyFormLibraryDraft,
  saveFormLibraryDraft,
} from "./form-library-state.ts";
import {
  createApprovalTaskFromTemplate,
  getMissingRequiredCurrentNodeDocuments,
  getMissingRequiredSubmissionDocuments,
  getSubmissionDocumentRequirements,
} from "./request-builder.ts";
import { getWorkspaceRecordTaskActionState } from "./workspace-task-action-state.ts";

const formats = ["text", "pdf", "image", "excel_csv"];

function makeTemplate({ submitDocumentIds = [], approvalDocumentIds = [], documents = [] } = {}) {
  return {
    id: "matrix-template",
    name: "Matrix workflow",
    business: "Chun Wo",
    department: "Commercial",
    documentTypes: [],
    documents,
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
        {
          id: "submit",
          kind: "submit_request",
          label: "Submit",
          x: 180,
          y: 0,
          documentIds: submitDocumentIds,
        },
        {
          id: "approval",
          kind: "approval",
          label: "Approval",
          x: 360,
          y: 0,
          assigneeEmail: "approver@example.com",
          documentIds: approvalDocumentIds,
        },
        { id: "end", kind: "end", label: "End", x: 540, y: 0 },
      ],
      edges: [
        { id: "start-submit", sourceId: "start", targetId: "submit", label: "Main", branchType: "main" },
        { id: "submit-approval", sourceId: "submit", targetId: "approval", label: "Main", branchType: "main" },
        { id: "approval-end", sourceId: "approval", targetId: "end", label: "Approved", branchType: "approved" },
      ],
    },
  };
}

function makeUploadDocument(format, required, id = `upload-${format}-${required}`) {
  return {
    id,
    documentType: `${format} upload`,
    format,
    inputMode: "upload",
    required,
    fields: [],
  };
}

function makeTask(currentNodeId, attachments = []) {
  return {
    id: "APR-MATRIX",
    currentNodeId,
    attachments,
  };
}

test("submission only includes requirements attached to Submit boxes", () => {
  const approvalDocument = makeUploadDocument("pdf", true, "approval-pdf");
  const template = makeTemplate({
    approvalDocumentIds: [approvalDocument.id],
    documents: [approvalDocument],
  });

  assert.deepEqual(getSubmissionDocumentRequirements(template), []);
  assert.deepEqual(getMissingRequiredSubmissionDocuments(template, []), []);
});

test("document requirement matrix respects node, format, required state, and upload presence", () => {
  for (const nodeId of ["submit", "approval"]) {
    for (const format of formats) {
      for (const required of [false, true]) {
        const document = makeUploadDocument(format, required);
        const template = makeTemplate({
          submitDocumentIds: nodeId === "submit" ? [document.id] : [],
          approvalDocumentIds: nodeId === "approval" ? [document.id] : [],
          documents: [document],
        });
        const attachment = {
          id: `attachment-${document.id}`,
          fileName: `file.${format}`,
          documentId: document.id,
          documentType: document.documentType,
          format,
          uploadedBy: "user@example.com",
          uploadedAt: "2026-07-16T00:00:00.000Z",
        };

        const missingWithoutUpload =
          nodeId === "submit"
            ? getMissingRequiredSubmissionDocuments(template, [])
            : getMissingRequiredCurrentNodeDocuments(makeTask("approval"), template);
        const missingWithUpload =
          nodeId === "submit"
            ? getMissingRequiredSubmissionDocuments(template, [attachment])
            : getMissingRequiredCurrentNodeDocuments(
                makeTask("approval", [attachment]),
                template,
              );

        assert.deepEqual(
          missingWithoutUpload.map((item) => item.id),
          required ? [document.id] : [],
          `${nodeId}/${format}/${required}/without upload`,
        );
        assert.deepEqual(
          missingWithUpload,
          [],
          `${nodeId}/${format}/${required}/with upload`,
        );
      }
    }
  }
});

test("Form Library requirements are never reported as missing file uploads", () => {
  for (const source of ["native", "microsoft_forms"]) {
    for (const nodeId of ["submit", "approval"]) {
      for (const required of [false, true]) {
        const draft = createEmptyFormLibraryDraft(source, {
          business: "Chun Wo",
          department: "Commercial",
        });
        draft.name = `${source} matrix form`;
        if (source === "microsoft_forms") {
          draft.responseUrl = "https://forms.cloud.microsoft/r/5raJmEfjPA";
        }
        draft.fields = [
          {
            name: "reference",
            label: "Reference",
            type: "text",
            required,
            source: "manual",
            instructions: "Enter the reference.",
          },
        ];
        const saved = saveFormLibraryDraft({
          library: [],
          draft,
          actorEmail: "admin@example.com",
          saveMode: "publish",
        });
        const attached = attachLibraryFormToWorkflow({
          template: makeTemplate(),
          nodeId,
          definition: saved.definition,
          completionRequired: required,
        });

        assert.equal(attached.didUpdate, true, `${source}/${nodeId}/${required}`);
        const formDocument = attached.template.documents[0];
        const task = makeTask("approval");
        assert.deepEqual(
          getMissingRequiredSubmissionDocuments(attached.template, []),
          [],
          `${source}/${nodeId}/${required}/submission uploads`,
        );
        assert.deepEqual(
          getMissingRequiredCurrentNodeDocuments(task, attached.template),
          [],
          `${source}/${nodeId}/${required}/approval uploads/${formDocument.id}`,
        );
      }
    }
  }
});

test("only published active Form Library versions can be attached", () => {
  for (const source of ["native", "microsoft_forms"]) {
    const draft = createEmptyFormLibraryDraft(source);
    draft.name = `${source} form`;
    draft.status = "ready";
    const savedDraft = saveFormLibraryDraft({
      library: [],
      draft,
      actorEmail: "admin@example.com",
      saveMode: "draft",
    });
    const archived = {
      ...savedDraft.definition,
      id: `${savedDraft.definition.id}-archived`,
      isDraft: false,
      status: "archived",
    };
    const inactivePublished = {
      ...savedDraft.definition,
      id: `${savedDraft.definition.id}-inactive-published`,
      isDraft: false,
      isActiveVersion: false,
      status: "ready",
    };

    for (const definition of [savedDraft.definition, archived, inactivePublished]) {
      const result = attachLibraryFormToWorkflow({
        template: makeTemplate(),
        nodeId: "submit",
        definition,
      });
      assert.equal(result.didUpdate, false, `${source}/${definition.status}/${definition.isDraft}`);
    }
  }
});

test("Form Library attachments are accepted only by Submit and Approval boxes", () => {
  const draft = createEmptyFormLibraryDraft("native");
  draft.name = "Node matrix form";
  const saved = saveFormLibraryDraft({
    library: [],
    draft,
    actorEmail: "admin@example.com",
    saveMode: "publish",
  });
  const template = makeTemplate();
  template.graph.nodes.push(
    { id: "fyi", kind: "for_information", label: "FYI", x: 360, y: 140 },
    { id: "condition", kind: "condition", label: "Condition", x: 480, y: 140 },
  );

  for (const [nodeId, expected] of [
    ["start", false],
    ["submit", true],
    ["approval", true],
    ["fyi", false],
    ["condition", false],
    ["end", false],
  ]) {
    const result = attachLibraryFormToWorkflow({
      template,
      nodeId,
      definition: saved.definition,
    });
    assert.equal(result.didUpdate, expected, nodeId);
  }
});

function makeApprovalGateTemplate(source) {
  const upload = {
    ...makeUploadDocument("pdf", true, "approval-upload"),
    fields: [
      {
        name: "invoice_total",
        label: "Invoice total",
        type: "currency",
        required: true,
        source: "ai",
        instructions: "Extract the total.",
      },
    ],
  };
  const form = {
    id: `${source}-approval-form`,
    documentType: source === "native" ? "Approval checklist" : "External checklist",
    format: "text",
    inputMode: "manual_form",
    required: true,
    fields:
      source === "native"
        ? [
            {
              name: "check_result",
              label: "Check result",
              type: "text",
              required: true,
              source: "manual",
              instructions: "Enter the result.",
            },
          ]
        : [],
    formLibraryRef: {
      definitionId: `${source}-definition-v1`,
      formKey: `${source}-definition`,
      version: 1,
      source,
      responseMode: source === "native" ? "manual" : "complete_node",
      responseUrl:
        source === "microsoft_forms"
          ? "https://forms.cloud.microsoft/r/5raJmEfjPA"
          : undefined,
      completionRequired: true,
      selectedFieldNames: source === "native" ? ["check_result"] : [],
      selectedAttachmentNames: [],
      attachmentFields: [],
    },
  };
  return makeTemplate({
    approvalDocumentIds: [upload.id, form.id],
    documents: [upload, form],
  });
}

function makeApprovalGateTask(template, { uploaded, extracted, formComplete, source }) {
  const task = createApprovalTaskFromTemplate({
    id: `APR-${source}-GATE`,
    now: new Date("2026-07-16T00:00:00.000Z"),
    requester: { name: "Owner", email: "owner@example.com" },
    template,
    extractedFields: {
      ...(extracted ? { "Invoice total": "1000" } : {}),
      ...(source === "native" && formComplete ? { "Check result": "Checked" } : {}),
    },
    attachments: uploaded
      ? [
          {
            id: "approval-file",
            fileName: "invoice.pdf",
            documentId: "approval-upload",
            documentType: "pdf upload",
            format: "pdf",
            uploadedBy: "approver@example.com",
            uploadedAt: "2026-07-16T00:00:00.000Z",
          },
        ]
      : [],
  });
  if (source === "microsoft_forms" && formComplete) {
    task.externalFormResponses = [
      {
        provider: "microsoft_forms",
        formKey: "microsoft_forms-definition",
        formVersion: 1,
        definitionId: "microsoft_forms-definition-v1",
        externalResponseId: "response-1",
        responseMode: "complete_node",
        status: "applied",
        answers: {},
        attachmentIds: [],
        submittedAt: "2026-07-16T00:00:00.000Z",
      },
    ];
  }
  return task;
}

test("Approval gates enforce every file, extraction, and form completion combination", () => {
  let scenarioCount = 0;
  for (const source of ["native", "microsoft_forms"]) {
    const template = makeApprovalGateTemplate(source);
    for (const uploaded of [false, true]) {
      for (const extracted of [false, true]) {
        for (const formComplete of [false, true]) {
          scenarioCount += 1;
          const task = makeApprovalGateTask(template, {
            uploaded,
            extracted,
            formComplete,
            source,
          });
          const result = getWorkspaceRecordTaskActionState({
            tasks: [task],
            selectedTask: task,
            templates: [template],
            activeUser: { name: "Approver", email: "approver@example.com" },
            action: "approve",
            comment: "",
            targetEmail: "",
          });
          assert.equal(
            result.didApply,
            uploaded && extracted && formComplete,
            `${source}/${uploaded}/${extracted}/${formComplete}: ${result.actionError}`,
          );
        }
      }
    }
  }
  assert.equal(scenarioCount, 16);
});
