import type { WorkflowTemplate } from "./types.ts";
import {
  recordWorkflowHistoryEdit,
  type WorkflowHistoryById,
} from "./workflow-history.ts";

export function getWorkflowTemplateSaveState({
  currentTemplate,
  nextTemplate,
  label,
  historyById,
  historyId,
}: {
  currentTemplate: WorkflowTemplate;
  nextTemplate: WorkflowTemplate;
  label: string;
  historyById: WorkflowHistoryById;
  historyId: string;
}) {
  if (JSON.stringify(currentTemplate) === JSON.stringify(nextTemplate)) {
    return {
      didUpdate: false,
      historyById,
      template: currentTemplate,
      label,
    };
  }

  return {
    didUpdate: true,
    historyById: recordWorkflowHistoryEdit(
      historyById,
      historyId,
      currentTemplate,
      label,
    ),
    template: nextTemplate,
    label,
  };
}
