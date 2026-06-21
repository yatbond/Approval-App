export type WorkflowEditorTab = "builder" | "canvas" | "library";

export const workflowEditorTabs: { id: WorkflowEditorTab; label: string }[] = [
  { id: "builder", label: "Template Builder" },
  { id: "canvas", label: "Canvas" },
  { id: "library", label: "Template Library" },
];

export const defaultWorkflowEditorTab: WorkflowEditorTab = "builder";
