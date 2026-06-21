import { applyTaskAction } from "./approval-state.ts";
import { getMissingRequiredCurrentNodeDocuments } from "./request-builder.ts";
import { findTemplateForTask } from "./task-display.ts";
import { getTaskActionPreflightState } from "./task-action-state.ts";
import { getWorkflowRunnerActionActor } from "./workflow-runner-action-state.ts";
import type {
  ApprovalAction,
  ApprovalActor,
  ApprovalTask,
  WorkflowTemplate,
} from "./types.ts";

type RecordTaskActionInput = {
  tasks: ApprovalTask[];
  selectedTask?: ApprovalTask;
  templates: WorkflowTemplate[];
  activeUser: ApprovalActor;
  action: ApprovalAction;
  comment: string;
  targetEmail: string;
};

type TaskActionState = {
  didApply: boolean;
  tasks: ApprovalTask[];
  actionError: string;
  shouldClearInputs: boolean;
  selectedTaskId?: string;
};

export function getWorkspaceRecordTaskActionState({
  tasks,
  selectedTask,
  templates,
  activeUser,
  action,
  comment,
  targetEmail,
}: RecordTaskActionInput): TaskActionState {
  if (!selectedTask) {
    return {
      didApply: false,
      tasks,
      actionError: "",
      shouldClearInputs: false,
    };
  }

  const template = findTemplateForTask(selectedTask, templates);
  const missingCurrentDocuments =
    template && (action === "approve" || action === "approve_with_comment")
      ? getMissingRequiredCurrentNodeDocuments(selectedTask, template)
      : [];
  const preflight = getTaskActionPreflightState({
    action,
    targetEmail,
    missingCurrentDocuments,
  });

  if (!preflight.canProceed) {
    return {
      didApply: false,
      tasks,
      actionError: preflight.errorMessage,
      shouldClearInputs: false,
    };
  }

  const nextTask = applyTaskAction(selectedTask, {
    action,
    actor: activeUser,
    comment,
    targetEmail,
    template,
  });

  return {
    didApply: true,
    tasks: replaceTask(tasks, selectedTask.id, nextTask),
    actionError: "",
    shouldClearInputs: true,
  };
}

export function getWorkspaceRunnerTaskActionState({
  tasks,
  templates,
  taskId,
  action,
  fallbackEmail,
}: {
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
  taskId: string;
  action: ApprovalAction;
  fallbackEmail: string;
}): TaskActionState {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) {
    return {
      didApply: false,
      tasks,
      actionError: "",
      shouldClearInputs: false,
    };
  }

  const template = findTemplateForTask(task, templates);
  const actor = getWorkflowRunnerActionActor({
    task,
    action,
    fallbackEmail,
  });
  const nextTask = applyTaskAction(task, {
    action,
    actor,
    comment: "Workflow runner simulation",
    template,
  });

  return {
    didApply: true,
    tasks: replaceTask(tasks, taskId, nextTask),
    actionError: "",
    shouldClearInputs: false,
    selectedTaskId: taskId,
  };
}

function replaceTask(
  tasks: ApprovalTask[],
  taskId: string,
  nextTask: ApprovalTask,
) {
  return tasks.map((task) => (task.id === taskId ? nextTask : task));
}
