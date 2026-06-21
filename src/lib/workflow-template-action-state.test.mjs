import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowCreateTemplateActionState,
  getWorkflowPublishTemplateActionState,
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
