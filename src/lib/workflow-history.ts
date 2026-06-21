import type { WorkflowTemplate } from "./types.ts";

export type WorkflowHistoryEntry = {
  template: WorkflowTemplate;
  label: string;
};

export type WorkflowHistoryState = {
  undoStack: WorkflowHistoryEntry[];
  redoStack: WorkflowHistoryEntry[];
  lastEdit: string;
};

export type WorkflowHistoryById = Record<string, WorkflowHistoryState>;

type WorkflowHistoryResult = {
  historyById: WorkflowHistoryById;
  template?: WorkflowTemplate;
};

const MAX_WORKFLOW_HISTORY = 50;

export function createEmptyWorkflowHistory(): WorkflowHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    lastEdit: "",
  };
}

export function getWorkflowHistory(
  historyById: WorkflowHistoryById,
  workflowId: string,
) {
  return historyById[workflowId] || createEmptyWorkflowHistory();
}

export function recordWorkflowHistoryEdit(
  historyById: WorkflowHistoryById,
  workflowId: string,
  currentTemplate: WorkflowTemplate,
  label: string,
) {
  if (!workflowId) {
    return historyById;
  }

  const currentHistory = getWorkflowHistory(historyById, workflowId);
  return {
    ...historyById,
    [workflowId]: {
      undoStack: [
        ...currentHistory.undoStack.slice(-(MAX_WORKFLOW_HISTORY - 1)),
        { template: currentTemplate, label },
      ],
      redoStack: [],
      lastEdit: label,
    },
  };
}

export function undoWorkflowHistory(
  historyById: WorkflowHistoryById,
  workflowId: string,
  currentTemplate: WorkflowTemplate,
): WorkflowHistoryResult {
  const currentHistory = getWorkflowHistory(historyById, workflowId);
  const previousEntry = currentHistory.undoStack.at(-1);
  if (!workflowId || !previousEntry) {
    return { historyById };
  }

  return {
    historyById: {
      ...historyById,
      [workflowId]: {
        undoStack: currentHistory.undoStack.slice(0, -1),
        redoStack: [
          ...currentHistory.redoStack.slice(-(MAX_WORKFLOW_HISTORY - 1)),
          { template: currentTemplate, label: previousEntry.label },
        ],
        lastEdit: `Undid: ${previousEntry.label}`,
      },
    },
    template: previousEntry.template,
  };
}

export function redoWorkflowHistory(
  historyById: WorkflowHistoryById,
  workflowId: string,
  currentTemplate: WorkflowTemplate,
): WorkflowHistoryResult {
  const currentHistory = getWorkflowHistory(historyById, workflowId);
  const nextEntry = currentHistory.redoStack.at(-1);
  if (!workflowId || !nextEntry) {
    return { historyById };
  }

  return {
    historyById: {
      ...historyById,
      [workflowId]: {
        undoStack: [
          ...currentHistory.undoStack.slice(-(MAX_WORKFLOW_HISTORY - 1)),
          { template: currentTemplate, label: nextEntry.label },
        ],
        redoStack: currentHistory.redoStack.slice(0, -1),
        lastEdit: `Redid: ${nextEntry.label}`,
      },
    },
    template: nextEntry.template,
  };
}
