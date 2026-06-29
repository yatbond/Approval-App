import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import type { WorkspaceAdminDeactivation } from "@/lib/normalized-workspace-store";

export type WorkspaceSyncResult =
  | { mode: "supabase"; snapshot?: WorkspaceStateSnapshot }
  | { mode: "local"; reason?: string; snapshot?: null };

export async function loadRemoteWorkspaceState(): Promise<WorkspaceSyncResult> {
  try {
    const response = await fetch("/api/workspace", { method: "GET" });
    if (!response.ok) {
      return { mode: "local", reason: `GET failed: ${response.status}` };
    }

    return (await response.json()) as WorkspaceSyncResult;
  } catch (error) {
    return {
      mode: "local",
      reason: error instanceof Error ? error.message : "Remote load failed",
    };
  }
}

export async function saveRemoteWorkspaceState(
  snapshot: WorkspaceStateSnapshot,
): Promise<WorkspaceSyncResult> {
  try {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot }),
    });
    if (!response.ok) {
      return { mode: "local", reason: `POST failed: ${response.status}` };
    }

    return (await response.json()) as WorkspaceSyncResult;
  } catch (error) {
    return {
      mode: "local",
      reason: error instanceof Error ? error.message : "Remote save failed",
    };
  }
}

export async function deactivateRemoteWorkspaceAdminRecord(
  record: WorkspaceAdminDeactivation,
): Promise<WorkspaceSyncResult> {
  try {
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deactivate_admin_record", record }),
    });
    if (!response.ok) {
      const reason = await readFailureReason(response);
      return {
        mode: "local",
        reason: reason
          ? `PATCH failed: ${response.status} - ${reason}`
          : `PATCH failed: ${response.status}`,
      };
    }

    return (await response.json()) as WorkspaceSyncResult;
  } catch (error) {
    return {
      mode: "local",
      reason:
        error instanceof Error ? error.message : "Remote admin update failed",
    };
  }
}

async function readFailureReason(response: Response) {
  try {
    const payload = (await response.json()) as { reason?: unknown };
    return typeof payload.reason === "string" ? payload.reason : "";
  } catch {
    return "";
  }
}
