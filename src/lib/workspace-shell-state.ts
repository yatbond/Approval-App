type UnreadNotification = {
  unread: boolean;
};

export type WorkspaceSyncMode = "loading" | "supabase" | "local";

export function getWorkspaceShellState({
  baseNotifications,
  taskNotifications,
  workspaceSyncMode,
}: {
  baseNotifications: UnreadNotification[];
  taskNotifications: UnreadNotification[];
  workspaceSyncMode: WorkspaceSyncMode;
}) {
  return {
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
