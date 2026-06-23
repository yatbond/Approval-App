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
const uploadDraftMigration = readFileSync(
  "supabase/migrations/20260623073000_create_upload_request_drafts.sql",
  "utf8",
);
const attachmentStorageReadMigration = readFileSync(
  "supabase/migrations/20260623061935_allow_request_participant_storage_reads.sql",
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

test("migration lets users access only their own upload request drafts", () => {
  assert.match(uploadDraftMigration, /create table if not exists public\.upload_request_drafts/i);
  assert.match(uploadDraftMigration, /alter table public\.upload_request_drafts enable row level security/i);
  assert.match(uploadDraftMigration, /create policy "users read own upload request drafts"/i);
  assert.match(uploadDraftMigration, /create policy "users insert own upload request drafts"/i);
  assert.match(uploadDraftMigration, /create policy "users update own upload request drafts"/i);
  assert.match(uploadDraftMigration, /create policy "users delete own upload request drafts"/i);
  assert.match(uploadDraftMigration, /owner_user_id = \(select auth\.uid\(\)\)/i);
});

test("migration lets request participants read submitted attachment storage objects", () => {
  assert.match(
    attachmentStorageReadMigration,
    /create policy "approval document owners and request participants read"/i,
  );
  assert.match(attachmentStorageReadMigration, /bucket_id = 'approval-documents'/i);
  assert.match(attachmentStorageReadMigration, /owner_id = \(select auth\.uid\(\)::text\)/i);
  assert.match(attachmentStorageReadMigration, /public\.approval_request_attachments/i);
  assert.match(attachmentStorageReadMigration, /public\.approval_requests/i);
  assert.match(attachmentStorageReadMigration, /a\.storage_path = storage\.objects\.name/i);
  assert.match(attachmentStorageReadMigration, /= any\(r\.participants\)/i);
});
