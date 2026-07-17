import { createHash } from "node:crypto";
import {
  serializeWorkspaceState,
  type WorkspaceStateSnapshot,
} from "./workspace-persistence.ts";

export function createWorkspaceSnapshotHash(snapshot: WorkspaceStateSnapshot) {
  return createHash("sha256")
    .update(serializeWorkspaceState(snapshot))
    .digest("hex");
}
