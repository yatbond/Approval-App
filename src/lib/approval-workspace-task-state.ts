import {
  isActionableBy,
  isVisibleToParticipant,
} from "./approval-state.ts";
import { getMissingRequiredCurrentNodeDocuments } from "./request-builder.ts";
import { findTemplateForTask } from "./task-display.ts";
import type {
  ApprovalTask,
  WorkflowTemplate,
} from "./types.ts";

export function getApprovalWorkspaceTaskState({
  tasks,
  templates,
  selectedTaskId,
  activeUserEmail,
}: {
  tasks: ApprovalTask[];
  templates: WorkflowTemplate[];
  selectedTaskId: string;
  activeUserEmail: string;
}) {
  const actionableTasks = tasks.filter((task) =>
    isActionableBy(task, activeUserEmail),
  );
  const trackingTasks = tasks.filter((task) =>
    isVisibleToParticipant(task, activeUserEmail),
  );
  const selectedActionableTask =
    actionableTasks.find((task) => task.id === selectedTaskId) ||
    actionableTasks[0];
  const selectedTask =
    selectedActionableTask ||
    trackingTasks.find((task) => task.id === selectedTaskId) ||
    trackingTasks[0];
  const selectedTaskTemplate = selectedTask
    ? findTemplateForTask(selectedTask, templates)
    : undefined;
  const selectedTaskMissingDocuments =
    selectedActionableTask && selectedTaskTemplate
      ? getMissingRequiredCurrentNodeDocuments(
          selectedActionableTask,
          selectedTaskTemplate,
        )
      : [];

  return {
    actionableTasks,
    trackingTasks,
    selectedActionableTask,
    selectedTask,
    selectedTaskTemplate,
    selectedTaskMissingDocuments,
  };
}
