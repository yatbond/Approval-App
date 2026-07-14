export type WorkflowEditorTab = "builder" | "canvas" | "library" | "forms";

export const workflowEditorTabs: {
  id: WorkflowEditorTab;
  label: string;
  mobileDisabled?: boolean;
}[] = [
  { id: "builder", label: "Builder" },
  { id: "canvas", label: "Canvas", mobileDisabled: true },
  { id: "library", label: "Library" },
  { id: "forms", label: "Forms" },
];

export const defaultWorkflowEditorTab: WorkflowEditorTab = "builder";
