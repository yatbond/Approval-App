import type { WorkflowTemplate } from "./types.ts";
import { createWorkflowGraphFromTemplate } from "./workflow-graph.ts";

export function getWorkflowTemplateCopyState({
  targetTemplate,
  sourceTemplate,
}: {
  targetTemplate: WorkflowTemplate;
  sourceTemplate: WorkflowTemplate;
}) {
  if (targetTemplate.id === sourceTemplate.id) {
    return {
      didCopy: false,
      template: targetTemplate,
      label: "",
      workflowEditorTab: "canvas" as const,
      shouldResetCanvasView: false,
    };
  }

  return {
    didCopy: true,
    template: {
      ...targetTemplate,
      documentTypes: cloneValue(sourceTemplate.documentTypes),
      documents: cloneValue(sourceTemplate.documents),
      languages: cloneValue(sourceTemplate.languages),
      fields: cloneValue(sourceTemplate.fields),
      steps: cloneValue(sourceTemplate.steps),
      graph: cloneValue(createWorkflowGraphFromTemplate(sourceTemplate)),
    },
    label: `Copied workflow from ${sourceTemplate.name}`,
    workflowEditorTab: "canvas" as const,
    shouldResetCanvasView: true,
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
