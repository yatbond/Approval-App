import type { WorkflowTemplate } from "./types.ts";
import {
  redoWorkflowHistory,
  undoWorkflowHistory,
  type WorkflowHistoryById,
  type WorkflowHistoryEntry,
} from "./workflow-history.ts";

type WorkflowHistoryActionStateInput = {
  workflow: WorkflowTemplate | null;
  historyById: WorkflowHistoryById;
  historyId: string;
};

type WorkflowHistoryActionState = {
  didUpdate: boolean;
  historyById: WorkflowHistoryById;
  template?: WorkflowTemplate;
  shouldResetCanvas: boolean;
};

export function getWorkflowUndoActionState({
  workflow,
  historyById,
  historyId,
  undoStack,
}: WorkflowHistoryActionStateInput & {
  undoStack: WorkflowHistoryEntry[];
}): WorkflowHistoryActionState {
  if (!workflow || !undoStack.at(-1)) {
    return { didUpdate: false, historyById, shouldResetCanvas: false };
  }

  const result = undoWorkflowHistory(historyById, historyId, workflow);
  if (!result.template) {
    return { didUpdate: false, historyById: result.historyById, shouldResetCanvas: false };
  }

  return {
    didUpdate: true,
    historyById: result.historyById,
    template: result.template,
    shouldResetCanvas: true,
  };
}

export function getWorkflowRedoActionState({
  workflow,
  historyById,
  historyId,
  redoStack,
}: WorkflowHistoryActionStateInput & {
  redoStack: WorkflowHistoryEntry[];
}): WorkflowHistoryActionState {
  if (!workflow || !redoStack.at(-1)) {
    return { didUpdate: false, historyById, shouldResetCanvas: false };
  }

  const result = redoWorkflowHistory(historyById, historyId, workflow);
  if (!result.template) {
    return { didUpdate: false, historyById: result.historyById, shouldResetCanvas: false };
  }

  return {
    didUpdate: true,
    historyById: result.historyById,
    template: result.template,
    shouldResetCanvas: true,
  };
}
