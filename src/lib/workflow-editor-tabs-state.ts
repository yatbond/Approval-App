export type WorkflowEditorTab = "builder" | "canvas" | "library";

export const workflowEditorTabs: {
  id: WorkflowEditorTab;
  label: string;
  mobileDisabled?: boolean;
}[] = [
  { id: "builder", label: "Template Builder" },
  { id: "canvas", label: "Canvas", mobileDisabled: true },
  { id: "library", label: "Template Library" },
];

export const defaultWorkflowEditorTab: WorkflowEditorTab = "builder";
