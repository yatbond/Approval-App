type UnreadNotification = {
  unread: boolean;
};

export type WorkspaceSyncMode = "loading" | "supabase" | "local";

export function getWorkspaceShellState({
  baseNotifications,
  draftItemCount = 0,
  taskNotifications,
  workspaceSyncMode,
}: {
  baseNotifications: UnreadNotification[];
  draftItemCount?: number;
  taskNotifications: UnreadNotification[];
  workspaceSyncMode: WorkspaceSyncMode;
}) {
  return {
    draftItemCount: Math.max(0, Math.floor(draftItemCount)),
    unreadCount:
      baseNotifications.filter((item) => item.unread).length +
      taskNotifications.filter((item) => item.unread).length,
    syncLabel:
      workspaceSyncMode === "loading"
        ? "Sync checking"
        : workspaceSyncMode === "supabase"
          ? "Saved to Supabase"
          : "Saved locally",
  };
}
