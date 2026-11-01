export type WorkflowEditorTab = "copilot" | "builder" | "canvas" | "library";

export const workflowEditorTabs: {
  id: WorkflowEditorTab;
  label: string;
  mobileDisabled?: boolean;
}[] = [
  { id: "copilot", label: "Copilot" },
  { id: "builder", label: "Builder" },
  { id: "canvas", label: "Canvas", mobileDisabled: true },
  { id: "library", label: "Library" },
];

export const defaultWorkflowEditorTab: WorkflowEditorTab = "copilot";
