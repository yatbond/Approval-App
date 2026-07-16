import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace delegates task decisions and collaboration to a focused controller", () => {
  const workspaceSource = readFileSync(
    "src/app/use-workspace-action-controller.ts",
    "utf8",
  );
  const controllerSource = readFileSync(
    "src/app/use-workspace-task-actions.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes("useWorkspaceTaskActions({"), true);
  assert.equal(workspaceSource.includes("getWorkspaceRecordTaskActionState({"), false);
  assert.equal(workspaceSource.includes("getTaskContributorUploadState({"), false);
  assert.equal(controllerSource.includes("getWorkspaceRecordTaskActionState({"), true);
  assert.equal(controllerSource.includes("getTaskContributorUploadState({"), true);
  assert.equal(controllerSource.includes("persistWorkspaceCollaborationTransition({"), true);
});

test("task action controller owns queue form state and pending submission state", () => {
  const workspaceSource = readFileSync(
    "src/app/use-workspace-action-controller.ts",
    "utf8",
  );
  const controllerSource = readFileSync(
    "src/app/use-workspace-task-actions.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes('const [comment, setComment] = useState("")'), false);
  assert.equal(
    controllerSource.includes('const [comment, setComment] = useState("")'),
    true,
  );
  assert.equal(controllerSource.includes("actionSubmissionTaskIdRef"), true);
});
