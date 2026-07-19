import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read(
  "../../supabase/migrations/20260719150248_authoritative_runtime_foundation.sql",
);

test("authoritative migration versions and normalizes request runtime", () => {
  for (const requiredFragment of [
    "state_version bigint not null default 0",
    "pinned_template_snapshot jsonb not null",
    "create table if not exists public.approval_request_participants",
    "create table if not exists public.approval_request_assignments",
    "create table if not exists public.approval_command_receipts",
    "create table if not exists public.approval_notifications",
    "create table if not exists public.approval_email_outbox",
    "create table if not exists public.approval_migration_issues",
  ]) {
    assert.ok(migration.includes(requiredFragment), requiredFragment);
  }
});

test("command primitive locks, versions, deduplicates, and commits atomically", () => {
  assert.match(migration, /for update;/i);
  assert.match(
    migration,
    /unique \(approval_request_id, actor_id, idempotency_key\)/i,
  );
  assert.match(migration, /'outcome', 'idempotency_conflict'/i);
  assert.match(migration, /'outcome', 'stale'/i);
  assert.match(migration, /state_version = r\.state_version \+ 1/i);
  assert.match(migration, /insert into public\.approval_request_events/i);
  assert.match(migration, /insert into public\.approval_notifications/i);
  assert.match(migration, /insert into public\.approval_email_outbox/i);
  assert.match(migration, /update public\.approval_request_assignments/i);
  assert.match(migration, /insert into public\.approval_request_assignments/i);
  assert.match(migration, /insert into public\.approval_request_participants/i);
  assert.match(migration, /v_is_reassignment_candidate/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(
    migration,
    /grant execute on function public\.commit_approval_request_command[\s\S]*to service_role/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.commit_approval_request_command[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /if trim\(p_action\) not in \([\s\S]*'approve'[\s\S]*'request_correction'[\s\S]*'escalate'[\s\S]*return jsonb_build_object\('outcome', 'invalid_command'\)/i,
  );
});

test("request and event tables are read-only to browser roles", () => {
  assert.match(
    migration,
    /revoke all privileges on table[\s\S]*public\.approval_requests[\s\S]*from anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select on table[\s\S]*public\.approval_requests[\s\S]*to authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select,\s*)?(?:insert|update|delete)[^;]*public\.approval_request_events[^;]*authenticated/i,
  );
  assert.match(migration, /approval_request_events_append_only/i);
  assert.match(migration, /workflow_notification_events_append_only/i);
});

test("workspace persistence calls one configuration RPC and contains no runtime writes", () => {
  const store = read("./normalized-workspace-store.ts");
  const saveFunction = store.slice(
    store.indexOf("export async function saveNormalizedWorkspaceState"),
    store.indexOf("export async function deactivateWorkspaceAdminRecord"),
  );

  assert.match(saveFunction, /rpc\("save_workspace_configuration"/);
  assert.doesNotMatch(saveFunction, /\.from\(/);
  assert.doesNotMatch(saveFunction, /approvalRequests:/);
  assert.doesNotMatch(saveFunction, /approvalRequestEvents:/);
  assert.doesNotMatch(saveFunction, /approvalRequestAttachments:/);
});

test("normalized loading preserves attachment URLs and repairs malformed JSON", () => {
  const store = read("./normalized-workspace-store.ts");

  assert.match(store, /storage_path,public_url,uploaded_by_email/);
  assert.match(store, /publicUrl: attachment\.public_url/);
  assert.match(store, /isJsonObject\(row\.template_snapshot\)/);
  assert.match(store, /isJsonObject\(row\.task_snapshot\)/);
});
