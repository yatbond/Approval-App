const initialAutosaveDelayMs = 30_000;
const maximumAutosaveDelayMs = 300_000;

export function getWorkspaceAutosaveDelay(failureCount: number) {
  const normalizedFailureCount = Math.max(0, Math.floor(failureCount));
  return Math.min(
    initialAutosaveDelayMs * 2 ** normalizedFailureCount,
    maximumAutosaveDelayMs,
  );
}
