import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260720103000_sync_runtime_projection_fields.sql",
    import.meta.url,
  ),
  "utf8",
);

test("authoritative commands synchronize denormalized runtime projection fields", () => {
  assert.match(migration, /before update of task_snapshot on public\.approval_requests/i);
  assert.match(migration, /new\.current_step :=[\s\S]*task_snapshot ->> 'currentStep'/i);
  assert.match(migration, /new\.due_label :=[\s\S]*task_snapshot ->> 'due'/i);
  assert.match(migration, /new\.value_label :=[\s\S]*task_snapshot ->> 'value'/i);
  assert.match(migration, /update public\.approval_requests[\s\S]*current_step = case/i);
  assert.match(migration, /audit_approval_runtime_projections\(null, 5000\)/i);
});
