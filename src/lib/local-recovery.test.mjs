import assert from "node:assert/strict";
import test from "node:test";
import { clearRecoverableApprovalLocalState } from "./local-recovery.ts";

test("clears only recoverable approval caches", () => {
  const values = new Map([
    ["approval-workflow-workspace-v1", "bad snapshot"],
    ["approval-upload-request-draft-v1:user@example.com", "draft"],
    ["approval-app-theme", "dark"],
    ["unrelated", "keep"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key(index) {
      return Array.from(values.keys())[index] || null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };

  const removed = clearRecoverableApprovalLocalState(storage);

  assert.deepEqual(removed.sort(), [
    "approval-upload-request-draft-v1:user@example.com",
    "approval-workflow-workspace-v1",
  ]);
  assert.equal(values.get("approval-app-theme"), "dark");
  assert.equal(values.get("unrelated"), "keep");
});
