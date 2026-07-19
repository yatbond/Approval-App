import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all shared approval command routes fail closed on server rollout state", async () => {
  const routes = await Promise.all([
    source("../app/api/approval-requests/route.ts"),
    source("../app/api/approval-requests/[requestNo]/actions/route.ts"),
    source("../app/api/approval-requests/[requestNo]/collaboration/route.ts"),
  ]);
  for (const route of routes) {
    assert.match(route, /getApprovalRolloutDecision\(service, actor\.id\)/);
    assert.match(route, /if \(!rollout\.commandEnabled\)/);
    assert.match(route, /cutover_paused/);
    assert.match(route, /503/);
  }
});

test("expired fallback removes request caches and never seeds mock approvals", async () => {
  const [page, core, state, workspaceRoute] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/approval-workspace-core.tsx"),
    source("../app/use-approval-workspace-state.ts"),
    source("../app/api/workspace/route.ts"),
  ]);
  assert.match(page, /allowLegacyReadFallback=\{rollout\.legacyReadFallbackAllowed\}/);
  assert.match(core, /allowLegacyReadFallback: boolean/);
  assert.match(state, /approvalTasks: allowLegacyReadFallback \? approvalTasks : \[\]/);
  assert.match(state, /if \(!allowLegacyReadFallback\)[\s\S]*removeItem\(requestCacheKey\(activeUserEmail\)\)/);
  assert.match(workspaceRoute, /includeApprovalRuntime: false/);
});

test("rollout operations require an administrator and bounded request bodies", async () => {
  const route = await source("../app/api/admin/rollout/route.ts");
  assert.match(route, /if \(!actor\.isAdmin\)/);
  assert.match(route, /readBoundedJson\(request, 16_000\)/);
  assert.match(route, /set_approval_rollout_state/);
  assert.match(route, /audit_approval_runtime_projections/);
  assert.match(route, /reconcile_approval_legacy_runtime/);
});

test("the cutover migration freezes legacy writes and grants mutations only to service role", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260720080000_cutover_reconciliation_and_legacy_freeze.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /legacy_writes_frozen boolean not null default true check \(legacy_writes_frozen\)/);
  assert.match(migration, /reject_legacy_runtime_write/);
  assert.match(migration, /rollback_read_only/);
  assert.match(migration, /revoke all on function public\.set_approval_rollout_state[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.set_approval_rollout_state[\s\S]*to service_role/);
});

test("bounded reconciliation converges and quarantines unrecoverable template snapshots", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260720080000_cutover_reconciliation_and_legacy_freeze.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /from public\.approval_requests r[\s\S]*where[\s\S]*r\.task_snapshot ->> 'id' is distinct from r\.request_no/);
  assert.match(migration, /field_name = 'pinned_template_snapshot'[\s\S]*issue\.resolved_at is null/);
  assert.match(migration, /'The pinned template snapshot is incomplete and no matching template version is available\.'/);
  assert.match(migration, /order by exists \([\s\S]*approval_read_comparison_mismatches[\s\S]*resolved_at is null[\s\S]*\) desc/);
});
