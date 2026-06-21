import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateLibraryItems } from "./workflow-template-library-state.ts";

const templates = [
  {
    id: "invoice",
    name: "Invoice approval",
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: ["Invoice"],
    documents: [{ id: "doc-1" }, { id: "doc-2" }],
    languages: ["English"],
    fields: [{ name: "amount" }],
    steps: [{ id: "step-1" }, { id: "step-2" }, { id: "step-3" }],
  },
  {
    id: "leave",
    name: "Leave approval",
    business: "Chun Wo Construction",
    department: "Human Resources",
    documentTypes: [],
    documents: [],
    languages: [],
    fields: [],
    steps: [],
  },
];

test("summarizes template library cards with counts and active state", () => {
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: templates,
    selectedTemplateId: "invoice",
  });

  assert.deepEqual(items, [
    {
      id: "invoice",
      template: templates[0],
      isSelected: true,
      businessDepartmentLabel: "Asia Allied Infrastructure - Finance",
      countsLabel: "2 document(s), 1 field(s), 3 step(s)",
    },
    {
      id: "leave",
      template: templates[1],
      isSelected: false,
      businessDepartmentLabel: "Chun Wo Construction - Human Resources",
      countsLabel: "0 document(s), 0 field(s), 0 step(s)",
    },
  ]);
});

test("falls back to the first template as selected when selected id is missing", () => {
  const items = getWorkflowTemplateLibraryItems({
    workflowTemplates: templates,
    selectedTemplateId: "missing",
  });

  assert.equal(items[0].isSelected, true);
  assert.equal(items[1].isSelected, false);
});

test("returns no items for an empty library", () => {
  assert.deepEqual(
    getWorkflowTemplateLibraryItems({
      workflowTemplates: [],
      selectedTemplateId: "missing",
    }),
    [],
  );
});
