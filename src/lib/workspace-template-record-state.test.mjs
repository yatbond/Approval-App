import assert from "node:assert/strict";
import test from "node:test";
import {
  getCreatedTemplateRecordState,
  getDeletedTemplateRecordState,
  getUpdatedTemplateRecordState,
} from "./workspace-template-record-state.ts";

function template(id, name = id) {
  return {
    id,
    name,
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: [],
    fields: [],
    steps: [],
  };
}

test("prepends created templates and selects the created template", () => {
  const state = getCreatedTemplateRecordState({
    templates: [template("old")],
    template: template("new"),
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["new", "old"],
  );
  assert.equal(state.selectedTemplateId, "new");
});

test("updates a matching template without changing list order", () => {
  const state = getUpdatedTemplateRecordState({
    templates: [template("a"), template("b")],
    template: template("b", "Updated B"),
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(state.templates[1].name, "Updated B");
});

test("selects the first remaining template when deleting the selected template", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a"), template("b"), template("c")],
    selectedTemplateId: "b",
    templateId: "b",
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["a", "c"],
  );
  assert.equal(state.selectedTemplateId, "a");
});

test("keeps current selection when deleting a different template", () => {
  const state = getDeletedTemplateRecordState({
    templates: [template("a"), template("b")],
    selectedTemplateId: "b",
    templateId: "a",
  });

  assert.deepEqual(
    state.templates.map((item) => item.id),
    ["b"],
  );
  assert.equal(state.selectedTemplateId, "b");
});
