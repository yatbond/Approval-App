import type {
  BusinessUnit,
  UserRoleAssignment,
} from "./types.ts";
import type { WorkspaceAdminDeactivation } from "./normalized-workspace-store.ts";

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

export function getAdminRecordDeleteFailureState({
  record,
  reason,
}: {
  record: WorkspaceAdminDeactivation;
  reason: string;
}) {
  if (record.type === "template" && /No active template version matched/i.test(reason)) {
    return {
      canContinue: true,
      error:
        "Remote template version was already missing; removed locally and will resync.",
    };
  }

  if (
    record.type === "template" &&
    /row-level security policy/i.test(reason) &&
    /workflow_template_versions/i.test(reason)
  ) {
    return {
      canContinue: true,
      error:
        "Remote template version soft-delete was blocked by row-level security; removed locally and will resync from the snapshot backup.",
    };
  }

  return {
    canContinue: false,
    error: reason || "Unable to persist admin delete.",
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
