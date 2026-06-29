import assert from "node:assert/strict";
import test from "node:test";
import { getWorkflowTemplateSaveState } from "./workflow-template-save-state.ts";
import { getWorkflowHistory } from "./workflow-history.ts";

function template(id, name = "Workflow") {
  return {
    id,
    name,
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [{ id: "start", kind: "start", label: "Start", x: 0, y: 0 }],
      edges: [],
    },
  };
}

test("does not save when the next template is unchanged", () => {
  const current = template("workflow-1", "Current");
  const historyById = {};

  assert.deepEqual(
    getWorkflowTemplateSaveState({
      currentTemplate: current,
      nextTemplate: { ...current },
      label: "Updated workflow",
      historyById,
      historyId: current.id,
    }),
    {
      didUpdate: false,
      historyById,
      template: current,
      label: "Updated workflow",
    },
  );
});

test("records history and returns the next template for real edits", () => {
  const current = template("workflow-1", "Current");
  const next = template("workflow-1", "Next");

  const result = getWorkflowTemplateSaveState({
    currentTemplate: current,
    nextTemplate: next,
    label: "Renamed workflow",
    historyById: {},
    historyId: current.id,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.template, next);
  assert.equal(result.label, "Renamed workflow");
  const history = getWorkflowHistory(result.historyById, current.id);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.undoStack[0].template, current);
  assert.equal(history.undoStack[0].label, "Renamed workflow");
  assert.equal(history.lastEdit, "Renamed workflow");
});

test("blocks direct edits to a published template", () => {
  const current = {
    ...template("workflow-1", "Current"),
    isDraft: false,
    publishedAt: "2026-06-21T05:00:00.000Z",
  };
  const next = { ...current, name: "Changed published template" };

  const result = getWorkflowTemplateSaveState({
    currentTemplate: current,
    nextTemplate: next,
    label: "Renamed workflow",
    historyById: {},
    historyId: current.id,
  });

  assert.equal(result.didUpdate, false);
  assert.equal(result.template, current);
  assert.match(result.message, /duplicate/i);
});
