import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("workspace delegates admin and template mutations to a focused controller", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");
  const controllerSource = readFileSync(
    "src/app/use-workspace-admin-records.ts",
    "utf8",
  );

  assert.equal(workspaceSource.includes("useWorkspaceAdminRecords({"), true);
  assert.equal(workspaceSource.includes("getCreatedTemplateRecordState({"), false);
  assert.equal(workspaceSource.includes("deactivateRemoteWorkspaceAdminRecord("), false);
  assert.equal(controllerSource.includes("getCreatedTemplateRecordState({"), true);
  assert.equal(controllerSource.includes("deactivateRemoteWorkspaceAdminRecord(record)"), true);
  assert.equal(controllerSource.includes("requestConfirmation("), true);
});

test("template selection remains in the workspace because it resets request input", () => {
  const workspaceSource = readFileSync("src/app/approval-workspace.tsx", "utf8");

  assert.equal(workspaceSource.includes("function selectTemplateRecord("), true);
  assert.equal(workspaceSource.includes("setRequestParticipantEmails({});"), true);
});
