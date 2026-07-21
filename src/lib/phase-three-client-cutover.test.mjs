import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("workspace snapshots cannot carry authoritative runtime tasks", () => {
  const route = read("../app/api/workspace/route.ts");
  const store = read("./normalized-workspace-store.ts");
  assert.match(route, /configurationSnapshot = \{[\s\S]*approvalTasks: \[\]/);
  assert.match(route, /snapshot = \{ \.\.\.incomingSnapshot, approvalTasks: \[\] \}/);
  assert.doesNotMatch(route, /mergeExternalFormWorkspaceState/);

  const save = store.slice(
    store.indexOf("export async function saveNormalizedWorkspaceState"),
    store.indexOf("export async function deactivateWorkspaceAdminRecord"),
  );
  assert.doesNotMatch(save, /approval_requests|approval_request_events|approval_request_attachments/i);
});

test("canonical requests refresh on load, focus, visibility restore, and reconnect", () => {
  const state = read("../app/use-approval-workspace-state.ts");
  assert.match(state, /loadCanonicalApprovalTasks\("tracking"\)/);
  assert.match(state, /loadCanonicalApprovalRequest\(selectedTaskId\)/);
  assert.match(state, /addEventListener\("focus", refresh\)/);
  assert.match(state, /addEventListener\("online", refresh\)/);
  assert.match(state, /addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(state, /requestCacheVersion = 2/);
  assert.match(state, /configurationSnapshot = \{ \.\.\.snapshot, approvalTasks: \[\] \}/);
  assert.doesNotMatch(state, /applyEscalationChecks|setInterval\(applyChecks/);
});

test("canonical action retries reuse a key and conflicts install the server task", () => {
  const actions = read("../app/use-workspace-task-actions.ts");
  assert.match(actions, /executeCanonicalApprovalAction/);
  assert.match(
    actions,
    /const nextState = isCanonicalTask\s*\? null\s*: getWorkspaceRecordTaskActionState/,
  );
  assert.match(actions, /retryCommandRef\.current\?\.signature === commandSignature/);
  assert.match(actions, /error instanceof ApprovalApiError && error\.canonicalTask/);
  assert.match(actions, /error\.status === 409/);
  assert.match(actions, /if \(!isCanonicalTask\) \{[\s\S]*persistWorkspaceSnapshot/);
  assert.doesNotMatch(
    actions.slice(
      actions.indexOf("if (isCanonicalTask)"),
      actions.indexOf("} else {", actions.indexOf("if (isCanonicalTask)")),
    ),
    /persistWorkspaceSnapshot|sendWorkflowEmailNotifications/,
  );
});

test("queue buttons and submissions consume server authority", () => {
  const queue = read("../app/queue-view.tsx");
  const pipeline = read("../app/use-workspace-request-pipeline.ts");
  assert.match(queue, /selectedTask\.availableActions/);
  assert.match(pipeline, /submitCanonicalApprovalRequest/);
  assert.match(pipeline, /submissionRetryKeysRef/);
  assert.doesNotMatch(pipeline, /sendWorkflowEmailNotifications/);
  assert.match(pipeline, /selectedTemplate\.databaseVersionId/);
});
