import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace delegates upload draft lifecycle to a focused hook", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");
  const draftSource = readFileSync(
    "src/app/use-workspace-upload-drafts.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes("useWorkspaceUploadDrafts({"), true);
  assert.equal(workspaceSource.includes("loadSavedUploadRequestDrafts()"), false);
  assert.equal(workspaceSource.includes("saveSavedUploadRequestDraft({"), false);
  assert.equal(workspaceSource.includes("getUploadAutosaveIdentity({"), false);
  assert.equal(draftSource.includes("loadSavedUploadRequestDrafts()"), true);
  assert.equal(draftSource.includes("saveSavedUploadRequestDraft({"), true);
  assert.equal(draftSource.includes("getUploadAutosaveIdentity({"), true);
});

test("upload draft hook owns recoverable request state and stored cleanup", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");
  const draftSource = readFileSync(
    "src/app/use-workspace-upload-drafts.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes('const [savedUploadDrafts, setSavedUploadDrafts]'), false);
  assert.equal(workspaceSource.includes('const [uploadDraftRestoreToken, setUploadDraftRestoreToken]'), false);
  assert.equal(draftSource.includes('const [savedUploadDrafts, setSavedUploadDrafts]'), true);
  assert.equal(draftSource.includes('const [uploadDraftRestoreToken, setUploadDraftRestoreToken]'), true);
  assert.equal(draftSource.includes("deleteWorkspaceAttachmentFile({"), true);
});

test("workspace keeps only parser feedback adapters around draft actions", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");

  assert.equal(workspaceSource.includes("await confirmClearUploadRequestDraft()"), true);
  assert.equal(workspaceSource.includes("selectUploadRequestDraftRowState(rowId)"), true);
  assert.equal(workspaceSource.includes('setSubmissionMessage("Draft cleared.")'), true);
});
