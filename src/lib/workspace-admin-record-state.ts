import type {
  BusinessUnit,
  UserRoleAssignment,
} from "./types.ts";

export type WorkspaceAdminRecordSyncMode = "loading" | "supabase" | "local";

export function getAdminRecordDeleteSyncState({
  workspaceSyncMode,
}: {
  workspaceSyncMode: WorkspaceAdminRecordSyncMode;
}) {
  if (workspaceSyncMode === "loading") {
    return {
      canContinue: false,
      shouldDeactivateRemote: false,
      error:
        "Workspace is still syncing. Try again in a moment before deleting admin records.",
    };
  }

  return {
    canContinue: true,
    shouldDeactivateRemote: workspaceSyncMode === "supabase",
    error: "",
  };
}

export function getUpdatedRoleAssignmentRecordState({
  roleAssignments,
  updater,
}: {
  roleAssignments: UserRoleAssignment[];
  updater: (items: UserRoleAssignment[]) => UserRoleAssignment[];
}) {
  return {
    roleAssignments: updater(roleAssignments),
  };
}

export function getUpdatedBusinessDirectoryRecordState({
  businessDirectory,
  updater,
}: {
  businessDirectory: BusinessUnit[];
  updater: (items: BusinessUnit[]) => BusinessUnit[];
}) {
  return {
    businessDirectory: updater(businessDirectory),
  };
}
