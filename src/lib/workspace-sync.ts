import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import type { WorkspaceAdminDeactivation } from "@/lib/normalized-workspace-store";
import type { WorkspaceSaveMonitoring } from "@/lib/workspace-autosave";

export type WorkspaceSyncResult =
  | {
      mode: "supabase";
      snapshot?: WorkspaceStateSnapshot;
      unchanged?: boolean;
      monitoring?: WorkspaceSaveMonitoring;
    }
  | {
      mode: "local";
      reason?: string;
      snapshot?: null;
      unchanged?: false;
      monitoring?: WorkspaceSaveMonitoring;
    };

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
  timeoutMs = 30_000,
): Promise<WorkspaceSyncResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const failure = await readWorkspaceSaveFailure(response);
      return {
        mode: "local",
        reason: failure.reason
          ? `POST failed: ${response.status} - ${failure.reason}`
          : `POST failed: ${response.status}`,
        ...(failure.monitoring ? { monitoring: failure.monitoring } : {}),
      };
    }

    return (await response.json()) as WorkspaceSyncResult;
  } catch (error) {
    return {
      mode: "local",
      reason: error instanceof Error ? error.message : "Remote save failed",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readWorkspaceSaveFailure(response: Response) {
  try {
    const payload = (await response.json()) as {
      reason?: unknown;
      monitoring?: WorkspaceSaveMonitoring;
    };
    return {
      reason: typeof payload.reason === "string" ? payload.reason : "",
      monitoring: payload.monitoring,
    };
  } catch {
    return { reason: "", monitoring: undefined };
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
