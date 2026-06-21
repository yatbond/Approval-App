import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260621151500_harden_template_lifecycle_permissions.sql",
  "utf8",
);
const inactiveReadMigration = readFileSync(
  "supabase/migrations/20260621162000_allow_template_creator_inactive_reads.sql",
  "utf8",
);

test("migration allows template creators to insert and update their own template versions", () => {
  assert.match(
    migration,
    /create policy "template creators insert workflow template versions"/i,
  );
  assert.match(
    migration,
    /create policy "template creators update workflow template versions"/i,
  );
  assert.match(migration, /created_by = \(select auth\.uid\(\)\)/i);
});

test("migration lets authenticated users claim ownerless legacy template versions", () => {
  assert.match(
    migration,
    /create policy "users claim ownerless workflow template versions"/i,
  );
  assert.match(migration, /created_by is null/i);
});

test("migration lets template creators read owned inactive template versions for archive updates", () => {
  assert.match(
    inactiveReadMigration,
    /create policy "template creators read own workflow template versions"/i,
  );
  assert.match(inactiveReadMigration, /on public\.workflow_template_versions for select/i);
  assert.match(inactiveReadMigration, /created_by = \(select auth\.uid\(\)\)/i);
});
