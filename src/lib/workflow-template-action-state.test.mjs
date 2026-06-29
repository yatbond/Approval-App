import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowCreateTemplateActionState,
  getWorkflowDuplicateTemplateActionState,
  getWorkflowPublishTemplateActionState,
  formatWorkflowTemplateOptionLabel,
  getWorkflowTemplateBaseOptions,
} from "./workflow-template-action-state.ts";

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
  graph: {
    nodes: [
      { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
      {
        id: "review-1",
        kind: "review",
        label: "Review 1",
        x: 240,
        y: 0,
        assigneeName: "Reviewer",
        assigneeEmail: "reviewer@example.com",
      },
      { id: "end", kind: "end", label: "End", x: 480, y: 0 },
    ],
    edges: [
      {
        id: "start-review",
        sourceId: "start",
        targetId: "review-1",
        label: "Review",
        branchType: "main",
      },
      {
        id: "review-end",
        sourceId: "review-1",
        targetId: "end",
        label: "Approved",
        branchType: "approved",
      },
    ],
  },
  version: 1,
  isDraft: true,
};

test("creates a workflow template from valid builder fields", () => {
  const result = getWorkflowCreateTemplateActionState({
    templateName: "  General approval  ",
    selectedBusinessName: "Asia Allied Infrastructure",
    departmentName: "  Finance  ",
  });

  assert.equal(result.didCreate, true);
  assert.equal(result.template?.name, "General approval");
  assert.equal(result.template?.business, "Asia Allied Infrastructure");
  assert.equal(result.template?.department, "Finance");
  assert.deepEqual(result.template?.documents, []);
  assert.deepEqual(result.template?.steps, []);
  assert.equal(result.workflowEditorTab, "canvas");
  assert.equal(result.shouldResetCanvasView, true);
});

test("creates a workflow template from a selected base template", () => {
  const result = getWorkflowCreateTemplateActionState({
    templateName: "  Site permit  ",
    selectedBusinessName: "HyPath",
    departmentName: "  Administration  ",
    baseTemplate: template,
  });

  assert.equal(result.didCreate, true);
  assert.equal(result.template?.name, "Site permit");
  assert.equal(result.template?.business, "HyPath");
  assert.equal(result.template?.department, "Administration");
  assert.notEqual(result.template?.id, template.id);
  assert.deepEqual(result.template?.graph, template.graph);
  assert.deepEqual(result.template?.documents, template.documents);
  assert.deepEqual(result.template?.fields, template.fields);
  assert.deepEqual(result.template?.languages, template.languages);
  assert.equal(result.workflowEditorTab, "canvas");
  assert.equal(result.shouldResetCanvasView, true);
});

test("formats workflow template options with business and department context", () => {
  assert.equal(
    formatWorkflowTemplateOptionLabel(template),
    "Invoice approval - Asia Allied Infrastructure / Finance",
  );
});

test("lists only active templates as workflow base options", () => {
  const archivedTemplate = {
    ...template,
    id: "archived-template",
    name: "Archived workflow",
    isArchived: true,
  };

  assert.deepEqual(
    getWorkflowTemplateBaseOptions({
      templates: [template, archivedTemplate],
    }).map((item) => item.id),
    ["template-1"],
  );
  assert.deepEqual(
    getWorkflowTemplateBaseOptions({
      templates: [template, archivedTemplate],
      excludeTemplateId: "template-1",
    }),
    [],
  );
});

test("excludes inactive workflow versions from base options", () => {
  assert.deepEqual(
    getWorkflowTemplateBaseOptions({
      templates: [
        {
          ...template,
          id: "template-1-v1",
          version: 1,
          isDraft: false,
          isActiveVersion: false,
          sourceTemplateId: "template-1",
        },
        {
          ...template,
          id: "template-1-v2",
          version: 2,
          isDraft: false,
          isActiveVersion: true,
          sourceTemplateId: "template-1",
        },
      ],
    }).map((item) => item.id),
    ["template-1-v2"],
  );
});

test("does not create a duplicate workflow name inside the same business and department", () => {
  const result = getWorkflowCreateTemplateActionState({
    templateName: " invoice APPROVAL ",
    selectedBusinessName: "Asia Allied Infrastructure",
    departmentName: " Finance ",
    existingTemplates: [template],
  });

  assert.equal(result.didCreate, false);
  assert.equal(result.template, null);
  assert.match(result.message, /already exists/i);
});

test("allows the same workflow name in another business or department and ignores archived templates", () => {
  const archivedTemplate = {
    ...template,
    id: "archived-template",
    isArchived: true,
  };

  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "Invoice approval",
      selectedBusinessName: "Asia Allied Infrastructure",
      departmentName: "Operations",
      existingTemplates: [template],
    }).didCreate,
    true,
  );
  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "Invoice approval",
      selectedBusinessName: "Chun Wo Construction",
      departmentName: "Finance",
      existingTemplates: [template],
    }).didCreate,
    true,
  );
  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "Invoice approval",
      selectedBusinessName: "Asia Allied Infrastructure",
      departmentName: "Finance",
      existingTemplates: [archivedTemplate],
    }).didCreate,
    true,
  );
});

test("does not create a workflow template without required builder fields", () => {
  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "",
      selectedBusinessName: "Asia Allied Infrastructure",
      departmentName: "Finance",
    }).didCreate,
    false,
  );
  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "Approval",
      selectedBusinessName: null,
      departmentName: "Finance",
    }).template,
    null,
  );
  assert.equal(
    getWorkflowCreateTemplateActionState({
      templateName: "Approval",
      selectedBusinessName: "Asia Allied Infrastructure",
      departmentName: "  ",
    }).didCreate,
    false,
  );
});

test("publishes the selected workflow template when one exists", () => {
  const result = getWorkflowPublishTemplateActionState({
    template,
    now: new Date("2026-06-21T05:00:00.000Z"),
  });

  assert.equal(result.didCreate, true);
  assert.equal(result.template?.id, "template-1-v2");
  assert.equal(result.template?.version, 2);
  assert.equal(result.template?.isDraft, false);
  assert.equal(result.template?.isActiveVersion, true);
  assert.equal(result.template?.publishedAt, "2026-06-21T05:00:00.000Z");
});

test("does not publish without a selected workflow template", () => {
  const result = getWorkflowPublishTemplateActionState({
    template: null,
    now: new Date("2026-06-21T05:00:00.000Z"),
  });

  assert.equal(result.didCreate, false);
  assert.equal(result.template, null);
});

test("does not publish when the workflow has validation errors", () => {
  const result = getWorkflowPublishTemplateActionState({
    template: {
      ...template,
      graph: {
        nodes: [{ id: "start", kind: "start", label: "Start", x: 0, y: 0 }],
        edges: [],
      },
    },
    now: new Date("2026-06-21T05:00:00.000Z"),
  });

  assert.equal(result.didCreate, false);
  assert.equal(result.template, null);
  assert.match(result.message, /No first approver/i);
});

test("does not publish when guardrail warnings make the workflow incomplete", () => {
  const result = getWorkflowPublishTemplateActionState({
    template: {
      ...template,
      documents: [
        {
          id: "invoice-doc",
          documentType: "Invoice",
          format: "pdf",
          required: true,
          fields: [],
        },
      ],
      graph: {
        nodes: [
          { id: "start", kind: "start", label: "Start", x: 0, y: 0 },
          {
            id: "review-1",
            kind: "review",
            label: "Review 1",
            x: 240,
            y: 0,
            assigneeName: "Reviewer",
            assigneeEmail: "reviewer@example.com",
            documentIds: ["invoice-doc"],
          },
          { id: "end", kind: "end", label: "End", x: 480, y: 0 },
        ],
        edges: [
          {
            id: "start-review",
            sourceId: "start",
            targetId: "review-1",
            label: "Review",
            branchType: "main",
          },
          {
            id: "review-end",
            sourceId: "review-1",
            targetId: "end",
            label: "Approved",
            branchType: "approved",
          },
        ],
      },
    },
    now: new Date("2026-06-21T05:00:00.000Z"),
  });

  assert.equal(result.didCreate, false);
  assert.equal(result.template, null);
  assert.match(result.message, /Required Invoice has no fields/i);
});

test("duplicates a template as a new editable draft", () => {
  const result = getWorkflowDuplicateTemplateActionState({
    template: {
      ...template,
      isDraft: false,
      publishedAt: "2026-06-21T04:00:00.000Z",
    },
    now: new Date("2026-06-21T06:00:00.000Z"),
  });

  assert.equal(result.didCreate, true);
  assert.equal(result.template?.id, "template-1-copy-1782021600000");
  assert.equal(result.template?.name, "Invoice approval copy");
  assert.equal(result.template?.version, 1);
  assert.equal(result.template?.isDraft, true);
  assert.equal(result.template?.publishedAt, undefined);
  assert.equal(result.template?.sourceTemplateId, "template-1");
  assert.notEqual(result.template?.graph, template.graph);
  assert.deepEqual(result.template?.graph, template.graph);
  assert.equal(result.selectedTemplateId, "template-1-copy-1782021600000");
  assert.equal(result.workflowEditorTab, "canvas");
});
