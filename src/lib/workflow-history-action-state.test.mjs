import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkflowRedoActionState,
  getWorkflowUndoActionState,
} from "./workflow-history-action-state.ts";
import { recordWorkflowHistoryEdit } from "./workflow-history.ts";

function template(id, name = id) {
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

test("undo returns the previous template, updated history, and reset signal", () => {
  const current = template("workflow-1", "Current");
  const previous = template("workflow-1", "Previous");
  const historyById = recordWorkflowHistoryEdit(
    {},
    current.id,
    previous,
    "Edited workflow",
  );

  const result = getWorkflowUndoActionState({
    workflow: current,
    historyById,
    historyId: current.id,
    undoStack: historyById[current.id].undoStack,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.template, previous);
  assert.equal(result.shouldResetCanvas, true);
  assert.equal(result.historyById[current.id].undoStack.length, 0);
  assert.equal(result.historyById[current.id].redoStack.length, 1);
});

test("redo returns the next template, updated history, and reset signal", () => {
  const current = template("workflow-1", "Current");
  const previous = template("workflow-1", "Previous");
  const historyById = recordWorkflowHistoryEdit(
    {},
    current.id,
    previous,
    "Edited workflow",
  );
  const undone = getWorkflowUndoActionState({
    workflow: current,
    historyById,
    historyId: current.id,
    undoStack: historyById[current.id].undoStack,
  });

  const result = getWorkflowRedoActionState({
    workflow: undone.template,
    historyById: undone.historyById,
    historyId: current.id,
    redoStack: undone.historyById[current.id].redoStack,
  });

  assert.equal(result.didUpdate, true);
  assert.equal(result.template, current);
  assert.equal(result.shouldResetCanvas, true);
  assert.equal(result.historyById[current.id].undoStack.length, 1);
  assert.equal(result.historyById[current.id].redoStack.length, 0);
});

test("undo and redo no-op without workflow or matching stack entries", () => {
  assert.equal(
    getWorkflowUndoActionState({
      workflow: null,
      historyById: {},
      historyId: "workflow-1",
      undoStack: [template("workflow-1")],
    }).didUpdate,
    false,
  );
  assert.equal(
    getWorkflowRedoActionState({
      workflow: template("workflow-1"),
      historyById: {},
      historyId: "workflow-1",
      redoStack: [],
    }).didUpdate,
    false,
  );
});
