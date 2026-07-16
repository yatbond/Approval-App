"use client";

import { useApprovalWorkspaceCore } from "@/app/approval-workspace-core";
import { useWorkspaceEmailDelivery } from "@/app/use-workspace-email-delivery";
import { useWorkspaceTaskActions } from "@/app/use-workspace-task-actions";

export function useWorkspaceActionController() {
  const core = useApprovalWorkspaceCore();
  const email = useWorkspaceEmailDelivery({
    requestConfirmation: core.requestConfirmation,
  });
  const actions = useWorkspaceTaskActions({
    activeUser: core.activeUser,
    buildWorkspaceSnapshot: core.workspace.buildWorkspaceSnapshot,
    persistWorkspaceSnapshot: core.workspace.persistWorkspaceSnapshot,
    requestConfirmation: core.requestConfirmation,
    selectedTask: core.taskState.selectedTask,
    sendWorkflowEmailNotifications: email.sendWorkflowEmailNotifications,
    setSelectedTaskId: core.workspace.setSelectedTaskId,
    setTasks: core.workspace.setTasks,
    tasks: core.workspace.tasks,
    templates: core.workspace.templates,
  });

  return { actions, core, email };
}
