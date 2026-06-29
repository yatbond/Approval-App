import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateLoadState } from "./workflow-template-load-state.ts";

const businessDirectory = [
  { id: "aai", name: "Asia Allied Infrastructure", departments: ["Finance"] },
  { id: "cw", name: "Chun Wo Construction", departments: ["Tendering"] },
];

const template = {
  id: "template-1",
  name: "Finance invoice approval",
  business: "Chun Wo Construction",
  department: "Tendering",
  documentTypes: [],
  documents: [],
  languages: ["English"],
  fields: [],
  steps: [],
};

test("loads template name, matching business id, and department into the builder", () => {
  assert.deepEqual(
    getWorkflowTemplateLoadState({
      template,
      businessDirectory,
      currentBusinessId: "aai",
    }),
    {
      templateName: "Finance invoice approval",
      businessId: "cw",
      shouldSetBusinessId: true,
      departmentName: "Tendering",
      selectedTemplateId: "template-1",
      workflowEditorTab: "canvas",
      shouldResetCanvasView: true,
    },
  );
});

test("keeps the current business id when the template business is not in the directory", () => {
  assert.deepEqual(
    getWorkflowTemplateLoadState({
      template: {
        ...template,
        business: "Unknown business",
      },
      businessDirectory,
      currentBusinessId: "aai",
    }),
    {
      templateName: "Finance invoice approval",
      businessId: "aai",
      shouldSetBusinessId: false,
      departmentName: "Tendering",
      selectedTemplateId: "template-1",
      workflowEditorTab: "canvas",
      shouldResetCanvasView: true,
    },
  );
});
