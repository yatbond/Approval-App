export const workspaceTabIds = [
  "queue",
  "tracking",
  "upload",
  "drafts",
  "workflow",
  "admin",
] as const;

export type WorkspaceTab = (typeof workspaceTabIds)[number];

export const workspaceNavigationTabIds = workspaceTabIds.filter(
  (tabId) => tabId !== "upload",
);

export function getInitialWorkspaceTab(requestedTab?: string): WorkspaceTab {
  return workspaceTabIds.includes(requestedTab as WorkspaceTab)
    ? (requestedTab as WorkspaceTab)
    : "queue";
}

export function getNewRequestHref() {
  return "/?tab=upload&new=1";
}

export function isNewRequestStartRequested(value?: string) {
  return value === "1" || value === "true";
}
