import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEmptyWorkflowHistory,
  getWorkflowHistory,
  recordWorkflowHistoryEdit,
  redoWorkflowHistory,
  undoWorkflowHistory,
} from "./workflow-history.ts";

function template(id, label = id) {
  return {
    id,
    name: label,
    business: "Asia Allied Infrastructure",
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [{ id: `${id}-start`, kind: "start", label: "Start", x: 0, y: 0 }],
      edges: [],
    },
  };
}

test("records workflow edits by workflow id and clears redo history", () => {
  const workflowA = template("workflow-a", "A current");
  const workflowB = template("workflow-b", "B current");
  let historyById = {};

  historyById = recordWorkflowHistoryEdit(historyById, workflowA.id, workflowA, "Edit A");
  historyById = {
    ...historyById,
    [workflowA.id]: {
      ...historyById[workflowA.id],
      redoStack: [{ template: template("workflow-a-redo"), label: "Redo A" }],
    },
  };
  historyById = recordWorkflowHistoryEdit(historyById, workflowB.id, workflowB, "Edit B");
  historyById = recordWorkflowHistoryEdit(
    historyById,
    workflowA.id,
    template("workflow-a-next"),
    "Edit A again",
  );

  assert.equal(getWorkflowHistory(historyById, workflowA.id).undoStack.length, 2);
  assert.equal(getWorkflowHistory(historyById, workflowA.id).redoStack.length, 0);
  assert.equal(getWorkflowHistory(historyById, workflowB.id).undoStack.length, 1);
  assert.equal(getWorkflowHistory(historyById, workflowB.id).lastEdit, "Edit B");
});

test("limits undo history to the latest fifty entries", () => {
  let historyById = {};
  const current = template("workflow-a");

  for (let index = 0; index < 60; index += 1) {
    historyById = recordWorkflowHistoryEdit(
      historyById,
      current.id,
      template(`workflow-a-${index}`),
      `Edit ${index}`,
    );
  }

  const history = getWorkflowHistory(historyById, current.id);
  assert.equal(history.undoStack.length, 50);
  assert.equal(history.undoStack[0].label, "Edit 10");
  assert.equal(history.undoStack.at(-1).label, "Edit 59");
});

test("undo and redo return the template to apply and move history entries", () => {
  const initial = template("workflow-a", "Initial");
  const edited = template("workflow-a", "Edited");
  const current = template("workflow-a", "Current");
  let historyById = {};

  historyById = recordWorkflowHistoryEdit(historyById, current.id, initial, "First edit");
  historyById = recordWorkflowHistoryEdit(historyById, current.id, edited, "Second edit");

  const undoResult = undoWorkflowHistory(historyById, current.id, current);
  assert.equal(undoResult.template.name, "Edited");
  assert.equal(getWorkflowHistory(undoResult.historyById, current.id).undoStack.length, 1);
  assert.equal(getWorkflowHistory(undoResult.historyById, current.id).redoStack.length, 1);
  assert.equal(
    getWorkflowHistory(undoResult.historyById, current.id).lastEdit,
    "Undid: Second edit",
  );

  const redoResult = redoWorkflowHistory(
    undoResult.historyById,
    current.id,
    undoResult.template,
  );
  assert.equal(redoResult.template.name, "Current");
  assert.equal(getWorkflowHistory(redoResult.historyById, current.id).undoStack.length, 2);
  assert.equal(getWorkflowHistory(redoResult.historyById, current.id).redoStack.length, 0);
  assert.equal(
    getWorkflowHistory(redoResult.historyById, current.id).lastEdit,
    "Redid: Second edit",
  );
});

test("returns unchanged history when undo or redo is unavailable", () => {
  const empty = createEmptyWorkflowHistory();
  const current = template("workflow-a");
  const historyById = { [current.id]: empty };

  assert.deepEqual(undoWorkflowHistory(historyById, current.id, current), {
    historyById,
  });
  assert.deepEqual(redoWorkflowHistory(historyById, current.id, current), {
    historyById,
  });
});
