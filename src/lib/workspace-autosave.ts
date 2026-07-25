const initialAutosaveDelayMs = 30_000;
const maximumAutosaveDelayMs = 300_000;

export type WorkspaceSaveMonitoring = {
  payloadBytes: number;
  persistedBytes: number;
  durationMs: number;
  unchanged: boolean;
  assetsUploaded: number;
  removedBase64Bytes: number;
};

export type WorkspaceAutosaveMonitor = {
  status: "idle" | "saving" | "saved" | "retrying" | "failed";
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  payloadBytes: number;
  persistedBytes: number;
  durationMs: number;
  retryCount: number;
  failureCount: number;
  unchangedCount: number;
  assetsUploaded: number;
  removedBase64Bytes: number;
  error?: string;
};

export const initialWorkspaceAutosaveMonitor: WorkspaceAutosaveMonitor = {
  status: "idle",
  payloadBytes: 0,
  persistedBytes: 0,
  durationMs: 0,
  retryCount: 0,
  failureCount: 0,
  unchangedCount: 0,
  assetsUploaded: 0,
  removedBase64Bytes: 0,
};

export function getWorkspaceAutosaveDelay(failureCount: number) {
  const normalizedFailureCount = Math.max(0, Math.floor(failureCount));
  return Math.min(
    initialAutosaveDelayMs * 2 ** normalizedFailureCount,
    maximumAutosaveDelayMs,
  );
}

export function formatWorkspaceAutosaveBytes(bytes: number) {
  const normalizedBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (normalizedBytes < 1024) {
    return `${Math.round(normalizedBytes)} B`;
  }
  if (normalizedBytes < 1024 * 1024) {
    return `${(normalizedBytes / 1024).toFixed(1)} KB`;
  }
  return `${(normalizedBytes / (1024 * 1024)).toFixed(2)} MB`;
}
