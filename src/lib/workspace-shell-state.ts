import type { WorkspaceAutosaveMonitor } from "./workspace-autosave.ts";

type UnreadNotification = {
  unread: boolean;
};

type RecipientNotification = UnreadNotification & {
  recipientEmail: string;
};

export type WorkspaceSyncMode = "loading" | "supabase" | "local";

export function getUserWorkspaceNotifications<T extends RecipientNotification>(
  notifications: T[],
  userEmail: string,
) {
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  return notifications.filter(
    (notification) =>
      notification.recipientEmail.trim().toLowerCase() === normalizedUserEmail,
  );
}

export function getWorkspaceShellState({
  baseNotifications,
  draftItemCount = 0,
  taskNotifications,
  workspaceAutosaveStatus = "idle",
  workspaceSyncMode,
}: {
  baseNotifications: UnreadNotification[];
  draftItemCount?: number;
  taskNotifications: UnreadNotification[];
  workspaceAutosaveStatus?: WorkspaceAutosaveMonitor["status"];
  workspaceSyncMode: WorkspaceSyncMode;
}) {
  return {
    draftItemCount: Math.max(0, Math.floor(draftItemCount)),
    unreadCount:
      baseNotifications.filter((item) => item.unread).length +
      taskNotifications.filter((item) => item.unread).length,
    syncLabel:
      workspaceAutosaveStatus === "saving"
        ? "Saving..."
        : workspaceAutosaveStatus === "retrying"
          ? "Retrying autosave"
          : workspaceSyncMode === "loading"
        ? "Sync checking"
        : workspaceSyncMode === "supabase"
          ? "Saved to Supabase"
          : "Saved locally",
  };
}
