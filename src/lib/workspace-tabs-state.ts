export const workspaceTabIds = [
  "queue",
  "tracking",
  "upload",
  "drafts",
  "workflow",
  "admin",
] as const;

export type WorkspaceTab = (typeof workspaceTabIds)[number];

export function getInitialWorkspaceTab(requestedTab?: string): WorkspaceTab {
  return workspaceTabIds.includes(requestedTab as WorkspaceTab)
    ? (requestedTab as WorkspaceTab)
    : "queue";
}
