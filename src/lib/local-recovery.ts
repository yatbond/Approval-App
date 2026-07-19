type StorageLike = Pick<Storage, "key" | "length" | "removeItem">;

const recoverableApprovalStoragePrefixes = [
  "approval-workflow-workspace-",
  "approval-upload-request-draft-",
  "approval-upload-request-drafts-",
  "approval-upload-current-autosave-id-",
  "approval-upload-active-draft-id-",
] as const;

export function clearRecoverableApprovalLocalState(storage: StorageLike) {
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => Boolean(key));

  const removedKeys = keys.filter((key) =>
    recoverableApprovalStoragePrefixes.some((prefix) => key.startsWith(prefix)),
  );
  removedKeys.forEach((key) => storage.removeItem(key));
  return removedKeys;
}
